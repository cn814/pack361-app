-- RSVPs count brothers and sisters who aren't scouts.
--
-- Siblings are welcome at campouts and other family events, so a family's RSVP now says how
-- many scouts, siblings and adults are coming.
--   1. event_rsvps.siblings (0-20; only a family brings them).
--   2. set_rsvp(): same as 20261012000100_ready_and_waitlist.sql, with p_siblings (default 0, so
--      callers that don't send it keep working). The old five-argument version is dropped.
--   3. The limit ("most people who can come") counts siblings too, when answering, when the
--      waitlist moves in (promote_waitlist) and in rsvp_counts' waitlist_people.
--   4. rsvp_counts() adds a siblings total (families who are in), as its last column.
-- Event fees are unchanged: there's no per-sibling price.
begin;

alter table public.event_rsvps add column if not exists siblings int not null default 0;
alter table public.event_rsvps drop constraint if exists event_rsvps_siblings_check;
alter table public.event_rsvps add constraint event_rsvps_siblings_check check (siblings between 0 and 20);

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
    select coalesce(sum(x.scouts + x.adults + x.siblings), 0) into taken
      from public.event_rsvps x where x.event_id = p_event_id and x.status = 'yes' and not x.waitlisted;
    for r in
        select x.id, x.family_id, x.adult_id, x.scouts, x.adults, x.siblings
          from public.event_rsvps x
         where x.event_id = p_event_id and x.status = 'yes' and x.waitlisted
         order by x.waitlisted_at, x.id
    loop
        exit when e.rsvp_limit is not null and taken + r.scouts + r.adults + r.siblings > e.rsvp_limit;
        update public.event_rsvps
           set waitlisted = false, waitlisted_at = null, promoted_at = now(), promoted_notified_at = null
         where id = r.id;
        taken := taken + r.scouts + r.adults + r.siblings;
        n := n + 1;
        perform private.sync_event_charge(p_event_id, r.family_id, case when r.family_id is null then r.adult_id end);
    end loop;
    return n;
end;
$$;
revoke execute on function private.promote_waitlist(uuid) from public, anon, authenticated;

drop function if exists public.set_rsvp(uuid, text, int, int, text);
create or replace function public.set_rsvp(p_event_id uuid, p_status text, p_scouts int, p_adults int, p_note text, p_siblings int default 0)
returns void language plpgsql security definer set search_path = '' as $$
declare
    e public.events;
    me uuid := private.current_adult_id();
    fam uuid := private.my_family_id();
    prev public.event_rsvps;
    v_scouts int;
    v_adults int;
    v_siblings int;
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
    -- Brothers and sisters who aren't scouts: only a family brings them.
    v_siblings := case when p_status = 'no' or fam is null then 0 else least(greatest(coalesce(p_siblings, 0), 0), 20) end;

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
            select coalesce(sum(x.scouts + x.adults + x.siblings), 0) into taken
              from public.event_rsvps x
             where x.event_id = p_event_id and x.status = 'yes' and not x.waitlisted and x.id is distinct from prev.id;
            if prev.id is not null and prev.status = 'yes' then
                -- Already in: they can change their numbers, but not grow past the spots left.
                if taken + v_scouts + v_adults + v_siblings > e.rsvp_limit
                   and v_scouts + v_adults + v_siblings > prev.scouts + prev.adults + prev.siblings then
                    raise exception 'Only % spots left for your family', greatest(e.rsvp_limit - taken, 0)
                        using errcode = '22023', hint = 'rsvp_full';
                end if;
            else
                -- New "yes": behind anyone already waiting, or on the waitlist if it doesn't fit.
                select exists (select 1 from public.event_rsvps x
                                where x.event_id = p_event_id and x.status = 'yes' and x.waitlisted and x.id is distinct from prev.id)
                  into ahead;
                if ahead or taken + v_scouts + v_adults + v_siblings > e.rsvp_limit then
                    v_wait := true;
                    v_wait_at := now();
                end if;
            end if;
        end if;
    end if;

    if fam is not null then
        insert into public.event_rsvps (event_id, family_id, adult_id, status, scouts, adults, siblings, note, waitlisted, waitlisted_at)
        values (p_event_id, fam, me, p_status, v_scouts, v_adults, v_siblings, v_note, v_wait, v_wait_at)
        on conflict (event_id, family_id) where family_id is not null
        do update set adult_id = excluded.adult_id, status = excluded.status, scouts = excluded.scouts,
                      adults = excluded.adults, siblings = excluded.siblings, note = excluded.note, updated_at = now(),
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
revoke execute on function public.set_rsvp(uuid, text, int, int, text, int) from public, anon;
grant execute on function public.set_rsvp(uuid, text, int, int, text, int) to authenticated;

-- numbers only, never names. The return columns change, so the function is replaced.
drop function if exists public.rsvp_counts(uuid);
create function public.rsvp_counts(p_event_id uuid)
returns table (families_yes bigint, families_maybe bigint, families_no bigint, scouts bigint, adults bigint,
               families_waitlist bigint, waitlist_people bigint, rsvp_limit int, my_waitlist_spot int, siblings bigint)
language sql stable security definer set search_path = '' as $$
    select count(*) filter (where r.status = 'yes' and not r.waitlisted),
           count(*) filter (where r.status = 'maybe'),
           count(*) filter (where r.status = 'no'),
           coalesce(sum(r.scouts) filter (where r.status = 'yes' and not r.waitlisted), 0),
           coalesce(sum(r.adults) filter (where r.status = 'yes' and not r.waitlisted), 0),
           count(*) filter (where r.status = 'yes' and r.waitlisted),
           coalesce(sum(r.scouts + r.adults + r.siblings) filter (where r.status = 'yes' and r.waitlisted), 0),
           (select e.rsvp_limit from public.events e where e.id = p_event_id and private.can_see_event(p_event_id)),
           (select private.my_waitlist_spot(p_event_id)),
           coalesce(sum(r.siblings) filter (where r.status = 'yes' and not r.waitlisted), 0)
      from public.event_rsvps r
     where r.event_id = p_event_id and private.can_see_event(p_event_id)
$$;
revoke execute on function public.rsvp_counts(uuid) from public, anon;
grant execute on function public.rsvp_counts(uuid) to authenticated;

commit;
