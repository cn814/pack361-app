-- Den leaders take attendance for their own dens at pack events; payments in the app fill RSVPs.
--
-- 1. At a pack meeting or campout a den leader sees just their den's scouts (the app filters the
--    list), so their Save must only change their own dens: record_event_attendance() now replaces
--    the list only for the scouts in the dens the caller leads. Key leaders (committee, Cubmaster,
--    admins) and leaders who don't lead a den still save for the whole pack, as before. Same as
--    20261005000100_attendance.sql otherwise.
--
-- 2. sync_givebutter_rsvps(): rows can say only_if_missing (a family that paid for the event in the
--    app, by PayPal or marked paid by a leader). Those give a "yes" to a family with no answer, or
--    turn an older "no"/"maybe"/waitlist answer into "yes"; a family's own "yes" and its numbers
--    stand. Same as 20261022000000_givebutter_rsvps.sql otherwise.
begin;

create or replace function public.record_event_attendance(p_event_id uuid, p_scout_ids uuid[])
returns int language plpgsql security definer set search_path = '' as $$
declare
    me    uuid := private.current_adult_id();
    today date := (now() at time zone 'America/New_York')::date;
    e     public.events;
    v_ids uuid[];
    v_dens uuid[];   -- the dens this save covers; null = the whole pack
begin
    if me is null or not private.is_leader() then
        raise exception 'Only leaders can take attendance' using errcode = '42501';
    end if;
    select * into e from public.events where id = p_event_id;
    if not found then raise exception 'Event not found' using errcode = 'P0002'; end if;
    if (e.starts_at at time zone 'America/New_York')::date > today then
        raise exception 'You can take attendance on the day of the event or after' using errcode = '22023';
    end if;
    if not private.is_committee() then
        select array_agg(d) into v_dens from private.my_led_den_ids() d;
    end if;

    -- One save at a time per event, so a double tap can't interleave.
    perform pg_advisory_xact_lock(hashtextextended('event_attendance:' || p_event_id::text, 0));

    select coalesce(array_agg(s.id), '{}') into v_ids
      from public.scouts s
     where s.id = any(coalesce(p_scout_ids, '{}'))
       and (v_dens is null or s.den_id = any(v_dens))
       and (s.is_active
            or exists (select 1 from public.event_attendance x where x.event_id = p_event_id and x.scout_id = s.id));

    delete from public.event_attendance x
     where x.event_id = p_event_id and not (x.scout_id = any(v_ids))
       and (v_dens is null or exists (select 1 from public.scouts s where s.id = x.scout_id and s.den_id = any(v_dens)));
    insert into public.event_attendance (event_id, scout_id, recorded_by)
    select p_event_id, unnest(v_ids), me
    on conflict do nothing;

    update public.events set attendance_taken_at = now() where id = p_event_id;
    return cardinality(v_ids);
end;
$$;
revoke execute on function public.record_event_attendance(uuid, uuid[]) from public, anon;
grant execute on function public.record_event_attendance(uuid, uuid[]) to authenticated;

create or replace function public.sync_givebutter_rsvps(p_event_ids uuid[], p_rows jsonb)
returns table (added int, updated int, removed int)
language plpgsql security definer set search_path = '' as $$
declare
    r jsonb;
    v_event uuid;
    v_family uuid;
    v_scouts int;
    v_siblings int;
    v_adults int;
    v_paid timestamptz;
    v_soft boolean;
    prev public.event_rsvps;
    n_add int := 0;
    n_up int := 0;
    n_del int := 0;
    keep uuid[] := '{}';
begin
    -- Only the sync (the secret key, no signed-in person) runs this; execute is granted to it alone.
    if auth.uid() is not null then
        raise exception 'Only the Givebutter sync can do this' using errcode = '42501';
    end if;
    if jsonb_typeof(p_rows) is distinct from 'array' then
        raise exception 'Expected a list' using errcode = '22023';
    end if;

    for r in select * from jsonb_array_elements(p_rows) loop
        v_event := (r ->> 'event_id')::uuid;
        v_family := (r ->> 'family_id')::uuid;
        if v_event is null or v_family is null or not (v_event = any(coalesce(p_event_ids, '{}'))) then continue; end if;
        if not exists (select 1 from public.families f where f.id = v_family)
           or not exists (select 1 from public.events e where e.id = v_event) then continue; end if;
        v_scouts := least(greatest(coalesce((r ->> 'scouts')::int, 0), 0), 20);
        v_siblings := least(greatest(coalesce((r ->> 'siblings')::int, 0), 0), 20);
        v_adults := least(greatest(coalesce((r ->> 'adults')::int, 0), 0), 20);
        v_paid := coalesce((r ->> 'paid_at')::timestamptz, now());
        v_soft := coalesce((r ->> 'only_if_missing')::boolean, false);

        perform private.lock_event_rsvps(v_event);
        select * into prev from public.event_rsvps where event_id = v_event and family_id = v_family;
        if prev.id is null then
            insert into public.event_rsvps (event_id, family_id, adult_id, status, scouts, siblings, adults, note,
                                            waitlisted, waitlisted_at, updated_at, givebutter_at)
            values (v_event, v_family, null, 'yes', v_scouts, v_siblings, v_adults, null, false, null, now(), now())
            returning id into prev.id;
            n_add := n_add + 1;
        elsif v_soft then
            -- Paid in the app (PayPal, or marked paid): the numbers are a guess, so a family's own
            -- "yes" stands; a "no", "maybe" or waitlist answer older than the payment becomes "yes".
            if (prev.status <> 'yes' or prev.waitlisted) and v_paid > prev.updated_at then
                update public.event_rsvps
                   set status = 'yes', waitlisted = false, waitlisted_at = null,
                       scouts = case when prev.scouts + prev.adults + prev.siblings = 0 then v_scouts else prev.scouts end,
                       siblings = case when prev.scouts + prev.adults + prev.siblings = 0 then v_siblings else prev.siblings end,
                       adults = case when prev.scouts + prev.adults + prev.siblings = 0 then v_adults else prev.adults end,
                       updated_at = now(), givebutter_at = now()
                 where id = prev.id;
                n_up := n_up + 1;
            end if;
        elsif (prev.givebutter_at is not null and prev.updated_at <= prev.givebutter_at) or v_paid > prev.updated_at then
            if prev.status <> 'yes' or prev.waitlisted or prev.scouts <> v_scouts or prev.siblings <> v_siblings
               or prev.adults <> v_adults or prev.givebutter_at is null or prev.updated_at > prev.givebutter_at then
                update public.event_rsvps
                   set status = 'yes', scouts = v_scouts, siblings = v_siblings, adults = v_adults,
                       waitlisted = false, waitlisted_at = null, updated_at = now(), givebutter_at = now()
                 where id = prev.id;
                n_up := n_up + 1;
            end if;
        end if;
        keep := keep || prev.id;
    end loop;

    -- Answers the sync wrote whose family no longer has a paid order (refunded, canceled).
    with gone as (
        delete from public.event_rsvps x
         where x.event_id = any(coalesce(p_event_ids, '{}'))
           and x.givebutter_at is not null and x.updated_at <= x.givebutter_at
           and not (x.id = any(keep))
        returning 1)
    select count(*)::int into n_del from gone;

    return query select n_add, n_up, n_del;
end;
$$;
revoke execute on function public.sync_givebutter_rsvps(uuid[], jsonb) from public, anon, authenticated;
grant execute on function public.sync_givebutter_rsvps(uuid[], jsonb) to service_role;

commit;
