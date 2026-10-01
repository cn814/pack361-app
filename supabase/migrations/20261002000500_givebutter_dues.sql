-- Pack dues paid on Givebutter.
-- Families pay dues ($255 per scout, less a sibling discount for each additional scout) on the
-- pack's Givebutter dues campaign. The Givebutter sync matches each paid dues order to a family
-- (payer email, then the parent email they typed) and to that family's scouts (by first name), and
-- marks each scout's dues charge paid. Orders it can't place are left "needs review" for the
-- committee to match by hand on the Money page.
--   1. charges            paid_via 'givebutter', and which Givebutter order paid it
--   2. givebutter_orders  how the order was matched. Scout names, phone numbers and addresses from
--                         Givebutter are only used during the sync and never stored.
--   3. settings           which campaign is the dues campaign, the sibling discount, $255 dues
--   4. functions          apply an order (sync and committee), "not dues", dues setup shortcut
--   5. RLS                dues orders: the family's own, or the committee (not every den leader)

-- -----------------------------------------------------------------------------
-- 1. Charges
-- -----------------------------------------------------------------------------
alter table public.charges drop constraint charges_paid_via_check;
alter table public.charges add constraint charges_paid_via_check
    check (paid_via in ('paypal', 'givebutter', 'cash', 'check', 'other'));
alter table public.charges
    add column givebutter_order_id bigint references public.givebutter_orders(id) on delete set null;
create index charges_givebutter_order_idx on public.charges (givebutter_order_id) where givebutter_order_id is not null;

-- -----------------------------------------------------------------------------
-- 2. Givebutter orders: dues matching
-- -----------------------------------------------------------------------------
alter table public.givebutter_orders
    add column matched_scout_ids uuid[] not null default '{}',
    add column dues_match        text check (dues_match in ('matched', 'partial', 'needs_review', 'not_dues')),
    add column dues_note         text check (length(dues_note) <= 120),   -- "2 of 2 scouts matched"; never names
    add column dues_applied_at   timestamptz;                             -- done: the sync won't touch it again

-- -----------------------------------------------------------------------------
-- 3. Settings
-- -----------------------------------------------------------------------------
insert into public.pack_settings (key, value) values
    ('dues_givebutter_campaign_id', ''),
    ('dues_sibling_discount_cents', '1000')
on conflict (key) do nothing;
update public.pack_settings set value = '25500', updated_at = now()
 where key = 'dues_amount_cents' and coalesce(nullif(trim(value), ''), '0') = '0';
insert into public.pack_settings (key, value) values ('dues_amount_cents', '25500') on conflict (key) do nothing;

-- Same as before (20261002000000_payments.sql), plus the dues campaign and the sibling discount.
create or replace function public.save_pay_settings(p_values jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
    k text;
    v text;
begin
    if not private.is_committee() then raise exception 'Committee only' using errcode = '42501'; end if;
    for k, v in select key, value from jsonb_each_text(p_values) loop
        if k not in ('dues_season', 'registration_year', 'dues_amount_cents', 'national_youth_cents', 'national_adult_cents',
                     'council_youth_cents', 'council_adult_cents', 'pay_other_how',
                     'dues_givebutter_campaign_id', 'dues_sibling_discount_cents') then
            raise exception 'Not a payment setting: %', k using errcode = '22023';
        end if;
        if k like '%_cents' and (v !~ '^\d{1,6}$' or v::int > 100000) then
            raise exception 'Amounts must be $0 to $1,000' using errcode = '22023';
        end if;
        if k = 'dues_season' and v !~ '^\d{4}-\d{2}$' then raise exception 'Write the season like 2026-27' using errcode = '22023'; end if;
        if k = 'registration_year' and v !~ '^(\d{4})?$' then raise exception 'Write the year like 2027' using errcode = '22023'; end if;
        if k = 'pay_other_how' and length(v) > 600 then raise exception 'Keep it under 600 characters' using errcode = '22023'; end if;
        if k = 'dues_givebutter_campaign_id' and v <> ''
           and (v !~ '^\d{1,18}$' or not exists (select 1 from public.givebutter_campaigns c where c.id = v::bigint)) then
            raise exception 'Pick one of the synced Givebutter campaigns' using errcode = '22023';
        end if;
        insert into public.pack_settings (key, value, updated_at) values (k, v, now())
        on conflict (key) do update set value = excluded.value, updated_at = now();
    end loop;
end;
$$;
revoke execute on function public.save_pay_settings(jsonb) from public, anon;
grant execute on function public.save_pay_settings(jsonb) to authenticated;

-- A setting as text / cents (0 when unset or not a number).
create or replace function private.setting(p_key text)
returns text language sql stable security definer set search_path = '' as $$
    select coalesce((select value from public.pack_settings where key = p_key), '')
$$;
revoke execute on function private.setting(text) from public, anon;
grant execute on function private.setting(text) to authenticated;

create or replace function private.setting_cents(p_key text)
returns int language sql stable security definer set search_path = '' as $$
    select case when private.setting(p_key) ~ '^\d{1,6}$' then least(private.setting(p_key)::int, 100000) else 0 end
$$;
revoke execute on function private.setting_cents(text) from public, anon;
grant execute on function private.setting_cents(text) to authenticated;

-- The Givebutter campaign families pay dues on (null when not picked).
create or replace function private.dues_campaign_id()
returns bigint language sql stable security definer set search_path = '' as $$
    select case when private.setting('dues_givebutter_campaign_id') ~ '^\d{1,18}$'
                then private.setting('dues_givebutter_campaign_id')::bigint end
$$;
revoke execute on function private.dues_campaign_id() from public, anon;
grant execute on function private.dues_campaign_id() to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Functions
-- -----------------------------------------------------------------------------
-- Siblings are put in a fixed order (first added to the roster first): the first scout in a
-- family pays full dues, each one after that gets the sibling discount.
--
-- Apply one Givebutter dues order to a family and some of its scouts:
--   * each scout gets a dues charge for the season if they don't have one ("Pack dues 2026-27 – Sky");
--   * that scout's open (or "family says paid") dues charge is marked paid on Givebutter, on the
--     order's date; the order's amount is split across them in proportion to their amounts, so
--     they add up to exactly what the family paid;
--   * an open per-family dues charge for the season is marked paid too (at $0: the money is on
--     the scouts' charges);
--   * paid, waived and canceled charges are never touched;
--   * the order is marked done (dues_applied_at), so the sync never marks anything paid for it
--     again, even when a leader reopens one of its charges.
-- No family or no scouts: the order is left "needs review" (and stays open for the next sync or a
-- leader). Returns the order's dues_match, or 'already' when it was done before.
create or replace function private.apply_gb_dues(p_order_id bigint, p_family_id uuid, p_scout_ids uuid[],
                                                 p_match text, p_note text, p_by uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
    o public.givebutter_orders;
    v_season text := private.setting('dues_season');
    full_cents int := private.setting_cents('dues_amount_cents');
    second_cents int := greatest(private.setting_cents('dues_amount_cents') - private.setting_cents('dues_sibling_discount_cents'), 0);
    scouts uuid[];
    ids uuid[] := '{}';
    amts int[] := '{}';
    s record;
    ch public.charges;
    i int := 0;
    n int;
    total_cents int;
    order_cents int;
    share int;
    given int := 0;
    paid_on timestamptz;
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

    for s in select x.id, x.first_name from public.scouts x where x.id = any (scouts) order by x.created_at, x.first_name, x.id loop
        i := i + 1;
        select * into ch from public.charges c
         where c.kind = 'dues' and c.season = v_season and c.scout_id = s.id and c.status <> 'canceled'
         order by c.created_at limit 1 for update;
        if not found then
            insert into public.charges (family_id, scout_id, kind, title, season, amount_cents, created_by)
            values (p_family_id, s.id, 'dues', left(format('Pack dues %s – %s', v_season, s.first_name), 120), v_season,
                    case when i = 1 then full_cents else second_cents end, p_by)
            returning * into ch;
        end if;
        if ch.status in ('open', 'reported') then
            ids := ids || ch.id;
            amts := amts || ch.amount_cents;
        end if;
    end loop;

    paid_on := coalesce(o.created_at, now());
    order_cents := least(greatest(round(coalesce(o.amount, 0) * 100)::int, 0), 1000000);
    n := cardinality(ids);
    select coalesce(sum(a), 0) into total_cents from unnest(amts) a;
    for i in 1 .. n loop
        if i = n then
            share := order_cents - given;
        elsif total_cents > 0 then
            share := floor(order_cents::numeric * amts[i] / total_cents)::int;
        else
            share := order_cents / n;
        end if;
        given := given + share;
        update public.charges
           set status = 'paid', paid_via = 'givebutter', paid_at = paid_on, paid_amount_cents = share,
               givebutter_order_id = o.id, pending_payment_id = null, pending_since = null
         where id = ids[i];
    end loop;

    update public.charges
       set status = 'paid', paid_via = 'givebutter', paid_at = paid_on, paid_amount_cents = 0, givebutter_order_id = o.id,
           note = coalesce(note, 'Paid on Givebutter, per scout'), pending_payment_id = null, pending_since = null
     where kind = 'dues' and season = v_season and family_id = p_family_id and scout_id is null and adult_id is null
       and status = 'open';

    update public.givebutter_orders
       set dues_match = p_match, dues_note = left(nullif(trim(p_note), ''), 120), family_id = p_family_id,
           matched_scout_ids = scouts, dues_applied_at = now()
     where id = o.id;
    return p_match;
end;
$$;
revoke execute on function private.apply_gb_dues(bigint, uuid, uuid[], text, text, uuid) from public, anon, authenticated;

-- The Givebutter sync (secret key only) applies what it matched.
create or replace function public.apply_givebutter_dues(p_order_id bigint, p_family_id uuid, p_scout_ids uuid[],
                                                        p_match text, p_note text)
returns text language plpgsql security definer set search_path = '' as $$
begin
    if p_match not in ('matched', 'partial', 'needs_review') then raise exception 'Bad match' using errcode = '22023'; end if;
    if not exists (select 1 from public.givebutter_orders where id = p_order_id and campaign_id = private.dues_campaign_id()) then
        raise exception 'Not a dues order' using errcode = '22023';
    end if;
    return private.apply_gb_dues(p_order_id, p_family_id, p_scout_ids, p_match, p_note, null);
end;
$$;
revoke execute on function public.apply_givebutter_dues(bigint, uuid, uuid[], text, text) from public, anon, authenticated;
grant execute on function public.apply_givebutter_dues(bigint, uuid, uuid[], text, text) to service_role;

-- Committee: match a "needs review" dues order to a family and the scouts it paid for.
create or replace function public.match_givebutter_dues(p_order_id bigint, p_family_id uuid, p_scout_ids uuid[])
returns text language plpgsql security definer set search_path = '' as $$
declare
    picked int;
    r text;
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
    return r;
end;
$$;
revoke execute on function public.match_givebutter_dues(bigint, uuid, uuid[]) from public, anon;
grant execute on function public.match_givebutter_dues(bigint, uuid, uuid[]) to authenticated;

-- Committee: this order isn't dues (a donation, say), so the sync leaves it alone; or undo that.
create or replace function public.set_givebutter_not_dues(p_order_id bigint, p_not_dues boolean)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
    if not private.is_committee() then raise exception 'Committee only' using errcode = '42501'; end if;
    if p_not_dues then
        update public.givebutter_orders
           set dues_match = 'not_dues', dues_note = 'Not dues', matched_scout_ids = '{}', dues_applied_at = now()
         where id = p_order_id and dues_applied_at is null;
    else
        update public.givebutter_orders
           set dues_match = null, dues_note = null, dues_applied_at = null
         where id = p_order_id and dues_match = 'not_dues';
    end if;
    get diagnostics n = row_count;
    return n;
end;
$$;
revoke execute on function public.set_givebutter_not_dues(bigint, boolean) from public, anon;
grant execute on function public.set_givebutter_not_dues(bigint, boolean) to authenticated;

-- Committee: dues for every active scout for the dues season (full dues for the first scout in a
-- family, the sibling discount for each one after). Skips scouts who already have dues for the
-- season, and families that already have one dues charge for the whole family.
create or replace function public.add_dues_charges(p_due_on date)
returns table (added int, skipped int)
language plpgsql security definer set search_path = '' as $$
declare
    me uuid := private.current_adult_id();
    v_season text := private.setting('dues_season');
    full_cents int := private.setting_cents('dues_amount_cents');
    second_cents int := greatest(private.setting_cents('dues_amount_cents') - private.setting_cents('dues_sibling_discount_cents'), 0);
    n_targets int;
    n_added int;
begin
    if not private.is_committee() then raise exception 'Committee only' using errcode = '42501'; end if;
    if v_season !~ '^\d{4}-\d{2}$' then raise exception 'Set the dues season first' using errcode = '22023'; end if;
    if full_cents = 0 then raise exception 'Set the dues amount first' using errcode = '22023'; end if;

    with targets as (
        select s.family_id, s.id as scout_id, s.first_name,
               row_number() over (partition by s.family_id order by s.created_at, s.first_name, s.id) as rank
          from public.scouts s join public.families f on f.id = s.family_id
         where s.is_active and f.is_active
    ), todo as (
        select t.* from targets t
         where not exists (select 1 from public.charges c
                            where c.kind = 'dues' and c.season = v_season and c.family_id = t.family_id
                              and c.scout_id is null and c.adult_id is null and c.status <> 'canceled')
    ), ins as (
        insert into public.charges (family_id, scout_id, kind, title, season, amount_cents, due_on, created_by)
        select t.family_id, t.scout_id, 'dues', left(format('Pack dues %s – %s', v_season, t.first_name), 120), v_season,
               case when t.rank = 1 then full_cents else second_cents end, p_due_on, me
          from todo t
        on conflict do nothing
        returning 1
    )
    select (select count(*) from targets), (select count(*) from ins) into n_targets, n_added;
    return query select n_added, n_targets - n_added;
end;
$$;
revoke execute on function public.add_dues_charges(date) from public, anon;
grant execute on function public.add_dues_charges(date) to authenticated;

-- Same as before (20261002000000_payments.sql), except reopening also forgets which Givebutter
-- order paid it. Givebutter payments can be reopened (refund them in Givebutter); the sync won't
-- mark them paid again. PayPal payments still can't be reopened here.
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
        update public.charges
           set status = 'open', paid_via = null, paid_at = null, paid_amount_cents = null, report_note = null,
               givebutter_order_id = null, pending_payment_id = null, pending_since = null
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

-- -----------------------------------------------------------------------------
-- 5. Row Level Security: families see their own orders; the committee sees all. Den leaders keep
--    seeing event sign-ups and store orders, but not who paid dues.
-- -----------------------------------------------------------------------------
drop policy gb_orders_read on public.givebutter_orders;
create policy gb_orders_read on public.givebutter_orders for select to authenticated
    using ((family_id is not null and family_id = private.my_family_id())
           or private.is_committee()
           or (private.is_leader() and campaign_id is distinct from private.dues_campaign_id()));
