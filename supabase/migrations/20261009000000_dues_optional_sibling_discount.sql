-- Pack dues: the sibling discount is optional. A family that pays full price for every scout
-- ($510 for two, instead of $500 with the discount) is a normal match, not "paid $10 more than
-- was due". The extra is put on the discounted scout's dues so paid totals match what came in.
-- Orders already flagged that way are corrected the same way below.

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
    allow int;
    full_price boolean := false;
    paid_on timestamptz;
    v_match text;
    v_note text;
begin
    select * into o from public.givebutter_orders where id = p_order_id for update;
    if not found then raise exception 'Order not found' using errcode = 'P0002'; end if;
    if o.dues_applied_at is not null then return 'already'; end if;
    if v_season !~ '^[0-9]{4}-[0-9]{2}$' then raise exception 'Set the dues season first' using errcode = '22023'; end if;

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

    -- The sibling discount is optional: an order that pays full price for every scout is a
    -- normal match. The extra goes onto the discounted scouts' dues, so paid totals match
    -- what came in.
    extra := order_cents - total_cents;
    allow := greatest(full_cents * n - total_cents, 0);
    if extra > 0 and extra <= allow then
        for i in 1 .. n loop
            exit when extra = 0;
            if t_amts[i] < full_cents then
                total_cents := least(full_cents - t_amts[i], extra);
                t_amts[i] := t_amts[i] + total_cents;
                extra := extra - total_cents;
            end if;
        end loop;
        full_price := true;
    end if;
    select coalesce(sum(a), 0) into total_cents from unnest(t_amts) a;

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
               amount_cents = greatest(amount_cents, t_amts[i]),
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
                   when full_price then concat_ws('; ', nullif(trim(p_note), ''), 'full price, no sibling discount')
                   else nullif(trim(p_note), '') end;
    update public.givebutter_orders
       set dues_match = v_match, dues_note = left(v_note, 120), family_id = p_family_id,
           matched_scout_ids = scouts, dues_applied_at = now()
     where id = o.id;
    return v_match;
end;
$$;
revoke execute on function private.apply_gb_dues(bigint, uuid, uuid[], text, text, uuid) from public, anon, authenticated;


-- Orders already applied and flagged only because they skipped the discount.
do $$
declare
    o record;
    ch record;
    full_cents int := private.setting_cents('dues_amount_cents');
    n int;
    paid int;
    extra int;
    add int;
begin
    if full_cents <= 0 then return; end if;
    for o in select * from public.givebutter_orders
              where dues_match = 'partial' and dues_applied_at is not null and dues_note like 'Paid $% more than was due%' loop
        select count(*), coalesce(sum(paid_amount_cents), 0) into n, paid
          from public.charges where givebutter_order_id = o.id and status = 'paid' and kind = 'dues';
        extra := round(coalesce(o.amount, 0) * 100)::int - paid;
        if n = 0 or extra <= 0 or paid + extra > full_cents * n then continue; end if;
        for ch in select id, paid_amount_cents from public.charges
                   where givebutter_order_id = o.id and status = 'paid' and kind = 'dues' and paid_amount_cents < full_cents
                   order by paid_amount_cents, id loop
            exit when extra = 0;
            add := least(full_cents - ch.paid_amount_cents, extra);
            update public.charges
               set paid_amount_cents = paid_amount_cents + add, amount_cents = greatest(amount_cents, paid_amount_cents + add)
             where id = ch.id;
            extra := extra - add;
        end loop;
        update public.givebutter_orders
           set dues_match = 'matched',
               dues_note = left(concat_ws('; ', nullif(regexp_replace(dues_note, '^Paid [$][0-9.,]+ more than was due;? ?', ''), ''),
                                          'full price, no sibling discount'), 120)
         where id = o.id;
    end loop;
end;
$$;
