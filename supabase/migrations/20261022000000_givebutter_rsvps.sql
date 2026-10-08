-- Givebutter sign-ups fill in the app's RSVPs.
--
-- For an event with a Givebutter campaign (a campout), a family that paid there is going: the
-- morning sync (and Sync now) gives them a "yes" RSVP with how many scouts, siblings and adults
-- their tickets were for. The app works the counts out from the ticket names in memory; names are
-- never stored, only the three numbers.
--   1. event_rsvps.givebutter_at: when the sync last wrote this answer. An answer is "from
--      Givebutter" while updated_at <= givebutter_at; once the family changes it in the app
--      (set_rsvp moves updated_at), it's theirs.
--   2. sync_givebutter_rsvps(p_event_ids, p_rows) (the sync only, with the secret key):
--        - no answer yet: a "yes" with the Givebutter counts;
--        - an answer the sync wrote: kept up to date;
--        - the family's own answer: replaced only if they paid after giving it (paid_at is newer);
--        - an answer the sync wrote for a family that no longer has a paid order: removed.
--      Givebutter answers are never waitlisted, and no app charge is made for them (they paid on
--      Givebutter): rows are written directly, not through set_rsvp().
begin;

alter table public.event_rsvps add column if not exists givebutter_at timestamptz;

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

        perform private.lock_event_rsvps(v_event);
        select * into prev from public.event_rsvps where event_id = v_event and family_id = v_family;
        if prev.id is null then
            insert into public.event_rsvps (event_id, family_id, adult_id, status, scouts, siblings, adults, note,
                                            waitlisted, waitlisted_at, updated_at, givebutter_at)
            values (v_event, v_family, null, 'yes', v_scouts, v_siblings, v_adults, null, false, null, now(), now())
            returning id into prev.id;
            n_add := n_add + 1;
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
