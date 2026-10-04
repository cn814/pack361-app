-- Carpooling to den meetings planned in the app (off-site ones: the meeting has an address), as
-- well as calendar events. A carpool post now belongs to either an event or a den meeting. Den
-- meeting posts are seen by the people who can see the meeting: that den's families and leaders,
-- and key leaders.

begin;

alter table public.event_carpools alter column event_id drop not null;
alter table public.event_carpools add column if not exists meeting_id uuid references public.den_meetings(id) on delete cascade;
alter table public.event_carpools drop constraint if exists event_carpools_one_target;
alter table public.event_carpools add constraint event_carpools_one_target
    check ((event_id is null) <> (meeting_id is null));

-- One post per family (or adult with no family) per event or meeting.
drop index if exists public.event_carpools_one_per_family;
create unique index if not exists event_carpools_one_per_family_event
    on public.event_carpools (event_id, coalesce(family_id, adult_id)) where event_id is not null;
create unique index if not exists event_carpools_one_per_family_meeting
    on public.event_carpools (meeting_id, coalesce(family_id, adult_id)) where meeting_id is not null;

-- Can the signed-in person see this den meeting? (The same rule as the den_meetings read policy.)
create or replace function private.can_see_meeting(p_meeting_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (
        select 1 from public.den_meetings m
         where m.id = p_meeting_id
           and (private.is_committee()
                or m.den_id in (select private.my_led_den_ids())
                or m.den_id in (select private.my_den_ids())))
$$;
revoke execute on function private.can_see_meeting(uuid) from public, anon;
grant execute on function private.can_see_meeting(uuid) to authenticated;

-- The event or den meeting a carpool post is on: can the signed-in person see it?
create or replace function private.can_see_carpool_target(p_event_id uuid, p_meeting_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
    select case when p_event_id is not null then private.can_see_event(p_event_id)
                else private.can_see_meeting(p_meeting_id) end
$$;
revoke execute on function private.can_see_carpool_target(uuid, uuid) from public, anon;
grant execute on function private.can_see_carpool_target(uuid, uuid) to authenticated;

drop policy if exists event_carpools_read on public.event_carpools;
create policy event_carpools_read on public.event_carpools for select to authenticated
    using ((select private.is_member()) and private.can_see_carpool_target(event_id, meeting_id));

drop policy if exists event_carpools_insert on public.event_carpools;
create policy event_carpools_insert on public.event_carpools for insert to authenticated
    with check (
        adult_id = (select private.current_adult_id())
        and family_id is not distinct from (select private.my_family_id())
        and private.can_see_carpool_target(event_id, meeting_id));

drop policy if exists event_carpools_update on public.event_carpools;
create policy event_carpools_update on public.event_carpools for update to authenticated
    using (
        (family_id is not null and family_id = (select private.my_family_id()))
        or (family_id is null and adult_id = (select private.current_adult_id())))
    with check (
        adult_id = (select private.current_adult_id())
        and family_id is not distinct from (select private.my_family_id())
        and private.can_see_carpool_target(event_id, meeting_id));

-- The board for one den meeting, with each poster's name.
create or replace function public.meeting_carpool_board(p_meeting_id uuid)
returns table (id uuid, kind text, seats smallint, leaving_from text, contact text, note text,
               updated_at timestamptz, name text, family_name text, mine boolean)
language sql stable security definer set search_path = '' as $$
    select c.id, c.kind, c.seats, c.leaving_from, c.contact, c.note, c.updated_at,
           coalesce(a.preferred_name, a.first_name) || ' ' || a.last_name,
           f.family_name,
           (c.family_id is not null and c.family_id = private.my_family_id())
             or (c.family_id is null and c.adult_id = private.current_adult_id())
      from public.event_carpools c
      join public.adults a on a.id = c.adult_id
      left join public.families f on f.id = c.family_id
     where c.meeting_id = p_meeting_id
       and private.is_member()
       and private.can_see_meeting(p_meeting_id)
     order by c.kind, c.updated_at
$$;
revoke execute on function public.meeting_carpool_board(uuid) from public, anon;
grant execute on function public.meeting_carpool_board(uuid) to authenticated;

commit;
