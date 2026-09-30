-- Taking over from TroopWebHost:
--   1. RSVPs in the app: each family answers yes / maybe / no for events a leader opens for
--      RSVP, with how many scouts and adults are coming. Families see the headcount; leaders
--      see who's coming.
--   2. Public pages: guide pages marked public (like "Joining Pack 361") can be read without
--      signing in, for the public join page.

-- -----------------------------------------------------------------------------
-- 1. RSVPs
-- -----------------------------------------------------------------------------
alter table public.events
    add column rsvp_enabled boolean not null default false,
    add column rsvp_by      date;           -- last day to answer (Eastern); null = until it starts

create table public.event_rsvps (
    id            uuid primary key default gen_random_uuid(),
    event_id      uuid not null references public.events(id) on delete cascade,
    family_id     uuid references public.families(id) on delete cascade,   -- null for adults with no family
    adult_id      uuid references public.adults(id) on delete cascade,     -- who answered
    status        text not null check (status in ('yes', 'maybe', 'no')),
    scouts        int  not null default 0 check (scouts between 0 and 20),
    adults        int  not null default 0 check (adults between 0 and 20),
    note          text check (length(note) <= 300),
    updated_at    timestamptz not null default now()
);
-- One answer per family per event (or per adult, for adults without a family).
create unique index event_rsvps_family_key on public.event_rsvps(event_id, family_id) where family_id is not null;
create unique index event_rsvps_adult_key on public.event_rsvps(event_id, adult_id) where family_id is null;
create index event_rsvps_event_idx on public.event_rsvps(event_id);

-- Can the signed-in person see this event (same rule as events_read)?
create or replace function private.can_see_event(p_event_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (
        select 1 from public.events e
         where e.id = p_event_id and private.is_member() and (not e.leaders_only or private.is_leader()))
$$;
grant execute on function private.can_see_event(uuid) to authenticated;

-- Answer (or change) your family's RSVP.
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
end;
$$;
revoke execute on function public.set_rsvp(uuid, text, int, int, text) from public, anon;
grant execute on function public.set_rsvp(uuid, text, int, int, text) to authenticated;

-- Headcount for anyone who can see the event (numbers only, never names).
create or replace function public.rsvp_counts(p_event_id uuid)
returns table (families_yes bigint, families_maybe bigint, families_no bigint, scouts bigint, adults bigint)
language sql stable security definer set search_path = '' as $$
    select count(*) filter (where status = 'yes'),
           count(*) filter (where status = 'maybe'),
           count(*) filter (where status = 'no'),
           coalesce(sum(scouts) filter (where status = 'yes'), 0),
           coalesce(sum(adults) filter (where status = 'yes'), 0)
      from public.event_rsvps
     where event_id = p_event_id and private.can_see_event(p_event_id)
$$;
revoke execute on function public.rsvp_counts(uuid) from public, anon;
grant execute on function public.rsvp_counts(uuid) to authenticated;

revoke all on public.event_rsvps from anon, authenticated;
grant select, delete on public.event_rsvps to authenticated;   -- answers go through set_rsvp()
alter table public.event_rsvps enable row level security;
create policy rsvps_read on public.event_rsvps for select to authenticated
    using (private.is_leader()
           or (family_id is not null and family_id = private.my_family_id())
           or adult_id = private.current_adult_id());
create policy rsvps_leader_delete on public.event_rsvps for delete to authenticated
    using (private.is_leader());

-- -----------------------------------------------------------------------------
-- 2. Public guide pages (the join page)
-- -----------------------------------------------------------------------------
alter table public.guide_pages add column is_public boolean not null default false;
grant select on public.guide_pages to anon;
create policy guide_public_read on public.guide_pages for select to anon, authenticated
    using (is_public and is_published);

insert into public.guide_pages (slug, section, sort_order, title, summary, is_published, is_public, body) values
('join', 'Getting started', 5, 'Joining Pack 361',
 'How to sign up, what it costs, and what to expect in your first weeks.', true, true,
$g$Any child in kindergarten through 5th grade can join, boys and girls alike, whether or not they go to Centennial Lane. Families are welcome to visit a meeting first.

## How to join
1. **Come see us.** Visit a den or pack meeting, Monday evenings at the First Presbyterian Church of Howard County in Columbia. Email info@pack361.org and we'll tell you which night is best to visit.
2. **Apply online** at [BeAScout.org](https://beascout.scouting.org/). Search for Pack 361 in Ellicott City and fill out the youth application. Parents who'd like to help can apply as adult volunteers at the same time.
3. **We'll welcome you** into the right den for your child's grade and send you a link to the pack's app, where you'll find the calendar, campout details and everything else.

## What it costs
Scouting America charges an annual national registration fee, paid when you apply. The pack also collects yearly dues that cover badges, awards and program supplies. Campouts and some events have their own small fee. If cost is ever a barrier, talk to us privately: the pack helps.

## What to expect
- **Den meetings** most Monday evenings, 6:30 to 7:30 PM, with the kids in your child's grade.
- **Pack meetings** about once a month, 6:30 to 8:00 PM, with the whole pack.
- **Family campouts**, the Pinewood Derby, the Blue & Gold banquet, service projects and outings through the year.
- Lions (kindergarten) and Tigers (1st grade) take part with a parent or other adult partner.

## Questions?
Email **info@pack361.org**. A pack leader will get back to you.$g$)
on conflict (slug) do nothing;
