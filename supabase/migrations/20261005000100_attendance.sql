-- Attendance at pack events and campouts, and camping nights per scout (2026-10-05)
--   event_attendance           which scouts were at an event (pack meeting, campout, outing...).
--                              Den meetings keep their own den_meeting_attendance.
--   events.camping_nights      nights out for a campout. Blank (null) = worked out from the dates:
--                              the number of Eastern days between start and end (Fri to Sun = 2),
--                              0 for a one-day event. private.event_nights() does the sum;
--                              src/lib/attendance.ts mirrors it for the event form.
--   events.attendance_taken_at when a leader last saved attendance (so "nobody came" still counts
--                              as taken).
--   record_event_attendance()  leaders save who was there in one step, from the event's day on.
--   attendance_summary()       per scout: den meetings, events and camping nights for a date range.
--                              Runs as the caller, so it only counts what RLS lets them see.

-- -----------------------------------------------------------------------------
-- 1. Camping nights
-- -----------------------------------------------------------------------------
alter table public.events
    add column camping_nights smallint check (camping_nights between 0 and 14),
    add column attendance_taken_at timestamptz;

-- Nights an event counts for. A campout (or any event whose Eastern end date is after its start
-- date) counts the Eastern days between start and end; anything else is 0. A leader's number wins.
create or replace function private.event_nights(e public.events)
returns int language sql stable set search_path = '' as $$
    select coalesce(e.camping_nights::int,
        case when e.ends_at is not null
                  and (e.category = 'Campout'
                       or (e.ends_at at time zone 'America/New_York')::date > (e.starts_at at time zone 'America/New_York')::date)
             then greatest(0, (e.ends_at at time zone 'America/New_York')::date - (e.starts_at at time zone 'America/New_York')::date)
             else 0 end)
$$;
revoke execute on function private.event_nights(public.events) from public, anon;
grant execute on function private.event_nights(public.events) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Who was there
-- -----------------------------------------------------------------------------
create table public.event_attendance (
    event_id     uuid not null references public.events(id) on delete cascade,
    scout_id     uuid not null references public.scouts(id) on delete cascade,
    recorded_by  uuid references public.adults(id) on delete set null default private.current_adult_id(),
    recorded_at  timestamptz not null default now(),
    primary key (event_id, scout_id)
);
create index event_attendance_scout_idx on public.event_attendance(scout_id);

revoke all on public.event_attendance from anon, authenticated;
grant select on public.event_attendance to authenticated;   -- saved through record_event_attendance()
alter table public.event_attendance enable row level security;
-- Leaders see everyone; a family sees their own scouts.
create policy event_attendance_read on public.event_attendance for select to authenticated
    using (private.is_leader() or private.is_my_scout(scout_id));

-- -----------------------------------------------------------------------------
-- 3. Take attendance
-- -----------------------------------------------------------------------------
-- Replaces the list for the event with p_scout_ids (active scouts, or scouts already on this
-- event's list). Open from the event's start day (Eastern) on. Saving twice changes nothing.
create or replace function public.record_event_attendance(p_event_id uuid, p_scout_ids uuid[])
returns int language plpgsql security definer set search_path = '' as $$
declare
    me    uuid := private.current_adult_id();
    today date := (now() at time zone 'America/New_York')::date;
    e     public.events;
    v_ids uuid[];
begin
    if me is null or not private.is_leader() then
        raise exception 'Only leaders can take attendance' using errcode = '42501';
    end if;
    select * into e from public.events where id = p_event_id;
    if not found then raise exception 'Event not found' using errcode = 'P0002'; end if;
    if (e.starts_at at time zone 'America/New_York')::date > today then
        raise exception 'You can take attendance on the day of the event or after' using errcode = '22023';
    end if;

    -- One save at a time per event, so a double tap can't interleave.
    perform pg_advisory_xact_lock(hashtextextended('event_attendance:' || p_event_id::text, 0));

    select coalesce(array_agg(s.id), '{}') into v_ids
      from public.scouts s
     where s.id = any(coalesce(p_scout_ids, '{}'))
       and (s.is_active
            or exists (select 1 from public.event_attendance x where x.event_id = p_event_id and x.scout_id = s.id));

    delete from public.event_attendance where event_id = p_event_id and not (scout_id = any(v_ids));
    insert into public.event_attendance (event_id, scout_id, recorded_by)
    select p_event_id, unnest(v_ids), me
    on conflict do nothing;

    update public.events set attendance_taken_at = now() where id = p_event_id;
    return cardinality(v_ids);
end;
$$;
revoke execute on function public.record_event_attendance(uuid, uuid[]) from public, anon;
grant execute on function public.record_event_attendance(uuid, uuid[]) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Totals per scout
-- -----------------------------------------------------------------------------
-- For each scout the caller can see (or just p_scout_id):
--   den_meetings       den meetings attended between p_from and p_to
--   den_meetings_held  recorded meetings in that range for the dens the scout attended with
--                      (their current den if none), so last season compares with last year's den
--   events             pack events and campouts attended (by Eastern start date)
--   nights / nights_all camping nights in the range / ever
create or replace function public.attendance_summary(p_from date, p_to date, p_scout_id uuid default null)
returns table (scout_id uuid, den_meetings int, den_meetings_held int, events int, nights int, nights_all int)
language sql stable security invoker set search_path = '' as $$
    with sc as (
        select s.id, s.den_id from public.scouts s
         where p_scout_id is null or s.id = p_scout_id
    ), dm as (
        select a.scout_id, m.id, m.den_id
          from public.den_meeting_attendance a
          join public.den_meetings m on m.id = a.meeting_id
         where m.meets_on between p_from and p_to
    ), ev as (
        select a.scout_id, (e.starts_at at time zone 'America/New_York')::date as day, private.event_nights(e) as nights
          from public.event_attendance a
          join public.events e on e.id = a.event_id
         where p_scout_id is null or a.scout_id = p_scout_id
    )
    select sc.id,
           (select count(distinct dm.id) from dm where dm.scout_id = sc.id)::int,
           (select count(*) from public.den_meetings m
             where m.meets_on between p_from and p_to
               and (m.recorded_at is not null
                    or exists (select 1 from public.den_meeting_attendance x where x.meeting_id = m.id))
               and m.den_id in (select dm.den_id from dm where dm.scout_id = sc.id
                                union all
                                select sc.den_id where not exists (select 1 from dm where dm.scout_id = sc.id)))::int,
           (select count(*) from ev where ev.scout_id = sc.id and ev.day between p_from and p_to)::int,
           (select coalesce(sum(ev.nights), 0) from ev where ev.scout_id = sc.id and ev.day between p_from and p_to)::int,
           (select coalesce(sum(ev.nights), 0) from ev where ev.scout_id = sc.id)::int
      from sc
$$;
revoke execute on function public.attendance_summary(date, date, uuid) from public, anon;
grant execute on function public.attendance_summary(date, date, uuid) to authenticated;
