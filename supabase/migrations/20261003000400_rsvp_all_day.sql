-- RSVPs for all-day events (a sale day, a council weekend) stay open through the event's last
-- day in Eastern time, instead of closing at midnight that morning. Same as the app's
-- eventOver(). Otherwise set_rsvp is unchanged from 20261002000000_payments.sql.
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

