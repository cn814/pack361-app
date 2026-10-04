-- Carpooling on events that involve driving (campouts, outings): each family can post once per
-- event, either "we have seats" or "we need a ride", with where they're leaving from, an
-- optional contact (phone or email, typed by them, so sharing it is their choice) and a note.
-- Members who can see the event see the board; a family changes or removes only its own post;
-- leaders can remove any post. events.carpool turns the board on or off for one event
-- (null = the app decides: on for events with a place, off for regular meetings).

begin;

alter table public.events add column if not exists carpool boolean;

create table if not exists public.event_carpools (
    id            uuid primary key default gen_random_uuid(),
    event_id      uuid not null references public.events(id) on delete cascade,
    adult_id      uuid not null references public.adults(id) on delete cascade,
    family_id     uuid references public.families(id) on delete cascade,
    kind          text not null check (kind in ('offer', 'need')),
    seats         smallint not null default 1 check (seats between 1 and 8),
    leaving_from  text check (length(leaving_from) <= 80),
    contact       text check (length(contact) <= 120),
    note          text check (length(note) <= 300),
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

-- One post per family (or per adult with no family) per event.
create unique index if not exists event_carpools_one_per_family
    on public.event_carpools (event_id, coalesce(family_id, adult_id));
create index if not exists event_carpools_adult_idx on public.event_carpools (adult_id);

create or replace function private.touch_event_carpool()
returns trigger language plpgsql set search_path = '' as $$
begin
    new.updated_at := now();
    return new;
end $$;
drop trigger if exists event_carpools_touch on public.event_carpools;
create trigger event_carpools_touch before update on public.event_carpools
    for each row execute function private.touch_event_carpool();

revoke all on public.event_carpools from anon, authenticated;
grant select, insert, update, delete on public.event_carpools to authenticated;
alter table public.event_carpools enable row level security;

drop policy if exists event_carpools_read on public.event_carpools;
create policy event_carpools_read on public.event_carpools for select to authenticated
    using ((select private.is_member()) and private.can_see_event(event_id));

-- Posting as yourself, for your own family, on an event you can see.
drop policy if exists event_carpools_insert on public.event_carpools;
create policy event_carpools_insert on public.event_carpools for insert to authenticated
    with check (
        adult_id = (select private.current_adult_id())
        and family_id is not distinct from (select private.my_family_id())
        and private.can_see_event(event_id));

-- Your family's post (either parent can change it); it stays yours and on the same event.
drop policy if exists event_carpools_update on public.event_carpools;
create policy event_carpools_update on public.event_carpools for update to authenticated
    using (
        (family_id is not null and family_id = (select private.my_family_id()))
        or (family_id is null and adult_id = (select private.current_adult_id())))
    with check (
        adult_id = (select private.current_adult_id())
        and family_id is not distinct from (select private.my_family_id())
        and private.can_see_event(event_id));

drop policy if exists event_carpools_delete on public.event_carpools;
create policy event_carpools_delete on public.event_carpools for delete to authenticated
    using (
        (family_id is not null and family_id = (select private.my_family_id()))
        or (family_id is null and adult_id = (select private.current_adult_id()))
        or (select private.is_leader()));

-- The board for one event, with each poster's name (families can't read other families' roster
-- rows directly). Only for members who can see the event.
create or replace function public.event_carpool_board(p_event_id uuid)
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
     where c.event_id = p_event_id
       and private.is_member()
       and private.can_see_event(p_event_id)
     order by c.kind, c.updated_at
$$;
revoke execute on function public.event_carpool_board(uuid) from public, anon;
grant execute on function public.event_carpool_board(uuid) to authenticated;

commit;
