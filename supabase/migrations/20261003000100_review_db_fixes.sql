-- Review fixes for money, events and den meetings (2026-10-03)
--   1. charges.source     'rsvp' (kept in step with the family's RSVP) or 'manual' (added by the
--                         committee). RSVP answers only ever touch the RSVP's own charge, so a
--                         per-family fee the committee added is never repriced or canceled by one.
--   2. Givebutter dues    an order only marks dues paid when it covers them: short orders pay
--                         nothing and wait for a leader, extra money is flagged, and an order with
--                         nothing left to pay is flagged as a possible double payment.
--   3. Event prices       only the committee sets an event's cost (the syncs still can).
--   4. RSVP deleted       its open event charge is canceled (paid ones never change).
--   5. Charges            all changes go through the money functions; the committee's one direct
--                         write left is an unpaid charge's amount.
--   6. Reopen             a canceled charge with an open twin isn't reopened (friendly message).
--   7. Den meetings       a malformed skip list no longer breaks Save.
--   8. Den meetings       a requirement a leader returned can be sent in again after the meeting
--                         is saved again; editing a planned meeting keeps adventures 2 and on.

-- -----------------------------------------------------------------------------
-- 1. Where a charge came from
-- -----------------------------------------------------------------------------
alter table public.charges
    add column source text not null default 'manual' check (source in ('rsvp', 'manual'));

-- Existing RSVP charges: event charges for a family (or an adult with no family) with nobody on
-- them, where that family or adult answered the RSVP, and that the RSVP made: added by someone in
-- that family (or the adult), by nobody, or with the event's own title and RSVP due date.
update public.charges c
   set source = 'rsvp'
 where c.kind = 'event' and c.event_id is not null and c.scout_id is null
   and ((c.family_id is not null and c.adult_id is null) or (c.family_id is null and c.adult_id is not null))
   and exists (select 1 from public.event_rsvps r
                where r.event_id = c.event_id
                  and case when c.family_id is not null then r.family_id = c.family_id
                           else r.family_id is null and r.adult_id = c.adult_id end)
   and (c.created_by is null
        or c.created_by = c.adult_id
        or exists (select 1 from public.adults a where a.id = c.created_by and a.family_id = c.family_id)
        or exists (select 1 from public.events e
                    where e.id = c.event_id and c.title = left(e.title, 120)
                      and c.due_on is not distinct from coalesce(e.rsvp_by, (e.starts_at at time zone 'America/New_York')::date)));

-- One RSVP charge and one committee fee per family and event can stand side by side. The new
-- index is built before the old one goes, so duplicates are never allowed in between.
create unique index charges_event_key_v2 on public.charges
    (event_id, coalesce(family_id, adult_id), coalesce(scout_id, adult_id, '00000000-0000-0000-0000-000000000000'::uuid), source)
    where kind = 'event' and status <> 'canceled';
drop index public.charges_event_key;
alter index public.charges_event_key_v2 rename to charges_event_key;

-- Same as before (20261002000000_payments.sql), except it only ever touches the RSVP's own charge.
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

    if not has_fee or r.id is null or r.status = 'no' then
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
                    coalesce(e.rsvp_by, (e.starts_at at time zone 'America/New_York')::date), private.current_adult_id(), 'rsvp')
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

-- Same as before, except only RSVP charges are brought back in line with the RSVP.
create or replace function private.release_claims(p_payment_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r record;
begin
    for r in
        update public.charges set pending_payment_id = null, pending_since = null
         where pending_payment_id = p_payment_id
        returning id, kind, source, event_id, family_id, adult_id, scout_id, status
    loop
        if r.kind = 'event' and r.source = 'rsvp' and r.event_id is not null and r.status = 'open' and r.scout_id is null
           and (r.family_id is null or r.adult_id is null) then
            perform private.sync_event_charge(r.event_id, r.family_id, case when r.family_id is null then r.adult_id end);
        end if;
    end loop;
end;
$$;
revoke execute on function private.release_claims(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Givebutter dues: only mark paid what the order covers
-- -----------------------------------------------------------------------------
-- 25500 -> '$255', 25550 -> '$255.50'
create or replace function private.dollars(p_cents int)
returns text language sql immutable set search_path = '' as $$
    select '$' || case when p_cents % 100 = 0 then (p_cents / 100)::text
                       else to_char(p_cents / 100.0, 'FM999999990.00') end
$$;
revoke execute on function private.dollars(int) from public, anon;
grant execute on function private.dollars(int) to authenticated;

-- Apply one Givebutter dues order to a family and some of its scouts. The dues still open for
-- those scouts (adding a dues charge for a scout who has none) are what the order is for:
--   * nothing left to pay -> 'needs_review', "possible double payment"; done, so the sync won't
--     try again (it stays on the Givebutter dues list). Returns 'nothing_due'.
--   * order less than due -> 'partial', nothing marked paid, left open for a leader to match by
--     hand (ticking fewer scouts) or to mark paid another way. Returns 'short'.
--   * order covers it     -> each charge is paid at its own amount; any extra is flagged
--     ('partial', "Paid $X more than was due"). Returns the order's dues_match.
-- Paid, waived and canceled charges are never touched. No family or no scouts: 'needs_review'.
create or replace function private.apply_gb_dues(p_order_id bigint, p_family_id uuid, p_scout_ids uuid[],
                                                 p_match text, p_note text, p_by uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
    o public.givebutter_orders;
    v_season text := private.setting('dues_season');
    full_cents int := private.setting_cents('dues_amount_cents');
    second_cents int := greatest(private.setting_cents('dues_amount_cents') - private.setting_cents('dues_sibling_discount_cents'), 0);
    scouts uuid[];
    t_scouts uuid[] := '{}';
    t_names text[] := '{}';
    t_ids uuid[] := '{}';
    t_amts int[] := '{}';
    s record;
    ch public.charges;
    cid uuid;
    i int := 0;
    n int;
    total_cents int;
    order_cents int;
    extra int;
    paid_on timestamptz;
    v_match text;
    v_note text;
begin
    select * into o from public.givebutter_orders where id = p_order_id for update;
    if not found then raise exception 'Order not found' using errcode = 'P0002'; end if;
    if o.dues_applied_at is not null then return 'already'; end if;
    if v_season !~ '^\d{4}-\d{2}$' then raise exception 'Set the dues season first' using errcode = '22023'; end if;

    select coalesce(array_agg(x.id order by x.created_at, x.first_name, x.id), '{}') into scouts
      from public.scouts x where x.id = any (coalesce(p_scout_ids, '{}')) and x.family_id = p_family_id;

    if p_family_id is null or cardinality(scouts) = 0 then
        update public.givebutter_orders
           set dues_match = 'needs_review', dues_note = left(coalesce(nullif(trim(p_note), ''), 'Needs a leader to match it'), 120),
               family_id = coalesce(p_family_id, family_id), matched_scout_ids = '{}'
         where id = o.id;
        return 'needs_review';
    end if;

    -- What's still due for these scouts (a scout with no dues charge yet owes the usual amount).
    for s in select x.id, x.first_name from public.scouts x where x.id = any (scouts) order by x.created_at, x.first_name, x.id loop
        i := i + 1;
        select * into ch from public.charges c
         where c.kind = 'dues' and c.season = v_season and c.scout_id = s.id and c.status <> 'canceled'
         order by c.created_at limit 1 for update;
        if not found then
            t_scouts := t_scouts || s.id;
            t_names := t_names || s.first_name::text;
            t_ids := t_ids || null::uuid;
            t_amts := t_amts || case when i = 1 then full_cents else second_cents end;
        elsif ch.status in ('open', 'reported') then
            t_scouts := t_scouts || s.id;
            t_names := t_names || s.first_name::text;
            t_ids := t_ids || ch.id;
            t_amts := t_amts || ch.amount_cents;
        end if;
    end loop;

    paid_on := coalesce(o.created_at, now());
    order_cents := least(greatest(round(coalesce(o.amount, 0) * 100)::int, 0), 1000000);
    n := cardinality(t_amts);
    select coalesce(sum(a), 0) into total_cents from unnest(t_amts) a;

    if n = 0 then
        update public.givebutter_orders
           set dues_match = 'needs_review', dues_note = 'Nothing left to pay for these scouts (possible double payment)',
               family_id = p_family_id, matched_scout_ids = scouts, dues_applied_at = now()
         where id = o.id;
        return 'nothing_due';
    end if;

    if order_cents < total_cents then
        update public.givebutter_orders
           set dues_match = 'partial',
               dues_note = left(format('Paid %s; %s was due', private.dollars(order_cents), private.dollars(total_cents)), 120),
               family_id = p_family_id, matched_scout_ids = scouts
         where id = o.id;
        return 'short';
    end if;

    for i in 1 .. n loop
        cid := t_ids[i];
        if cid is null then
            insert into public.charges (family_id, scout_id, kind, title, season, amount_cents, created_by)
            values (p_family_id, t_scouts[i], 'dues', left(format('Pack dues %s – %s', v_season, t_names[i]), 120), v_season,
                    t_amts[i], p_by)
            returning id into cid;
        end if;
        update public.charges
           set status = 'paid', paid_via = 'givebutter', paid_at = paid_on, paid_amount_cents = t_amts[i],
               givebutter_order_id = o.id, pending_payment_id = null, pending_since = null
         where id = cid;
    end loop;

    update public.charges
       set status = 'paid', paid_via = 'givebutter', paid_at = paid_on, paid_amount_cents = 0, givebutter_order_id = o.id,
           note = coalesce(note, 'Paid on Givebutter, per scout'), pending_payment_id = null, pending_since = null
     where kind = 'dues' and season = v_season and family_id = p_family_id and scout_id is null and adult_id is null
       and status = 'open';

    extra := order_cents - total_cents;
    v_match := case when extra > 0 then 'partial' else p_match end;
    v_note := case when extra > 0
                   then concat_ws('; ', format('Paid %s more than was due', private.dollars(extra)), nullif(trim(p_note), ''))
                   else nullif(trim(p_note), '') end;
    update public.givebutter_orders
       set dues_match = v_match, dues_note = left(v_note, 120), family_id = p_family_id,
           matched_scout_ids = scouts, dues_applied_at = now()
     where id = o.id;
    return v_match;
end;
$$;
revoke execute on function private.apply_gb_dues(bigint, uuid, uuid[], text, text, uuid) from public, anon, authenticated;

-- The Givebutter sync (secret key only). Returns the order's dues_match, or 'already'.
create or replace function public.apply_givebutter_dues(p_order_id bigint, p_family_id uuid, p_scout_ids uuid[],
                                                        p_match text, p_note text)
returns text language plpgsql security definer set search_path = '' as $$
declare r text;
begin
    if p_match not in ('matched', 'partial', 'needs_review') then raise exception 'Bad match' using errcode = '22023'; end if;
    if not exists (select 1 from public.givebutter_orders where id = p_order_id and campaign_id = private.dues_campaign_id()) then
        raise exception 'Not a dues order' using errcode = '22023';
    end if;
    r := private.apply_gb_dues(p_order_id, p_family_id, p_scout_ids, p_match, p_note, null);
    return case r when 'nothing_due' then 'needs_review' when 'short' then 'partial' else r end;
end;
$$;
revoke execute on function public.apply_givebutter_dues(bigint, uuid, uuid[], text, text) from public, anon, authenticated;
grant execute on function public.apply_givebutter_dues(bigint, uuid, uuid[], text, text) to service_role;

-- Committee: match a dues order to a family and the scouts it paid for. Refused (nothing changes)
-- when it doesn't cover those scouts' dues, or they have nothing left to pay. Returns 'matched',
-- or 'partial' when the order was more than was due.
create or replace function public.match_givebutter_dues(p_order_id bigint, p_family_id uuid, p_scout_ids uuid[])
returns text language plpgsql security definer set search_path = '' as $$
declare
    picked int;
    r text;
    v_note text;
begin
    if not private.is_committee() then raise exception 'Committee only' using errcode = '42501'; end if;
    if not exists (select 1 from public.givebutter_orders where id = p_order_id and campaign_id = private.dues_campaign_id()) then
        raise exception 'That order isn''t in the dues campaign' using errcode = '22023';
    end if;
    select count(*) into picked from public.scouts s where s.id = any (coalesce(p_scout_ids, '{}')) and s.family_id = p_family_id;
    if p_family_id is null or picked = 0 then raise exception 'Pick the family and tick its scouts' using errcode = '22023'; end if;
    r := private.apply_gb_dues(p_order_id, p_family_id, p_scout_ids, 'matched',
                               format('Matched by a leader: %s scout%s', picked, case when picked = 1 then '' else 's' end),
                               private.current_adult_id());
    if r = 'already' then raise exception 'That order was already matched' using errcode = '22023'; end if;
    if r = 'nothing_due' then
        raise exception 'Nothing left to pay for these scouts (possible double payment)' using errcode = '22023';
    end if;
    if r = 'short' then
        select dues_note into v_note from public.givebutter_orders where id = p_order_id;
        raise exception '%. Tick fewer scouts, or mark their dues paid by hand', v_note using errcode = '22023';
    end if;
    return r;
end;
$$;
revoke execute on function public.match_givebutter_dues(bigint, uuid, uuid[]) from public, anon;
grant execute on function public.match_givebutter_dues(bigint, uuid, uuid[]) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Only the committee sets what an event costs
-- -----------------------------------------------------------------------------
-- Den leaders still add and edit events; changing the cost is refused. The TroopWebHost and
-- council syncs (server key, nobody signed in) are not affected.
create or replace function private.guard_event_fees()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    if (tg_op = 'INSERT' and num_nonnulls(new.fee_family_cents, new.fee_scout_cents, new.fee_adult_cents) > 0)
       or (tg_op = 'UPDATE' and (new.fee_family_cents, new.fee_scout_cents, new.fee_adult_cents)
                                is distinct from (old.fee_family_cents, old.fee_scout_cents, old.fee_adult_cents)) then
        if auth.uid() is not null and auth.role() is distinct from 'service_role' and not private.is_committee() then
            raise exception 'Only the committee can set what an event costs' using errcode = '42501';
        end if;
    end if;
    return new;
end;
$$;
revoke execute on function private.guard_event_fees() from public, anon, authenticated;
create trigger events_guard_fees before insert or update on public.events
    for each row execute function private.guard_event_fees();

-- Same as before, committee only.
create or replace function public.refresh_event_charges(p_event_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r record;
begin
    if not private.is_committee() then raise exception 'Committee only' using errcode = '42501'; end if;
    for r in select family_id, adult_id from public.event_rsvps where event_id = p_event_id loop
        perform private.sync_event_charge(p_event_id, r.family_id, case when r.family_id is null then r.adult_id end);
    end loop;
end;
$$;
revoke execute on function public.refresh_event_charges(uuid) from public, anon;
grant execute on function public.refresh_event_charges(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. A deleted RSVP cancels its open event charge
-- -----------------------------------------------------------------------------
create or replace function private.rsvp_deleted()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    perform private.sync_event_charge(old.event_id, old.family_id, case when old.family_id is null then old.adult_id end);
    return old;
end;
$$;
revoke execute on function private.rsvp_deleted() from public, anon, authenticated;
create trigger event_rsvps_deleted after delete on public.event_rsvps
    for each row execute function private.rsvp_deleted();

-- -----------------------------------------------------------------------------
-- 5. Charges change only through the money functions
-- -----------------------------------------------------------------------------
-- Adding, paying, waiving, canceling, reopening and deleting all go through the functions above
-- (which check who's asking and keep online payments safe). The committee can still fix an unpaid
-- charge's amount directly, as the Money page does.
revoke insert, update, delete on public.charges from authenticated;
grant update (amount_cents) on public.charges to authenticated;
drop policy charges_committee_write on public.charges;
create policy charges_committee_amount on public.charges for update to authenticated
    using (private.is_committee() and status in ('open', 'reported'))
    with check (private.is_committee() and status in ('open', 'reported'));

-- -----------------------------------------------------------------------------
-- 6. Reopen: never next to an open twin
-- -----------------------------------------------------------------------------
-- Is there another charge, not canceled, that the unique keys say is the same as this one?
create or replace function private.charge_has_twin(c public.charges)
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (
        select 1 from public.charges t
         where t.id <> c.id and t.status <> 'canceled' and t.kind = c.kind
           and case
                 when c.kind = 'event' then
                      t.event_id = c.event_id and t.source = c.source
                      and coalesce(t.family_id, t.adult_id) = coalesce(c.family_id, c.adult_id)
                      and coalesce(t.scout_id, t.adult_id, '00000000-0000-0000-0000-000000000000'::uuid)
                          = coalesce(c.scout_id, c.adult_id, '00000000-0000-0000-0000-000000000000'::uuid)
                 when c.kind = 'dues' then
                      t.season = c.season
                      and coalesce(t.family_id, t.adult_id) = coalesce(c.family_id, c.adult_id)
                      and coalesce(t.scout_id, t.adult_id, '00000000-0000-0000-0000-000000000000'::uuid)
                          = coalesce(c.scout_id, c.adult_id, '00000000-0000-0000-0000-000000000000'::uuid)
                 when c.kind in ('national', 'council') then
                      t.season = c.season and coalesce(t.scout_id, t.adult_id) = coalesce(c.scout_id, c.adult_id)
                 else false
               end)
$$;
revoke execute on function private.charge_has_twin(public.charges) from public, anon, authenticated;

-- Same as before (20261002000500_givebutter_dues.sql), except reopening skips a canceled charge
-- that already has an open twin (an RSVP yes / no / yes, say). When that's all there was to
-- reopen, it says so instead of failing.
create or replace function public.update_charges(p_ids uuid[], p_action text, p_how text default null, p_note text default null)
returns int language plpgsql security definer set search_path = '' as $$
declare
    n int;
    twins int;
begin
    if not private.is_committee() then raise exception 'Committee only' using errcode = '42501'; end if;
    if p_action = 'paid' then
        if p_how is not null and p_how not in ('cash', 'check', 'other') then
            raise exception 'Pick cash, check or other' using errcode = '22023';
        end if;
        update public.charges
           set status = 'paid', paid_via = coalesce(p_how, case when paid_via in ('paypal', 'givebutter') then null else paid_via end, 'other'),
               paid_at = now(), paid_amount_cents = amount_cents,
               note = coalesce(left(nullif(trim(p_note), ''), 300), note),
               pending_payment_id = null, pending_since = null
         where id = any (p_ids) and status in ('open', 'reported') and amount_cents > 0;
    elsif p_action = 'waive' then
        update public.charges set status = 'waived', note = coalesce(left(nullif(trim(p_note), ''), 300), note),
                                  pending_payment_id = null, pending_since = null
         where id = any (p_ids) and status in ('open', 'reported');
    elsif p_action = 'cancel' then
        update public.charges set status = 'canceled', note = coalesce(left(nullif(trim(p_note), ''), 300), note),
                                  pending_payment_id = null, pending_since = null
         where id = any (p_ids) and status in ('open', 'reported', 'waived');
    elsif p_action = 'reopen' then
        select count(*) into twins from public.charges c
         where c.id = any (p_ids) and c.status = 'canceled' and private.charge_has_twin(c);
        begin
            update public.charges c
               set status = 'open', paid_via = null, paid_at = null, paid_amount_cents = null, report_note = null,
                   givebutter_order_id = null, pending_payment_id = null, pending_since = null
             where c.id = any (p_ids) and c.status in ('reported', 'paid', 'waived', 'canceled')
               and not (c.status = 'paid' and c.paid_via = 'paypal')
               and not (c.status = 'canceled' and private.charge_has_twin(c));
            get diagnostics n = row_count;
        exception when unique_violation then
            -- Two canceled twins picked together.
            raise exception 'There''s already an open charge like this one' using errcode = '22023';
        end;
        if n = 0 and twins > 0 then
            raise exception 'There''s already an open charge like this one' using errcode = '22023';
        end if;
        return n;
    else
        raise exception 'Unknown action' using errcode = '22023';
    end if;
    get diagnostics n = row_count;
    return n;
end;
$$;
revoke execute on function public.update_charges(uuid[], text, text, text) from public, anon;
grant execute on function public.update_charges(uuid[], text, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 8a. Returned requirements left behind by an earlier re-save
-- -----------------------------------------------------------------------------
-- A re-save could add a new approved row next to a returned one from the same meeting; the
-- family then couldn't send the returned one in again. Unlink those returned rows from the
-- meeting (the approved row stands for it), so sending them in again works.
update public.advancement_submissions s
   set meeting_id = null
 where s.meeting_id is not null and s.status = 'returned'
   and exists (select 1 from public.advancement_submissions o
                where o.meeting_id = s.meeting_id and o.scout_id = s.scout_id and o.adventure = s.adventure
                  and o.requirement = s.requirement and o.status <> 'returned');

-- -----------------------------------------------------------------------------
-- 7 + 8. Record a den meeting
-- -----------------------------------------------------------------------------
-- Same as before (20261003000000_den_meeting_easy.sql), except:
--   * requirements / skip that aren't lists are ignored instead of failing the Save;
--   * a requirement this meeting had that a leader returned, and that is still checked for a
--     scout who was here, is approved again (instead of a second row next to it).
create or replace function public.record_den_meeting(
    p_den_id uuid, p_meeting_id uuid, p_meets_on date, p_present uuid[], p_work jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    me        uuid := private.current_adult_id();
    today     date := (now() at time zone 'America/New_York')::date;
    d         public.dens;
    m         public.den_meetings;
    v_work    jsonb := '[]'::jsonb;
    item      jsonb;
    adv       public.adventures;
    reqs      text[];
    v_present uuid[];
    n_added   int := 0;
    n_back    int := 0;
    n_removed int := 0;
    n_done    int := 0;
    entered   jsonb;
begin
    if me is null or p_den_id is null or not private.leads_den(p_den_id) then
        raise exception 'Only this den''s leaders can record its meetings' using errcode = '42501';
    end if;
    select * into d from public.dens where id = p_den_id;
    if not found then raise exception 'Den not found' using errcode = 'P0002'; end if;
    if p_meets_on is null then raise exception 'Pick the meeting day' using errcode = '22023'; end if;
    if p_meets_on > today then raise exception 'You can save a meeting on the day or after' using errcode = '22023'; end if;

    -- One save at a time per den and day, so a double tap can't make two meetings.
    perform pg_advisory_xact_lock(hashtextextended('den_meeting:' || p_den_id::text || ':' || p_meets_on::text, 0));

    if p_meeting_id is not null then
        select * into m from public.den_meetings where id = p_meeting_id and den_id = p_den_id for update;
        if not found then raise exception 'Meeting not found' using errcode = 'P0002'; end if;
    else
        select * into m from public.den_meetings where den_id = p_den_id and meets_on = p_meets_on
         order by created_at, id limit 1 for update;
    end if;

    -- Clean the work list: real adventures for this den's rank, requirement numbers in range.
    for item in select * from jsonb_array_elements(case when jsonb_typeof(p_work) = 'array' then p_work else '[]'::jsonb end) loop
        select * into adv from public.adventures a where a.rank = d.rank and a.name = item ->> 'adventure';
        if not found then raise exception 'Unknown adventure: %', item ->> 'adventure' using errcode = '22023'; end if;
        if v_work @> jsonb_build_array(jsonb_build_object('adventure', adv.name)) then continue; end if;
        select coalesce(array_agg(distinct r order by r), '{}') into reqs
          from jsonb_array_elements_text(case when jsonb_typeof(item -> 'requirements') = 'array'
                                              then item -> 'requirements' else '[]'::jsonb end) r
         where r ~ '^\d{1,2}$' and r::int between 1 and adv.req_count;
        if cardinality(reqs) = 0 then continue; end if;
        v_work := v_work || jsonb_build_array(jsonb_build_object(
            'adventure', adv.name,
            'requirements', (select jsonb_agg(r order by r::int) from unnest(reqs) r),
            'skip', coalesce((select jsonb_object_agg(k, v)
                                from jsonb_each(case when jsonb_typeof(item -> 'skip') = 'object'
                                                     then item -> 'skip' else '{}'::jsonb end) s(k, v)
                               where k ~ '^[0-9a-f-]{36}$'
                                 and case when jsonb_typeof(v) = 'array' then jsonb_array_length(v) > 0 else false end),
                             '{}'::jsonb)));
    end loop;

    if m.id is null then
        insert into public.den_meetings (den_id, meets_on, title, rank, work, created_by)
        values (p_den_id, p_meets_on, coalesce(v_work -> 0 ->> 'adventure', 'Den meeting'), d.rank, v_work, me)
        returning * into m;
    else
        update public.den_meetings set meets_on = p_meets_on, rank = coalesce(rank, d.rank), work = v_work
         where id = m.id returning * into m;
    end if;

    -- Who was here: active scouts of this den (or already on this meeting's list).
    select coalesce(array_agg(s.id), '{}') into v_present
      from public.scouts s
     where s.id = any(coalesce(p_present, '{}'))
       and ((s.den_id = p_den_id and s.is_active)
            or exists (select 1 from public.den_meeting_attendance x where x.meeting_id = m.id and x.scout_id = s.id));
    delete from public.den_meeting_attendance where meeting_id = m.id and not (scout_id = any(v_present));
    insert into public.den_meeting_attendance (meeting_id, scout_id)
    select m.id, unnest(v_present) on conflict do nothing;

    -- What this meeting should have on the Scoutbook list.
    create temporary table if not exists pg_temp.want (scout_id uuid, adventure text, requirement text) on commit drop;
    truncate pg_temp.want;
    insert into pg_temp.want
    select distinct p.scout_id, w ->> 'adventure', r
      from unnest(v_present) p(scout_id)
     cross join jsonb_array_elements(v_work) w
     cross join jsonb_array_elements_text(w -> 'requirements') r
     where not coalesce((w -> 'skip' -> p.scout_id::text) ? r, false);

    -- Already entered in Scoutbook but no longer wanted: can't undo here.
    select coalesce(jsonb_agg(jsonb_build_object(
               'scout', sc.first_name || ' ' || left(sc.last_name, 1) || '.', 'adventure', s.adventure, 'requirement', s.requirement)
               order by sc.first_name, s.adventure, s.requirement), '[]'::jsonb)
      into entered
      from public.advancement_submissions s
      join public.scouts sc on sc.id = s.scout_id
     where s.meeting_id = m.id and s.status = 'recorded'
       and not exists (select 1 from pg_temp.want w
                        where w.scout_id = s.scout_id and w.adventure = s.adventure and w.requirement = s.requirement);

    delete from public.advancement_submissions s
     where s.meeting_id = m.id and s.status in ('submitted', 'approved')
       and not exists (select 1 from pg_temp.want w
                        where w.scout_id = s.scout_id and w.adventure = s.adventure and w.requirement = s.requirement);
    get diagnostics n_removed = row_count;

    update public.advancement_submissions s set completed_on = m.meets_on
     where s.meeting_id = m.id and s.status in ('submitted', 'approved') and s.completed_on <> m.meets_on;

    -- Skip what Scoutbook already shows, or what's already on the list from anywhere.
    select count(*) into n_done from pg_temp.want w
     where exists (select 1 from public.scout_advancement r
                    where r.scout_id = w.scout_id and lower(r.adventure) = lower(w.adventure)
                      and (r.kind = 'adventure'
                           or (r.kind = 'requirement' and (r.item = w.requirement or substring(r.item from '^\d+') = w.requirement))))
        or exists (select 1 from public.advancement_submissions s
                    where s.scout_id = w.scout_id and s.adventure = w.adventure and s.requirement = w.requirement
                      and s.status <> 'returned' and s.meeting_id is distinct from m.id);

    -- Still checked after a leader returned it: this meeting's returned row is approved again
    -- (one row per requirement, so the family can never be blocked from sending it in).
    update public.advancement_submissions s
       set status = 'approved', completed_on = m.meets_on
      from pg_temp.want w
     where s.meeting_id = m.id and s.status = 'returned'
       and w.scout_id = s.scout_id and w.adventure = s.adventure and w.requirement = s.requirement
       and not exists (select 1 from public.scout_advancement r
                        where r.scout_id = w.scout_id and lower(r.adventure) = lower(w.adventure)
                          and (r.kind = 'adventure'
                               or (r.kind = 'requirement' and (r.item = w.requirement or substring(r.item from '^\d+') = w.requirement))))
       and not exists (select 1 from public.advancement_submissions o
                        where o.scout_id = s.scout_id and o.adventure = s.adventure and o.requirement = s.requirement
                          and o.status <> 'returned');
    get diagnostics n_back = row_count;

    insert into public.advancement_submissions
        (scout_id, submitted_by, rank, adventure, requirement, completed_on, notes, status, meeting_id)
    select w.scout_id, me, d.rank, w.adventure, w.requirement, m.meets_on, 'Den meeting: ' || m.title, 'approved', m.id
      from pg_temp.want w
     where not exists (select 1 from public.scout_advancement r
                        where r.scout_id = w.scout_id and lower(r.adventure) = lower(w.adventure)
                          and (r.kind = 'adventure'
                               or (r.kind = 'requirement' and (r.item = w.requirement or substring(r.item from '^\d+') = w.requirement))))
       and not exists (select 1 from public.advancement_submissions s
                        where s.scout_id = w.scout_id and s.adventure = w.adventure and s.requirement = w.requirement
                          and (s.status <> 'returned' or s.meeting_id = m.id))
    on conflict do nothing;
    get diagnostics n_added = row_count;

    update public.den_meetings set recorded_at = now(), recorded_by = me where id = m.id;

    return jsonb_build_object(
        'meeting_id', m.id,
        'meets_on', m.meets_on,
        'present', cardinality(v_present),
        'requirements', (select count(*) from jsonb_array_elements(v_work) w, jsonb_array_elements(w -> 'requirements')),
        'on_list', (select count(*) from public.advancement_submissions s where s.meeting_id = m.id and s.status <> 'returned'),
        'added', n_added + n_back,
        'removed', n_removed,
        'already_done', n_done,
        'entered', entered);
end;
$$;
revoke execute on function public.record_den_meeting(uuid, uuid, date, uuid[], jsonb) from public, anon;
grant execute on function public.record_den_meeting(uuid, uuid, date, uuid[], jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- 8b. Editing a planned meeting keeps adventures 2 and on
-- -----------------------------------------------------------------------------
-- Same as before, except that setting adventure / requirements (without work) changes only the
-- first adventure in work: the rest stay. Clearing the adventure drops the first one.
create or replace function private.sync_meeting_work()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
    rest  jsonb;
    v_first jsonb;
begin
    if tg_op = 'INSERT' then
        if new.work = '[]'::jsonb and new.adventure is not null then
            new.work := jsonb_build_array(jsonb_build_object('adventure', new.adventure, 'requirements', to_jsonb(new.requirements)));
        end if;
    elsif new.work is not distinct from old.work
          and (new.adventure is distinct from old.adventure or new.requirements is distinct from old.requirements) then
        select coalesce(jsonb_agg(x order by i), '[]'::jsonb) into rest
          from jsonb_array_elements(old.work) with ordinality t(x, i)
         where i > 1 and (x ->> 'adventure') is distinct from new.adventure;
        if new.adventure is null then
            new.work := rest;
        else
            -- Same adventure: keep its skip list.
            v_first := case when old.work -> 0 ->> 'adventure' = new.adventure then old.work -> 0 else '{}'::jsonb end
                     || jsonb_build_object('adventure', new.adventure, 'requirements', to_jsonb(coalesce(new.requirements, '{}')));
            new.work := jsonb_build_array(v_first) || rest;
        end if;
    end if;
    new.adventure := nullif(new.work -> 0 ->> 'adventure', '');
    new.requirements := coalesce(
        (select array_agg(r order by length(r), r) from jsonb_array_elements_text(coalesce(new.work -> 0 -> 'requirements', '[]'::jsonb)) r), '{}');
    return new;
end;
$$;
revoke execute on function private.sync_meeting_work() from public, anon, authenticated;
