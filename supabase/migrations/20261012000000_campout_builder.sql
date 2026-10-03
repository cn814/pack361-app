-- Campout builder: leaders build an event's schedule, packing list, info sections and links in
-- the app (no more SQL), start from a past event, copy an event to a new date, and add events
-- that repeat (every week, every other week, or monthly), linked by a series id.
--
-- Who can do what is unchanged: leaders write, members read (the itinerary_items,
-- packing_items, events and volunteer_slots policies already say so). The functions below run
-- as the person calling them, so those same rules apply inside them.
--
-- Safe to run once on the live database. Run in the Supabase SQL editor.

begin;

-- -----------------------------------------------------------------------------
-- 1. Repeating events share a series id
-- -----------------------------------------------------------------------------
alter table public.events add column if not exists series_id uuid;
create index if not exists events_series_idx on public.events (series_id) where series_id is not null;

-- -----------------------------------------------------------------------------
-- 2. Sensible limits on what leaders type in (the app checks the same, with friendlier words)
-- -----------------------------------------------------------------------------
-- Links open on families' phones: https only. Sections need a title.
alter table public.events drop constraint if exists events_links_https;
alter table public.events add constraint events_links_https check (
    jsonb_typeof(links) = 'array'
    and jsonb_array_length(links) <= 50
    and not jsonb_path_exists(links,
        '$[*] ? (!exists(@.url) || @.url.type() != "string" || !(@.url like_regex "^https://" flag "i"))')
) not valid;

alter table public.events drop constraint if exists events_sections_shape;
alter table public.events add constraint events_sections_shape check (
    jsonb_typeof(sections) = 'array'
    and jsonb_array_length(sections) <= 50
    and not jsonb_path_exists(sections, '$[*] ? (!exists(@.title) || @.title.type() != "string")')
) not valid;

alter table public.itinerary_items drop constraint if exists itinerary_items_lengths;
alter table public.itinerary_items add constraint itinerary_items_lengths check (
    length(title) between 1 and 300
    and coalesce(length(location), 0) <= 300
    and coalesce(length(notes), 0) <= 1000
) not valid;

alter table public.packing_items drop constraint if exists packing_items_lengths;
alter table public.packing_items add constraint packing_items_lengths check (
    length(category) between 1 and 100
    and length(label) between 1 and 300
    and coalesce(length(detail), 0) <= 500
) not valid;

-- Check the rows already there too. If an old row doesn't fit, the migration still goes
-- through (the limit then applies to new and changed rows only) and says which one.
do $$
declare c text;
begin
    foreach c in array array['events.events_links_https', 'events.events_sections_shape',
                             'itinerary_items.itinerary_items_lengths', 'packing_items.packing_items_lengths'] loop
        begin
            execute format('alter table public.%I validate constraint %I', split_part(c, '.', 1), split_part(c, '.', 2));
        exception when check_violation then
            raise notice 'Some existing rows do not fit %; new and changed rows are still checked.', c;
        end;
    end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 3. Moving a time to another day: same Eastern clock time, p_to minus p_from days later
-- -----------------------------------------------------------------------------
-- Daylight saving changes keep the clock time (7:00 PM stays 7:00 PM).
create or replace function private.shift_local(p_ts timestamptz, p_from date, p_to date)
returns timestamptz language sql stable set search_path = '' as $$
    select (((p_ts at time zone 'America/New_York')::date + (p_to - p_from))
            + (p_ts at time zone 'America/New_York')::time) at time zone 'America/New_York'
$$;
revoke execute on function private.shift_local(timestamptz, date, date) from public, anon;
grant execute on function private.shift_local(timestamptz, date, date) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Start from a past event: copy its schedule (moved to this event's dates, keeping each
--    item's day and time), packing list, info sections and links. Each part asked for
--    replaces what this event had for that part.
-- -----------------------------------------------------------------------------
create or replace function public.copy_event_plan(p_from uuid, p_to uuid, p_parts text[])
returns void language plpgsql set search_path = '' as $$
declare
    v_from public.events;
    v_to   public.events;
    v_from_day date;
    v_to_day   date;
begin
    if not private.is_leader() then
        raise exception 'Only leaders can build events' using errcode = '42501';
    end if;
    if p_from = p_to then
        raise exception 'Pick a different event to copy from' using errcode = '22023';
    end if;
    select * into v_from from public.events where id = p_from;
    select * into v_to from public.events where id = p_to;
    if v_from.id is null or v_to.id is null then
        raise exception 'Event not found' using errcode = 'P0002';
    end if;
    v_from_day := (v_from.starts_at at time zone 'America/New_York')::date;
    v_to_day   := (v_to.starts_at at time zone 'America/New_York')::date;

    if 'schedule' = any(p_parts) then
        delete from public.itinerary_items where event_id = p_to;
        insert into public.itinerary_items (event_id, starts_at, title, location, notes)
        select p_to, private.shift_local(i.starts_at, v_from_day, v_to_day), i.title, i.location, i.notes
          from public.itinerary_items i
         where i.event_id = p_from;
    end if;

    if 'packing' = any(p_parts) then
        delete from public.packing_items where event_id = p_to;
        insert into public.packing_items (event_id, category, label, detail, required, sort_order)
        select p_to, p.category, p.label, p.detail, p.required, row_number() over (order by p.sort_order, p.id)
          from public.packing_items p
         where p.event_id = p_from;
    end if;

    if 'sections' = any(p_parts) or 'links' = any(p_parts) then
        update public.events
           set sections = case when 'sections' = any(p_parts) then v_from.sections else sections end,
               links    = case when 'links' = any(p_parts) then v_from.links else links end
         where id = p_to;
    end if;
end;
$$;
revoke execute on function public.copy_event_plan(uuid, uuid, text[]) from public, anon;
grant execute on function public.copy_event_plan(uuid, uuid, text[]) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Copy an event to a new start date: details, cost, permission slip, sections, links,
--    schedule and deadlines moved by the same number of days, packing list, and volunteer
--    jobs (without who signed up). Not copied: RSVPs, the Signal group, attendance, photos,
--    TroopWebHost or council links, the series. The cost is copied only for the committee
--    (only they set prices); otherwise the copy has no cost. Returns the new event's id.
-- -----------------------------------------------------------------------------
create or replace function public.copy_event(p_from uuid, p_start date)
returns uuid language plpgsql set search_path = '' as $$
declare
    v_src   public.events;
    v_day   date;
    v_shift int;
    v_cost  boolean;
    v_new   uuid;
begin
    if not private.is_leader() then
        raise exception 'Only leaders can copy events' using errcode = '42501';
    end if;
    if p_start is null then
        raise exception 'Pick the new date' using errcode = '22023';
    end if;
    select * into v_src from public.events where id = p_from;
    if v_src.id is null then
        raise exception 'Event not found' using errcode = 'P0002';
    end if;
    v_day   := (v_src.starts_at at time zone 'America/New_York')::date;
    v_shift := p_start - v_day;
    v_cost  := private.is_committee();

    insert into public.events (
        title, category, starts_at, ends_at, all_day, location_name, address, details, signup_url,
        den_id, ranks, leaders_only, rsvp_enabled, rsvp_by,
        fee_family_cents, fee_scout_cents, fee_adult_cents, camping_nights,
        public_on_join, public_blurb, slip_required, slip_text, slip_document_id, slip_due,
        links, sections, source, created_by)
    values (
        v_src.title, v_src.category,
        private.shift_local(v_src.starts_at, v_day, p_start),
        case when v_src.ends_at is not null then private.shift_local(v_src.ends_at, v_day, p_start) end,
        v_src.all_day, v_src.location_name, v_src.address, v_src.details, v_src.signup_url,
        v_src.den_id, v_src.ranks, v_src.leaders_only, v_src.rsvp_enabled, v_src.rsvp_by + v_shift,
        case when v_cost then v_src.fee_family_cents end,
        case when v_cost then v_src.fee_scout_cents end,
        case when v_cost then v_src.fee_adult_cents end,
        v_src.camping_nights,
        v_src.public_on_join, v_src.public_blurb, v_src.slip_required, v_src.slip_text, v_src.slip_document_id,
        v_src.slip_due + v_shift,
        v_src.links, v_src.sections, 'manual', private.current_adult_id())
    returning id into v_new;

    -- The RSVP limit (added by the RSVP waitlist migration), when that column is there.
    if jsonb_typeof(to_jsonb(v_src) -> 'rsvp_limit') = 'number' then
        execute 'update public.events set rsvp_limit = $1 where id = $2'
          using (to_jsonb(v_src) ->> 'rsvp_limit')::int, v_new;
    end if;

    insert into public.itinerary_items (event_id, starts_at, title, location, notes)
    select v_new, private.shift_local(i.starts_at, v_day, p_start), i.title, i.location, i.notes
      from public.itinerary_items i
     where i.event_id = p_from;

    insert into public.packing_items (event_id, category, label, detail, required, sort_order)
    select v_new, p.category, p.label, p.detail, p.required, p.sort_order
      from public.packing_items p
     where p.event_id = p_from;

    insert into public.volunteer_slots (event_id, role_title, shift_label, starts_at, capacity, is_urgent, notes)
    select v_new, s.role_title, s.shift_label,
           case when s.starts_at is not null then private.shift_local(s.starts_at, v_day, p_start) end,
           s.capacity, s.is_urgent, s.notes
      from public.volunteer_slots s
     where s.event_id = p_from;

    return v_new;
end;
$$;
revoke execute on function public.copy_event(uuid, date) from public, anon;
grant execute on function public.copy_event(uuid, date) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Repeating events: copy the name, times, place and details of one event to the other
--    upcoming events in its series (each keeps its own date). Returns how many changed.
-- -----------------------------------------------------------------------------
create or replace function public.apply_to_series(p_event_id uuid)
returns int language plpgsql set search_path = '' as $$
declare
    v_e   public.events;
    v_day date;
    v_n   int;
begin
    if not private.is_leader() then
        raise exception 'Only leaders can change events' using errcode = '42501';
    end if;
    select * into v_e from public.events where id = p_event_id;
    if v_e.id is null then
        raise exception 'Event not found' using errcode = 'P0002';
    end if;
    if v_e.series_id is null then
        return 0;
    end if;
    v_day := (v_e.starts_at at time zone 'America/New_York')::date;
    update public.events o
       set title         = v_e.title,
           location_name = v_e.location_name,
           address       = v_e.address,
           details       = v_e.details,
           all_day       = v_e.all_day,
           starts_at     = private.shift_local(v_e.starts_at, v_day, (o.starts_at at time zone 'America/New_York')::date),
           ends_at       = case when v_e.ends_at is null then null
                                else private.shift_local(v_e.ends_at, v_day, (o.starts_at at time zone 'America/New_York')::date) end,
           source        = 'manual'
     where o.series_id = v_e.series_id
       and o.id <> v_e.id
       and o.starts_at > now()
       and o.archived_at is null;
    get diagnostics v_n = row_count;
    return v_n;
end;
$$;
revoke execute on function public.apply_to_series(uuid) from public, anon;
grant execute on function public.apply_to_series(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. Packing list order: number the event's items 1, 2, 3... in the order given
-- -----------------------------------------------------------------------------
create or replace function public.set_packing_order(p_event_id uuid, p_ids uuid[])
returns void language plpgsql set search_path = '' as $$
begin
    if not private.is_leader() then
        raise exception 'Only leaders can change the packing list' using errcode = '42501';
    end if;
    update public.packing_items p
       set sort_order = o.n
      from unnest(p_ids) with ordinality as o(id, n)
     where p.id = o.id and p.event_id = p_event_id;
end;
$$;
revoke execute on function public.set_packing_order(uuid, uuid[]) from public, anon;
grant execute on function public.set_packing_order(uuid, uuid[]) to authenticated;

commit;
