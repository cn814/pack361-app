-- RSVP limits with a waitlist, and "Ready to go?" reminders for leaders.
--
--   1. events.rsvp_limit: most people (scouts + adults) who can come. null = no limit.
--   2. event_rsvps.waitlisted: a "yes" that didn't fit. They keep their numbers and their place
--      (waitlisted_at). When someone cancels, cuts their numbers, or a leader raises the limit,
--      waitlisted families move in, in order, while they fit. promoted_at marks a move-in so the
--      app can send "You're in!" (promoted_notified_at is set once that alert has gone out).
--   3. set_rsvp(): same as 20261003000400_rsvp_all_day.sql, plus the limit and the waitlist.
--      A family already in can't grow past the spots left (they keep their spot instead).
--   4. Event charges only for families who are in: sync_event_charge() cancels an open RSVP
--      charge while a family is waitlisted, and makes it when they move in.
--   5. rsvp_counts(): counts the waitlist on its own, with the limit and the caller's place in line.
--   6. going_to_event() (the Signal group link): waitlisted families aren't going yet.
--   7. event_reminders: when leaders last sent each "Ready to go?" reminder for an event, so the
--      same reminder can go out at most once every 12 hours.
begin;

-- -----------------------------------------------------------------------------
-- 1. The limit
-- -----------------------------------------------------------------------------
alter table public.events add column if not exists rsvp_limit int;
alter table public.events drop constraint if exists events_rsvp_limit_check;
alter table public.events add constraint events_rsvp_limit_check check (rsvp_limit between 1 and 500);

-- -----------------------------------------------------------------------------
-- 2. The waitlist
-- -----------------------------------------------------------------------------
alter table public.event_rsvps
    add column if not exists waitlisted           boolean not null default false,
    add column if not exists waitlisted_at        timestamptz,
    add column if not exists promoted_at          timestamptz,
    add column if not exists promoted_notified_at timestamptz;
alter table public.event_rsvps drop constraint if exists event_rsvps_waitlist_check;
alter table public.event_rsvps add constraint event_rsvps_waitlist_check
    check (not waitlisted or (status = 'yes' and waitlisted_at is not null));
create index if not exists event_rsvps_waitlist_idx on public.event_rsvps (event_id, waitlisted_at) where waitlisted;
create index if not exists event_rsvps_promoted_idx on public.event_rsvps (event_id)
    where promoted_at is not null and promoted_notified_at is null;

-- One family's answer at a time per event, so two families can't both take the last spot.
create or replace function private.lock_event_rsvps(p_event_id uuid)
returns void language sql volatile security definer set search_path = '' as $$
    select pg_advisory_xact_lock(hashtextextended('event_rsvps:' || p_event_id::text, 0))
$$;
revoke execute on function private.lock_event_rsvps(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. Event charges: only for families who are in (not waitlisted)
-- -----------------------------------------------------------------------------
-- Same as 20261003000100_review_db_fixes.sql, except a waitlisted "yes" is treated like "no"
-- (its open RSVP charge is canceled; nothing is billed until the family moves in). The charge
-- is added by the adult who answered, since a move-in can happen on someone else's change.
create or replace function private.sync_event_charge(p_event_id uuid, p_family_id uuid, p_adult_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
    e public.events;
    r public.event_rsvps;
    c public.charges;
    has_fee boolean;
    amt int;
begin
    select * into e from public.events where id = p_event_id;
    if not found then return; end if;
    has_fee := num_nonnulls(e.fee_family_cents, e.fee_scout_cents, e.fee_adult_cents) > 0;
    if p_family_id is not null then
        select * into r from public.event_rsvps where event_id = p_event_id and family_id = p_family_id;
        select * into c from public.charges
         where kind = 'event' and source = 'rsvp' and event_id = p_event_id and status <> 'canceled'
           and family_id = p_family_id and scout_id is null and adult_id is null;
    else
        select * into r from public.event_rsvps where event_id = p_event_id and family_id is null and adult_id = p_adult_id;
        select * into c from public.charges
         where kind = 'event' and source = 'rsvp' and event_id = p_event_id and status <> 'canceled'
           and family_id is null and adult_id = p_adult_id and scout_id is null;
    end if;
    if c.id is not null and c.status <> 'open' then return; end if;                       -- reported, paid or waived
    if c.id is not null and private.claim_live(c.pending_payment_id, c.pending_since) then return; end if;   -- in checkout

    if not has_fee or r.id is null or r.status = 'no' or r.waitlisted then
        if c.id is not null then
            update public.charges set status = 'canceled' where id = c.id;
        end if;
        return;
    end if;
    if r.status <> 'yes' then return; end if;

    amt := least(coalesce(e.fee_family_cents, 0) + r.scouts * coalesce(e.fee_scout_cents, 0)
                 + r.adults * coalesce(e.fee_adult_cents, 0), 100000);
    if c.id is null then
        if amt > 0 then
            insert into public.charges (family_id, adult_id, kind, title, event_id, amount_cents, due_on, created_by, source)
            values (p_family_id, case when p_family_id is null then p_adult_id end, 'event', left(e.title, 120), e.id, amt,
                    coalesce(e.rsvp_by, (e.starts_at at time zone 'America/New_York')::date),
                    coalesce(r.adult_id, private.current_adult_id()), 'rsvp')
            on conflict do nothing;
        end if;
    elsif amt = 0 then
        update public.charges set status = 'canceled' where id = c.id;
    elsif c.amount_cents <> amt then
        update public.charges set amount_cents = amt where id = c.id;
    end if;
end;
$$;
revoke execute on function private.sync_event_charge(uuid, uuid, uuid) from public, anon, authenticated;

-- Move waitlisted families in, first come first served, while they fit (stops at the first one
-- that doesn't, so nobody is skipped). Not once the event is over or archived.
create or replace function private.promote_waitlist(p_event_id uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare
    e public.events;
    taken int;
    r record;
    n int := 0;
begin
    select * into e from public.events where id = p_event_id;
    if not found or e.archived_at is not null or coalesce(e.ends_at, e.starts_at) < now() then return 0; end if;
    perform private.lock_event_rsvps(p_event_id);
    select coalesce(sum(x.scouts + x.adults), 0) into taken
      from public.event_rsvps x where x.event_id = p_event_id and x.status = 'yes' and not x.waitlisted;
    for r in
        select x.id, x.family_id, x.adult_id, x.scouts, x.adults
          from public.event_rsvps x
         where x.event_id = p_event_id and x.status = 'yes' and x.waitlisted
         order by x.waitlisted_at, x.id
    loop
        exit when e.rsvp_limit is not null and taken + r.scouts + r.adults > e.rsvp_limit;
        update public.event_rsvps
           set waitlisted = false, waitlisted_at = null, promoted_at = now(), promoted_notified_at = null
         where id = r.id;
        taken := taken + r.scouts + r.adults;
        n := n + 1;
        perform private.sync_event_charge(p_event_id, r.family_id, case when r.family_id is null then r.adult_id end);
    end loop;
    return n;
end;
$$;
revoke execute on function private.promote_waitlist(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Answering
-- -----------------------------------------------------------------------------
create or replace function public.set_rsvp(p_event_id uuid, p_status text, p_scouts int, p_adults int, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare
    e public.events;
    me uuid := private.current_adult_id();
    fam uuid := private.my_family_id();
    prev public.event_rsvps;
    v_scouts int;
    v_adults int;
    v_note text := left(nullif(trim(p_note), ''), 300);
    v_wait boolean := false;
    v_wait_at timestamptz;
    taken int;
    ahead boolean;
begin
    if me is null then raise exception 'Not on the pack roster' using errcode = '42501'; end if;
    if not private.can_see_event(p_event_id) then raise exception 'Event not found' using errcode = 'P0002'; end if;
    select * into e from public.events where id = p_event_id;
    if not e.rsvp_enabled then raise exception 'This event is not taking RSVPs' using errcode = '22023'; end if;
    -- All-day events stay open through their last day (Eastern); timed events until they end.
    if e.archived_at is not null
       or (case when e.all_day
                then (coalesce(e.ends_at, e.starts_at) at time zone 'America/New_York')::date
                     < (now() at time zone 'America/New_York')::date
                else coalesce(e.ends_at, e.starts_at) < now() end)
       or (e.rsvp_by is not null and e.rsvp_by < (now() at time zone 'America/New_York')::date) then
        raise exception 'RSVPs for this event are closed' using errcode = '22023';
    end if;
    if p_status not in ('yes', 'maybe', 'no') then raise exception 'Pick yes, maybe or no' using errcode = '22023'; end if;

    v_scouts := case when p_status = 'no' or fam is null then 0 else least(greatest(coalesce(p_scouts, 0), 0), 20) end;
    v_adults := case when p_status = 'no' then 0
                     else least(greatest(coalesce(p_adults, case when fam is null then 1 else 0 end), 0), 20) end;

    perform private.lock_event_rsvps(p_event_id);
    if fam is not null then
        select * into prev from public.event_rsvps where event_id = p_event_id and family_id = fam;
    else
        select * into prev from public.event_rsvps where event_id = p_event_id and family_id is null and adult_id = me;
    end if;

    if p_status = 'yes' and e.rsvp_limit is not null then
        if prev.id is not null and prev.status = 'yes' and prev.waitlisted then
            -- Already on the waitlist: keep their place (they may move in below if they now fit).
            v_wait := true;
            v_wait_at := prev.waitlisted_at;
        else
            select coalesce(sum(x.scouts + x.adults), 0) into taken
              from public.event_rsvps x
             where x.event_id = p_event_id and x.status = 'yes' and not x.waitlisted and x.id is distinct from prev.id;
            if prev.id is not null and prev.status = 'yes' then
                -- Already in: they can change their numbers, but not grow past the spots left.
                if taken + v_scouts + v_adults > e.rsvp_limit and v_scouts + v_adults > prev.scouts + prev.adults then
                    raise exception 'Only % spots left for your family', greatest(e.rsvp_limit - taken, 0)
                        using errcode = '22023', hint = 'rsvp_full';
                end if;
            else
                -- New "yes": behind anyone already waiting, or on the waitlist if it doesn't fit.
                select exists (select 1 from public.event_rsvps x
                                where x.event_id = p_event_id and x.status = 'yes' and x.waitlisted and x.id is distinct from prev.id)
                  into ahead;
                if ahead or taken + v_scouts + v_adults > e.rsvp_limit then
                    v_wait := true;
                    v_wait_at := now();
                end if;
            end if;
        end if;
    end if;

    if fam is not null then
        insert into public.event_rsvps (event_id, family_id, adult_id, status, scouts, adults, note, waitlisted, waitlisted_at)
        values (p_event_id, fam, me, p_status, v_scouts, v_adults, v_note, v_wait, v_wait_at)
        on conflict (event_id, family_id) where family_id is not null
        do update set adult_id = excluded.adult_id, status = excluded.status, scouts = excluded.scouts,
                      adults = excluded.adults, note = excluded.note, updated_at = now(),
                      waitlisted = excluded.waitlisted, waitlisted_at = excluded.waitlisted_at;
    else
        insert into public.event_rsvps (event_id, family_id, adult_id, status, scouts, adults, note, waitlisted, waitlisted_at)
        values (p_event_id, null, me, p_status, 0, v_adults, v_note, v_wait, v_wait_at)
        on conflict (event_id, adult_id) where family_id is null
        do update set status = excluded.status, adults = excluded.adults, note = excluded.note, updated_at = now(),
                      waitlisted = excluded.waitlisted, waitlisted_at = excluded.waitlisted_at;
    end if;
    perform private.sync_event_charge(p_event_id, fam, case when fam is null then me end);
    -- A cancel or smaller number may open spots for families waiting.
    perform private.promote_waitlist(p_event_id);
end;
$$;
revoke execute on function public.set_rsvp(uuid, text, int, int, text) from public, anon;
grant execute on function public.set_rsvp(uuid, text, int, int, text) to authenticated;

-- A leader removing an RSVP cancels its open charge (as before) and may let the waitlist in.
create or replace function private.rsvp_deleted()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    perform private.sync_event_charge(old.event_id, old.family_id, case when old.family_id is null then old.adult_id end);
    if old.status = 'yes' and not old.waitlisted then
        perform private.promote_waitlist(old.event_id);
    end if;
    return old;
end;
$$;
revoke execute on function private.rsvp_deleted() from public, anon, authenticated;

-- A leader raising (or removing) the limit lets the waitlist in.
create or replace function private.event_limit_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    perform private.promote_waitlist(new.id);
    return new;
end;
$$;
revoke execute on function private.event_limit_changed() from public, anon, authenticated;
drop trigger if exists events_limit_changed on public.events;
create trigger events_limit_changed after update of rsvp_limit on public.events
    for each row when (old.rsvp_limit is distinct from new.rsvp_limit)
    execute function private.event_limit_changed();

-- -----------------------------------------------------------------------------
-- 5. Headcount, with the waitlist counted on its own
-- -----------------------------------------------------------------------------
-- The caller's place on the waitlist (1 = next in), or null when they aren't on it.
create or replace function private.my_waitlist_spot(p_event_id uuid)
returns int language sql stable security definer set search_path = '' as $$
    select (select count(*)::int from public.event_rsvps o
             where o.event_id = p_event_id and o.status = 'yes' and o.waitlisted
               and (o.waitlisted_at, o.id) <= (m.waitlisted_at, m.id))
      from public.event_rsvps m
     where m.event_id = p_event_id and m.status = 'yes' and m.waitlisted
       and ((m.family_id is not null and m.family_id = private.my_family_id())
            or (m.family_id is null and m.adult_id = private.current_adult_id()))
$$;
revoke execute on function private.my_waitlist_spot(uuid) from public, anon;
grant execute on function private.my_waitlist_spot(uuid) to authenticated;

-- The return columns change, so the function is replaced (numbers only, never names).
-- families_yes, scouts and adults are the families who are in; the waitlist is counted apart.
drop function if exists public.rsvp_counts(uuid);
create function public.rsvp_counts(p_event_id uuid)
returns table (families_yes bigint, families_maybe bigint, families_no bigint, scouts bigint, adults bigint,
               families_waitlist bigint, waitlist_people bigint, rsvp_limit int, my_waitlist_spot int)
language sql stable security definer set search_path = '' as $$
    select count(*) filter (where r.status = 'yes' and not r.waitlisted),
           count(*) filter (where r.status = 'maybe'),
           count(*) filter (where r.status = 'no'),
           coalesce(sum(r.scouts) filter (where r.status = 'yes' and not r.waitlisted), 0),
           coalesce(sum(r.adults) filter (where r.status = 'yes' and not r.waitlisted), 0),
           count(*) filter (where r.status = 'yes' and r.waitlisted),
           coalesce(sum(r.scouts + r.adults) filter (where r.status = 'yes' and r.waitlisted), 0),
           (select e.rsvp_limit from public.events e where e.id = p_event_id and private.can_see_event(p_event_id)),
           (select private.my_waitlist_spot(p_event_id))
      from public.event_rsvps r
     where r.event_id = p_event_id and private.can_see_event(p_event_id)
$$;
revoke execute on function public.rsvp_counts(uuid) from public, anon;
grant execute on function public.rsvp_counts(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. The Signal group link is for families who are in
-- -----------------------------------------------------------------------------
create or replace function private.going_to_event(p_event_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (
        select 1 from public.event_rsvps r
         where r.event_id = p_event_id and r.status = 'yes' and not r.waitlisted
           and ((r.family_id is not null and r.family_id = private.my_family_id())
                or (r.family_id is null and r.adult_id = private.current_adult_id())))
$$;

-- -----------------------------------------------------------------------------
-- 7. "Ready to go?" reminders: at most once per kind per event every 12 hours
-- -----------------------------------------------------------------------------
create table if not exists public.event_reminders (
    event_id  uuid not null references public.events(id) on delete cascade,
    kind      text not null check (kind in ('medical', 'slips', 'pay', 'jobs')),
    sent_at   timestamptz not null default now(),
    sent_by   uuid references public.adults(id) on delete set null,
    families  int not null default 0 check (families between 0 and 1000),
    primary key (event_id, kind)
);
revoke all on public.event_reminders from anon, authenticated;
grant select on public.event_reminders to authenticated;   -- sending goes through claim_event_reminder()
alter table public.event_reminders enable row level security;
drop policy if exists event_reminders_read on public.event_reminders;
create policy event_reminders_read on public.event_reminders for select to authenticated
    using ((select private.is_leader()));

-- Leaders: may this reminder go out now? Records it and returns true, or false when the same
-- reminder went out for this event in the last 12 hours.
create or replace function public.claim_event_reminder(p_event_id uuid, p_kind text, p_families int)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare ok boolean;
begin
    if not private.is_leader() then raise exception 'Leaders only' using errcode = '42501'; end if;
    if not private.can_see_event(p_event_id) then raise exception 'Event not found' using errcode = 'P0002'; end if;
    if p_kind not in ('medical', 'slips', 'pay', 'jobs') then raise exception 'Unknown reminder' using errcode = '22023'; end if;
    insert into public.event_reminders as er (event_id, kind, sent_at, sent_by, families)
    values (p_event_id, p_kind, now(), private.current_adult_id(), least(greatest(coalesce(p_families, 0), 0), 1000))
    on conflict (event_id, kind) do update
       set sent_at = now(), sent_by = excluded.sent_by, families = excluded.families
     where er.sent_at < now() - interval '12 hours'
    returning true into ok;
    return coalesce(ok, false);
end;
$$;
revoke execute on function public.claim_event_reminder(uuid, text, int) from public, anon;
grant execute on function public.claim_event_reminder(uuid, text, int) to authenticated;

commit;
