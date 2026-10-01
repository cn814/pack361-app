-- Payments: everything a family owes the pack, paid in the app with PayPal (or Venmo), by check
-- or in cash.
--   1. charges    one row per thing someone owes: pack dues, Scouting America (national)
--                 registration, the council fee, event fees and anything else.
--   2. payments   one row per PayPal checkout. Only the server writes these (secret key), after
--                 checking the order with PayPal itself.
--   3. dues       dues_payments becomes "dues" charges and is dropped. Fee amounts become
--                 numeric settings (0 until leaders fill them in).
--   4. events     optional cost per family / scout / adult. Answering "yes" to an RSVP keeps the
--                 family's event charge up to date; "no" cancels it. Paid charges never change.
-- No card or bank details are ever stored: PayPal handles those. We keep amounts, status and
-- PayPal's order and capture ids (to match the pack's PayPal records).

-- -----------------------------------------------------------------------------
-- 1. Charges
-- -----------------------------------------------------------------------------
create table public.charges (
    id                 uuid primary key default gen_random_uuid(),
    family_id          uuid references public.families(id) on delete restrict,   -- money history is kept: turn people off, don't delete
    adult_id           uuid references public.adults(id) on delete restrict,    -- payer with no family, or the adult it's for
    scout_id           uuid references public.scouts(id) on delete restrict,    -- the scout it's for
    kind               text not null check (kind in ('dues', 'national', 'council', 'event', 'other')),
    title              text not null check (length(title) between 1 and 120),
    season             text check (length(season) between 1 and 20),          -- '2026-27' (dues) or '2027' (registration)
    event_id           uuid references public.events(id) on delete set null,
    amount_cents       int  not null check (amount_cents between 0 and 100000),
    due_on             date,
    status             text not null default 'open'
                       check (status in ('open', 'reported', 'paid', 'waived', 'canceled')),
    paid_via           text check (paid_via in ('paypal', 'cash', 'check', 'other')),
    paid_at            timestamptz,
    paid_amount_cents  int check (paid_amount_cents between 0 and 1000000),
    note               text check (length(note) <= 300),          -- leaders' note
    report_note        text check (length(report_note) <= 300),   -- family's note when they paid another way
    paypal_order_id    text,
    paypal_capture_id  text,
    remitted_on        date,                                      -- national/council money sent on to the council
    created_by         uuid references public.adults(id) on delete set null,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now(),
    updated_by         uuid references public.adults(id) on delete set null,
    -- The owner (who pays) is the family, or the adult when there's no family.
    check (num_nonnulls(family_id, adult_id) >= 1),
    -- Registration fees are per person; dues and registration belong to a season.
    check (kind not in ('national', 'council') or num_nonnulls(scout_id, adult_id) >= 1),
    check (kind not in ('dues', 'national', 'council') or season is not null)
);
create trigger charges_stamp before insert or update on public.charges
    for each row execute function private.stamp_updated();

-- Bulk adds can't charge anyone twice (canceled charges don't count).
create unique index charges_dues_key on public.charges (season, coalesce(family_id, adult_id))
    where kind = 'dues' and status <> 'canceled';
create unique index charges_registration_key on public.charges (kind, season, coalesce(scout_id, adult_id))
    where kind in ('national', 'council') and status <> 'canceled';
create unique index charges_event_key on public.charges (event_id, coalesce(family_id, adult_id))
    where kind = 'event' and status <> 'canceled';

create index charges_family_idx on public.charges (family_id);
create index charges_adult_idx on public.charges (adult_id);
create index charges_scout_idx on public.charges (scout_id);
create index charges_event_idx on public.charges (event_id);
create index charges_status_idx on public.charges (status);

-- Is this charge's owner the signed-in person's family (or, with no family, the person)?
create or replace function private.owns_charge(p_family_id uuid, p_adult_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
    select coalesce(case when p_family_id is not null then p_family_id = private.my_family_id()
                         else p_adult_id = private.current_adult_id() end, false)
$$;
revoke execute on function private.owns_charge(uuid, uuid) from public, anon;
grant execute on function private.owns_charge(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. PayPal checkouts
-- -----------------------------------------------------------------------------
create table public.payments (
    id                   uuid primary key default gen_random_uuid(),
    family_id            uuid references public.families(id) on delete set null,
    adult_id             uuid references public.adults(id) on delete set null,   -- who paid
    charge_ids           uuid[] not null check (cardinality(charge_ids) between 1 and 50),
    charge_cents         int[]  not null,   -- each charge's amount at checkout, same order as charge_ids
    amount_cents         int    not null check (amount_cents between 1 and 1000000),
    provider             text   not null default 'paypal' check (provider = 'paypal'),
    provider_order_id    text   not null unique,
    provider_capture_id  text,
    status               text   not null default 'created' check (status in ('created', 'captured', 'failed', 'canceled')),
    created_at           timestamptz not null default now(),
    captured_at          timestamptz,
    error                text check (length(error) <= 500),
    check (cardinality(charge_cents) = cardinality(charge_ids))
);
create index payments_family_idx on public.payments (family_id);
create index payments_adult_idx on public.payments (adult_id);
create index payments_open_idx on public.payments (created_at) where status = 'created';

-- Record a PayPal capture: the payment becomes "captured" and its charges "paid", in one step.
-- Only the server calls this (secret key), after PayPal said the capture is COMPLETED.
-- Safe to call twice: the status change from "created" happens once, so a second call (or the
-- daily check racing the family's own capture) changes nothing. A payment the family gave up on
-- ("canceled") is still recorded if the money did move.
create or replace function public.record_paypal_capture(p_payment_id uuid, p_capture_id text, p_captured_cents int)
returns text language plpgsql security definer set search_path = '' as $$
declare
    p public.payments;
    i int;
    n int;
    missed int := 0;
begin
    update public.payments
       set status = 'captured', captured_at = now(), provider_capture_id = left(p_capture_id, 64), error = null
     where id = p_payment_id and status in ('created', 'canceled')
    returning * into p;
    if not found then return 'already'; end if;

    if p_captured_cents is distinct from p.amount_cents then
        update public.payments
           set error = format('PayPal captured %s cents but the checkout was for %s cents. Nothing was marked paid; check it in PayPal.',
                              coalesce(p_captured_cents::text, 'no'), p.amount_cents)
         where id = p.id;
        return 'mismatch';
    end if;

    for i in 1 .. cardinality(p.charge_ids) loop
        update public.charges
           set status = 'paid', paid_via = 'paypal', paid_at = now(), paid_amount_cents = p.charge_cents[i],
               paypal_order_id = p.provider_order_id, paypal_capture_id = left(p_capture_id, 64)
         where id = p.charge_ids[i] and status in ('open', 'reported');
        get diagnostics n = row_count;
        if n = 0 then missed := missed + 1; end if;
    end loop;
    if missed > 0 then
        update public.payments
           set error = format('%s of the items in this payment were already paid, waived or canceled. The family may need a refund.', missed)
         where id = p.id;
        return 'partial';
    end if;
    return 'recorded';
end;
$$;
revoke execute on function public.record_paypal_capture(uuid, text, int) from public, anon, authenticated;
grant execute on function public.record_paypal_capture(uuid, text, int) to service_role;

-- -----------------------------------------------------------------------------
-- 3. Families: "we paid another way" (check or cash), waiting for a leader to confirm
-- -----------------------------------------------------------------------------
create or replace function public.report_paid(p_ids uuid[], p_how text, p_note text)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
    if private.current_adult_id() is null then raise exception 'Not on the pack roster' using errcode = '42501'; end if;
    if p_how not in ('cash', 'check', 'other') then raise exception 'Pick check, cash or other' using errcode = '22023'; end if;
    update public.charges c
       set status = 'reported', paid_via = p_how, report_note = left(nullif(trim(p_note), ''), 300)
     where c.id = any (p_ids) and c.status = 'open' and private.owns_charge(c.family_id, c.adult_id);
    get diagnostics n = row_count;
    return n;
end;
$$;
revoke execute on function public.report_paid(uuid[], text, text) from public, anon;
grant execute on function public.report_paid(uuid[], text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Leaders (committee, Cubmaster, admins)
-- -----------------------------------------------------------------------------
-- Mark paid (cash, check or other), waive, cancel or reopen. Returns how many changed.
-- Online (PayPal) payments can't be reopened here: refund them in PayPal first.
create or replace function public.update_charges(p_ids uuid[], p_action text, p_how text default null, p_note text default null)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
    if not private.is_committee() then raise exception 'Committee only' using errcode = '42501'; end if;
    if p_action = 'paid' then
        if p_how is not null and p_how not in ('cash', 'check', 'other') then
            raise exception 'Pick cash, check or other' using errcode = '22023';
        end if;
        update public.charges
           set status = 'paid', paid_via = coalesce(p_how, case when paid_via = 'paypal' then null else paid_via end, 'other'),
               paid_at = now(), paid_amount_cents = amount_cents,
               note = coalesce(left(nullif(trim(p_note), ''), 300), note)
         where id = any (p_ids) and status in ('open', 'reported');
    elsif p_action = 'waive' then
        update public.charges set status = 'waived', note = coalesce(left(nullif(trim(p_note), ''), 300), note)
         where id = any (p_ids) and status in ('open', 'reported');
    elsif p_action = 'cancel' then
        update public.charges set status = 'canceled', note = coalesce(left(nullif(trim(p_note), ''), 300), note)
         where id = any (p_ids) and status in ('open', 'reported', 'waived');
    elsif p_action = 'reopen' then
        update public.charges
           set status = 'open', paid_via = null, paid_at = null, paid_amount_cents = null, report_note = null
         where id = any (p_ids) and status in ('reported', 'paid', 'waived', 'canceled')
           and not (status = 'paid' and paid_via = 'paypal');
    else
        raise exception 'Unknown action' using errcode = '22023';
    end if;
    get diagnostics n = row_count;
    return n;
end;
$$;
revoke execute on function public.update_charges(uuid[], text, text, text) from public, anon;
grant execute on function public.update_charges(uuid[], text, text, text) to authenticated;

-- When the pack sent national / council money on to the council (null clears it).
create or replace function public.set_remitted(p_ids uuid[], p_on date)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
    if not private.is_committee() then raise exception 'Committee only' using errcode = '42501'; end if;
    update public.charges set remitted_on = p_on
     where id = any (p_ids) and kind in ('national', 'council') and status <> 'canceled';
    get diagnostics n = row_count;
    return n;
end;
$$;
revoke execute on function public.set_remitted(uuid[], date) from public, anon;
grant execute on function public.set_remitted(uuid[], date) to authenticated;

-- Add a fee for a group of people. Skips anyone who already has the same dues, registration
-- or event charge. p_who: families, scouts, leaders (anyone who isn't a plain parent, has a
-- position title or leads a den), den_families, den_scouts (p_target = den), family, scout,
-- adult (p_target = that one).
create or replace function public.add_fee(p_kind text, p_title text, p_season text, p_event_id uuid,
                                          p_amount_cents int, p_due_on date, p_who text, p_target uuid)
returns table (added int, skipped int)
language plpgsql security definer set search_path = '' as $$
declare
    me uuid := private.current_adult_id();
    n_targets int;
    n_added int;
begin
    if not private.is_committee() then raise exception 'Committee only' using errcode = '42501'; end if;
    if p_kind not in ('dues', 'national', 'council', 'event', 'other') then raise exception 'Pick a kind of fee' using errcode = '22023'; end if;
    if nullif(trim(p_title), '') is null then raise exception 'Give the fee a name' using errcode = '22023'; end if;
    if p_amount_cents is null or p_amount_cents < 0 or p_amount_cents > 100000 then
        raise exception 'Amount must be $0 to $1,000' using errcode = '22023';
    end if;
    if p_kind in ('dues', 'national', 'council') and nullif(trim(p_season), '') is null then
        raise exception 'Add the season or year' using errcode = '22023';
    end if;
    if p_kind = 'event' and p_event_id is null then raise exception 'Pick the event' using errcode = '22023'; end if;
    if p_kind in ('national', 'council') and p_who not in ('scouts', 'leaders', 'den_scouts', 'scout', 'adult') then
        raise exception 'Registration fees are per person: pick scouts, leaders or one person' using errcode = '22023';
    end if;
    if p_who in ('den_families', 'den_scouts', 'family', 'scout', 'adult') and p_target is null then
        raise exception 'Pick who it''s for' using errcode = '22023';
    end if;

    with targets as (
        select f.id as family_id, null::uuid as adult_id, null::uuid as scout_id from public.families f
         where p_who = 'families' and f.is_active
           and exists (select 1 from public.scouts s where s.family_id = f.id and s.is_active)
        union all
        select s.family_id, null, s.id from public.scouts s where p_who = 'scouts' and s.is_active
        union all
        select a.family_id, a.id, null from public.adults a
         where p_who = 'leaders' and a.is_active
           and (a.role <> 'parent' or a.position_title is not null
                or exists (select 1 from public.den_leaders dl where dl.adult_id = a.id))
        union all
        select f.id, null, null from public.families f
         where p_who = 'den_families' and f.is_active
           and exists (select 1 from public.scouts s where s.family_id = f.id and s.is_active and s.den_id = p_target)
        union all
        select s.family_id, null, s.id from public.scouts s where p_who = 'den_scouts' and s.is_active and s.den_id = p_target
        union all
        select f.id, null, null from public.families f where p_who = 'family' and f.id = p_target
        union all
        select s.family_id, null, s.id from public.scouts s where p_who = 'scout' and s.id = p_target
        union all
        select a.family_id, a.id, null from public.adults a where p_who = 'adult' and a.id = p_target
    ), ins as (
        insert into public.charges (family_id, adult_id, scout_id, kind, title, season, event_id, amount_cents, due_on, created_by)
        select t.family_id, t.adult_id, t.scout_id, p_kind, left(trim(p_title), 120), nullif(trim(p_season), ''),
               case when p_kind = 'event' then p_event_id end, p_amount_cents, p_due_on, me
          from targets t
        on conflict do nothing
        returning 1
    )
    select (select count(*) from targets), (select count(*) from ins) into n_targets, n_added;
    return query select n_added, n_targets - n_added;
end;
$$;
revoke execute on function public.add_fee(text, text, text, uuid, int, date, text, uuid) from public, anon;
grant execute on function public.add_fee(text, text, text, uuid, int, date, text, uuid) to authenticated;

-- Fee amounts and "other ways to pay" live in pack_settings, which only admins write; the
-- committee keeps these particular ones up to date from the Money page.
create or replace function public.save_pay_settings(p_values jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
    k text;
    v text;
begin
    if not private.is_committee() then raise exception 'Committee only' using errcode = '42501'; end if;
    for k, v in select key, value from jsonb_each_text(p_values) loop
        if k not in ('dues_season', 'registration_year', 'dues_amount_cents', 'national_youth_cents', 'national_adult_cents',
                     'council_youth_cents', 'council_adult_cents', 'pay_other_how') then
            raise exception 'Not a payment setting: %', k using errcode = '22023';
        end if;
        if k like '%_cents' and (v !~ '^\d{1,6}$' or v::int > 100000) then
            raise exception 'Amounts must be $0 to $1,000' using errcode = '22023';
        end if;
        if k = 'dues_season' and v !~ '^\d{4}-\d{2}$' then raise exception 'Write the season like 2026-27' using errcode = '22023'; end if;
        if k = 'registration_year' and v !~ '^(\d{4})?$' then raise exception 'Write the year like 2027' using errcode = '22023'; end if;
        if k = 'pay_other_how' and length(v) > 600 then raise exception 'Keep it under 600 characters' using errcode = '22023'; end if;
        insert into public.pack_settings (key, value, updated_at) values (k, v, now())
        on conflict (key) do update set value = excluded.value, updated_at = now();
    end loop;
end;
$$;
revoke execute on function public.save_pay_settings(jsonb) from public, anon;
grant execute on function public.save_pay_settings(jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Privileges and Row Level Security
-- -----------------------------------------------------------------------------
revoke all on public.charges, public.payments from anon, authenticated;
grant select, insert, update, delete on public.charges to authenticated;   -- writes: committee only (RLS)
grant select on public.payments to authenticated;                          -- writes: server only
alter table public.charges  enable row level security;
alter table public.payments enable row level security;

create policy charges_read on public.charges for select to authenticated
    using (private.is_committee() or private.owns_charge(family_id, adult_id));
create policy charges_committee_write on public.charges for all to authenticated
    using (private.is_committee()) with check (private.is_committee());

create policy payments_read on public.payments for select to authenticated
    using (private.is_committee() or private.owns_charge(family_id, adult_id));

-- -----------------------------------------------------------------------------
-- 6. Dues move to charges
-- -----------------------------------------------------------------------------
insert into public.pack_settings (key, value) values
    ('dues_amount_cents', '0'),
    ('national_youth_cents', '0'),
    ('national_adult_cents', '0'),
    ('council_youth_cents', '0'),
    ('council_adult_cents', '0'),
    ('registration_year', ''),
    ('pay_other_how', '')
on conflict (key) do nothing;

-- The old free-text amount ("$60 per family, due Oct 31"): keep the first dollar figure.
update public.pack_settings
   set value = coalesce((select (round(m[1]::numeric * 100))::int::text
                           from regexp_match((select value from public.pack_settings where key = 'dues_amount'),
                                             '\$?\s*(\d{1,4}(?:\.\d{1,2})?)') m
                          where round(m[1]::numeric * 100) <= 100000), '0')
 where key = 'dues_amount_cents' and value = '0';
update public.pack_settings
   set value = coalesce((select value from public.pack_settings where key = 'dues_how'), '')
 where key = 'pay_other_how' and value = '';

insert into public.charges (family_id, kind, title, season, amount_cents, status, paid_at, paid_amount_cents,
                            note, created_by, created_at)
select d.family_id, 'dues', 'Pack dues ' || d.season, d.season,
       (select value::int from public.pack_settings where key = 'dues_amount_cents'),
       case d.status when 'paid' then 'paid' else 'reported' end,
       case when d.status = 'paid' then coalesce((d.paid_on + time '12:00') at time zone 'America/New_York', d.updated_at) end,
       case when d.status = 'paid' then (select value::int from public.pack_settings where key = 'dues_amount_cents') end,
       left(d.note, 300), d.updated_by, d.updated_at
  from public.dues_payments d
on conflict do nothing;

drop table public.dues_payments;
delete from public.pack_settings where key in ('dues_amount', 'dues_how');

-- -----------------------------------------------------------------------------
-- 7. Event fees, kept in step with RSVPs
-- -----------------------------------------------------------------------------
alter table public.events
    add column fee_family_cents int check (fee_family_cents between 0 and 100000),
    add column fee_scout_cents  int check (fee_scout_cents between 0 and 100000),
    add column fee_adult_cents  int check (fee_adult_cents between 0 and 100000);

-- Bring one family's (or one adult's) event charge in line with their RSVP:
--   yes   -> the charge is family fee + scouts x scout fee + adults x adult fee (added, or updated
--            while it's still open or reported);
--   no    -> an open charge is canceled;
--   maybe -> nothing changes.
-- Paid and waived charges are never touched.
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
         where kind = 'event' and event_id = p_event_id and status <> 'canceled' and family_id = p_family_id;
    else
        select * into r from public.event_rsvps where event_id = p_event_id and family_id is null and adult_id = p_adult_id;
        select * into c from public.charges
         where kind = 'event' and event_id = p_event_id and status <> 'canceled' and family_id is null and adult_id = p_adult_id;
    end if;
    if c.id is not null and c.status not in ('open', 'reported') then return; end if;   -- paid or waived

    if not has_fee or r.id is null or r.status = 'no' then
        if c.id is not null and c.status = 'open' then
            update public.charges set status = 'canceled' where id = c.id;
        end if;
        return;
    end if;
    if r.status <> 'yes' then return; end if;

    amt := least(coalesce(e.fee_family_cents, 0) + r.scouts * coalesce(e.fee_scout_cents, 0)
                 + r.adults * coalesce(e.fee_adult_cents, 0), 100000);
    if c.id is null then
        if amt > 0 then
            insert into public.charges (family_id, adult_id, kind, title, event_id, amount_cents, due_on, created_by)
            values (p_family_id, case when p_family_id is null then p_adult_id end, 'event', left(e.title, 120), e.id, amt,
                    coalesce(e.rsvp_by, (e.starts_at at time zone 'America/New_York')::date), private.current_adult_id())
            on conflict do nothing;
        end if;
    elsif amt = 0 and c.status = 'open' then
        update public.charges set status = 'canceled' where id = c.id;
    elsif c.amount_cents <> amt then
        update public.charges set amount_cents = amt where id = c.id;
    end if;
end;
$$;
revoke execute on function private.sync_event_charge(uuid, uuid, uuid) from public, anon, authenticated;

-- Same as before (20261001000300_twh_replacement.sql), plus keeping the event charge in step.
create or replace function public.set_rsvp(p_event_id uuid, p_status text, p_scouts int, p_adults int, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare
    e public.events;
    me uuid := private.current_adult_id();
    fam uuid := private.my_family_id();
begin
    if me is null then raise exception 'Not on the pack roster' using errcode = '42501'; end if;
    if not private.can_see_event(p_event_id) then raise exception 'Event not found' using errcode = 'P0002'; end if;
    select * into e from public.events where id = p_event_id;
    if not e.rsvp_enabled then raise exception 'This event is not taking RSVPs' using errcode = '22023'; end if;
    if e.archived_at is not null or coalesce(e.ends_at, e.starts_at) < now()
       or (e.rsvp_by is not null and e.rsvp_by < (now() at time zone 'America/New_York')::date) then
        raise exception 'RSVPs for this event are closed' using errcode = '22023';
    end if;
    if p_status not in ('yes', 'maybe', 'no') then raise exception 'Pick yes, maybe or no' using errcode = '22023'; end if;
    if fam is not null then
        insert into public.event_rsvps (event_id, family_id, adult_id, status, scouts, adults, note)
        values (p_event_id, fam, me, p_status,
                case when p_status = 'no' then 0 else least(greatest(coalesce(p_scouts, 0), 0), 20) end,
                case when p_status = 'no' then 0 else least(greatest(coalesce(p_adults, 0), 0), 20) end,
                left(nullif(trim(p_note), ''), 300))
        on conflict (event_id, family_id) where family_id is not null
        do update set adult_id = excluded.adult_id, status = excluded.status, scouts = excluded.scouts,
                      adults = excluded.adults, note = excluded.note, updated_at = now();
    else
        insert into public.event_rsvps (event_id, family_id, adult_id, status, scouts, adults, note)
        values (p_event_id, null, me, p_status, 0,
                case when p_status = 'no' then 0 else least(greatest(coalesce(p_adults, 1), 0), 20) end,
                left(nullif(trim(p_note), ''), 300))
        on conflict (event_id, adult_id) where family_id is null
        do update set status = excluded.status, adults = excluded.adults, note = excluded.note, updated_at = now();
    end if;
    perform private.sync_event_charge(p_event_id, fam, case when fam is null then me end);
end;
$$;
revoke execute on function public.set_rsvp(uuid, text, int, int, text) from public, anon;
grant execute on function public.set_rsvp(uuid, text, int, int, text) to authenticated;

-- Leaders changed an event's cost: bring every RSVP's charge up to date (paid ones stay as they are).
create or replace function public.refresh_event_charges(p_event_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r record;
begin
    if not private.is_leader() then raise exception 'Leaders only' using errcode = '42501'; end if;
    for r in select family_id, adult_id from public.event_rsvps where event_id = p_event_id loop
        perform private.sync_event_charge(p_event_id, r.family_id, case when r.family_id is null then r.adult_id end);
    end loop;
end;
$$;
revoke execute on function public.refresh_event_charges(uuid) from public, anon;
grant execute on function public.refresh_event_charges(uuid) to authenticated;
