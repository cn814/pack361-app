-- Pack gear closet and the Help wanted board.
--   1. public.gear_items: what the pack owns and lends (tents, cooking kits, uniforms...).
--      Members see what's in the closet; leaders add and edit items.
--   2. public.gear_loans: a family asks to borrow an item; leaders approve or decline it, mark
--      it picked up and returned. A family sees only its own loans; leaders see them all.
--      public.gear_in_use() tells everyone how many of each item are spoken for, without
--      showing whose loans they are.
--   3. public.pack_roles: season jobs the pack needs filled (den leader, popcorn kernel...).
--      Everyone sees the open ones; committee adds, edits and closes them.
--      public.help_wanted_roles() lists open roles with the contact's name only.
--   4. public.role_interest: "I can help" offers. You see your own; committee sees them all.
--   5. public.volunteer_load(): per family, how many volunteer jobs they signed up for in a
--      date range (the season), for committee to spread the load.
-- Safe to run once on the live database; nothing here changes existing tables.
-- All or nothing: if any statement fails, nothing changes.
begin;

-- -----------------------------------------------------------------------------
-- 1. Gear items
-- -----------------------------------------------------------------------------
create table public.gear_items (
    id              uuid primary key default gen_random_uuid(),
    name            text not null check (length(trim(name)) between 1 and 80),
    category        text not null default 'Other'
                    check (category in ('Tents', 'Sleeping', 'Cooking', 'Uniforms', 'Other')),
    description     text check (length(description) <= 500),
    quantity        int not null default 1 check (quantity between 0 and 999),
    condition_note  text check (length(condition_note) <= 200),
    active          boolean not null default true,
    created_by      uuid references public.adults(id) on delete set null,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);
create index gear_items_category_idx on public.gear_items(category, name);
create index gear_items_created_by_idx on public.gear_items(created_by);

create or replace function private.gear_items_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    if tg_op = 'INSERT' then
        new.created_by := coalesce(new.created_by, private.current_adult_id());
        new.created_at := now();
    else
        new.created_by := old.created_by;
        new.created_at := old.created_at;
    end if;
    new.updated_at := now();
    new.name := trim(new.name);
    return new;
end;
$$;
revoke execute on function private.gear_items_guard() from public, anon, authenticated;
create trigger gear_items_guard before insert or update on public.gear_items
    for each row execute function private.gear_items_guard();

revoke all on public.gear_items from anon, authenticated;
grant select, insert, update on public.gear_items to authenticated;
alter table public.gear_items enable row level security;

-- Members see the closet; items put away (inactive) are for leaders only.
create policy gear_items_read on public.gear_items for select to authenticated
    using ((select private.is_member()) and (active or (select private.is_leader())));
create policy gear_items_insert on public.gear_items for insert to authenticated
    with check ((select private.is_leader()));
create policy gear_items_update on public.gear_items for update to authenticated
    using ((select private.is_leader()))
    with check ((select private.is_leader()));

-- -----------------------------------------------------------------------------
-- 2. Gear loans
-- -----------------------------------------------------------------------------
create table public.gear_loans (
    id            uuid primary key default gen_random_uuid(),
    item_id       uuid not null references public.gear_items(id) on delete restrict,
    family_id     uuid not null references public.families(id) on delete cascade,
    adult_id      uuid references public.adults(id) on delete set null,   -- who asked
    quantity      int not null default 1 check (quantity between 1 and 999),
    event_id      uuid references public.events(id) on delete set null,
    status        text not null default 'requested'
                  check (status in ('requested', 'approved', 'declined', 'out', 'returned')),
    requested_at  timestamptz not null default now(),
    needed_on     date,                       -- pick-up day (optional)
    due_on        date not null,              -- bring back by
    out_at        timestamptz,
    returned_at   timestamptz,
    note          text check (length(note) <= 500),           -- from the family
    leader_note   text check (length(leader_note) <= 300),    -- from leadership (e.g. why declined)
    decided_by    uuid references public.adults(id) on delete set null,
    decided_at    timestamptz,
    reminded_at   timestamptz,                -- last overdue reminder
    check (needed_on is null or due_on >= needed_on)
);
create index gear_loans_item_idx    on public.gear_loans(item_id);
create index gear_loans_family_idx  on public.gear_loans(family_id);
create index gear_loans_adult_idx   on public.gear_loans(adult_id);
create index gear_loans_event_idx   on public.gear_loans(event_id);
create index gear_loans_decided_idx on public.gear_loans(decided_by);
create index gear_loans_open_idx    on public.gear_loans(status, due_on)
    where status in ('requested', 'approved', 'out');

-- Requests always start as "requested". Who asked, for which family and item never change.
-- Approving or handing out more than the closet has left is refused. Timestamps follow the
-- status. Runs as the table owner so it can count every family's loans.
create or replace function private.gear_loans_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
    v_item public.gear_items;
    v_used int;
    v_holds_old boolean;
begin
    -- Lock the item so two approvals at once can't both take the last one.
    select * into v_item from public.gear_items where id = new.item_id for update;
    if not found then
        raise exception 'That item was not found' using errcode = '22023';
    end if;

    if tg_op = 'INSERT' then
        if not v_item.active then
            raise exception 'That item is not available to borrow' using errcode = '22023';
        end if;
        new.status       := 'requested';
        new.requested_at := now();
        new.out_at       := null;
        new.returned_at  := null;
        new.decided_by   := null;
        new.decided_at   := null;
        new.reminded_at  := null;
        new.leader_note  := null;
        v_holds_old      := false;
    else
        new.item_id      := old.item_id;
        new.family_id    := old.family_id;
        new.adult_id     := old.adult_id;
        new.requested_at := old.requested_at;
        v_holds_old      := old.status in ('approved', 'out');
        if new.status is distinct from old.status then
            if new.status in ('approved', 'declined') then
                new.decided_by := private.current_adult_id();
                new.decided_at := now();
            elsif new.status = 'out' then
                new.out_at := now();
                if new.decided_at is null then
                    new.decided_by := private.current_adult_id();
                    new.decided_at := now();
                end if;
            elsif new.status = 'returned' then
                new.returned_at := now();
            elsif new.status = 'requested' then
                new.decided_by  := null;
                new.decided_at  := null;
                new.out_at      := null;
                new.returned_at := null;
            end if;
        end if;
        -- A new return date starts the reminders over.
        if new.due_on is distinct from old.due_on then
            new.reminded_at := null;
        end if;
    end if;

    -- (Only when the number asked for changes: the closet may have shrunk since.)
    if (tg_op = 'INSERT' or new.quantity is distinct from old.quantity) and new.quantity > v_item.quantity then
        raise exception 'The pack has only % of these', v_item.quantity using errcode = '22023';
    end if;

    if new.status in ('approved', 'out') and (not v_holds_old or new.quantity > old.quantity) then
        select coalesce(sum(l.quantity), 0)::int into v_used
          from public.gear_loans l
         where l.item_id = new.item_id
           and l.status in ('approved', 'out')
           and l.id <> new.id;
        if v_used + new.quantity > v_item.quantity then
            raise exception 'Not enough left: % of % available right now',
                greatest(v_item.quantity - v_used, 0), v_item.quantity using errcode = '22023';
        end if;
    end if;
    new.note := nullif(trim(new.note), '');
    return new;
end;
$$;
revoke execute on function private.gear_loans_guard() from public, anon, authenticated;
create trigger gear_loans_guard before insert or update on public.gear_loans
    for each row execute function private.gear_loans_guard();

revoke all on public.gear_loans from anon, authenticated;
grant select, insert, update, delete on public.gear_loans to authenticated;
alter table public.gear_loans enable row level security;

-- A family sees its own loans; leaders see everyone's (to hand gear out).
create policy gear_loans_read on public.gear_loans for select to authenticated
    using (family_id = (select private.my_family_id()) or (select private.is_leader()));

-- Ask as yourself, for your own family.
create policy gear_loans_insert on public.gear_loans for insert to authenticated
    with check ((select private.is_member())
                and adult_id = (select private.current_adult_id())
                and family_id = (select private.my_family_id()));

-- Leaders approve, decline, hand out and check back in.
create policy gear_loans_update on public.gear_loans for update to authenticated
    using ((select private.is_leader()))
    with check ((select private.is_leader()));

-- A family can cancel a request until the gear is picked up; committee can remove any.
create policy gear_loans_delete on public.gear_loans for delete to authenticated
    using ((family_id = (select private.my_family_id()) and status in ('requested', 'approved'))
           or (select private.is_committee()));

-- How many of each item are spoken for (approved or out), for every member to see what's
-- left, without showing whose loans they are.
create or replace function public.gear_in_use()
returns table (item_id uuid, in_use int)
language sql stable security definer set search_path = '' as $$
    select l.item_id, sum(l.quantity)::int
      from public.gear_loans l
     where private.is_member() and l.status in ('approved', 'out')
     group by l.item_id
$$;
revoke execute on function public.gear_in_use() from public, anon;
grant execute on function public.gear_in_use() to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Season roles (Help wanted)
-- -----------------------------------------------------------------------------
create table public.pack_roles (
    id                uuid primary key default gen_random_uuid(),
    title             text not null check (length(trim(title)) between 1 and 100),
    description       text check (length(description) <= 1000),
    contact_adult_id  uuid references public.adults(id) on delete set null,
    open              boolean not null default true,
    created_by        uuid references public.adults(id) on delete set null,
    filled_by         uuid references public.adults(id) on delete set null,
    sort_order        int not null default 0,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now(),
    closed_at         timestamptz
);
create index pack_roles_open_idx     on public.pack_roles(open, sort_order);
create index pack_roles_contact_idx  on public.pack_roles(contact_adult_id);
create index pack_roles_created_idx  on public.pack_roles(created_by);
create index pack_roles_filled_idx   on public.pack_roles(filled_by);

create or replace function private.pack_roles_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    if tg_op = 'INSERT' then
        new.created_by := coalesce(new.created_by, private.current_adult_id());
        new.created_at := now();
        new.closed_at  := case when new.open then null else now() end;
    else
        new.created_by := old.created_by;
        new.created_at := old.created_at;
        if new.open and not old.open then
            new.closed_at := null;
        elsif not new.open and old.open then
            new.closed_at := now();
        end if;
    end if;
    new.updated_at  := now();
    new.title       := trim(new.title);
    new.description := nullif(trim(new.description), '');
    return new;
end;
$$;
revoke execute on function private.pack_roles_guard() from public, anon, authenticated;
create trigger pack_roles_guard before insert or update on public.pack_roles
    for each row execute function private.pack_roles_guard();

revoke all on public.pack_roles from anon, authenticated;
grant select, insert, update, delete on public.pack_roles to authenticated;
alter table public.pack_roles enable row level security;

create policy pack_roles_read on public.pack_roles for select to authenticated
    using ((select private.is_member()) and (open or (select private.is_committee())));
create policy pack_roles_insert on public.pack_roles for insert to authenticated
    with check ((select private.is_committee()));
create policy pack_roles_update on public.pack_roles for update to authenticated
    using ((select private.is_committee()))
    with check ((select private.is_committee()));
create policy pack_roles_delete on public.pack_roles for delete to authenticated
    using ((select private.is_committee()));

-- -----------------------------------------------------------------------------
-- 4. "I can help" offers
-- -----------------------------------------------------------------------------
create table public.role_interest (
    role_id     uuid not null references public.pack_roles(id) on delete cascade,
    adult_id    uuid not null references public.adults(id) on delete cascade,
    note        text check (length(note) <= 500),
    created_at  timestamptz not null default now(),
    primary key (role_id, adult_id)
);
create index role_interest_adult_idx on public.role_interest(adult_id);

revoke all on public.role_interest from anon, authenticated;
grant select, insert, update, delete on public.role_interest to authenticated;
alter table public.role_interest enable row level security;

create policy role_interest_read on public.role_interest for select to authenticated
    using (adult_id = (select private.current_adult_id()) or (select private.is_committee()));
-- Offer as yourself, for a role that's open.
create policy role_interest_insert on public.role_interest for insert to authenticated
    with check ((select private.is_member())
                and adult_id = (select private.current_adult_id())
                and exists (select 1 from public.pack_roles r where r.id = role_id and r.open));
create policy role_interest_update on public.role_interest for update to authenticated
    using (adult_id = (select private.current_adult_id()))
    with check (adult_id = (select private.current_adult_id()));
create policy role_interest_delete on public.role_interest for delete to authenticated
    using (adult_id = (select private.current_adult_id()) or (select private.is_committee()));

-- (Created after role_interest, which it reads.)
-- Open roles for everyone, with the contact's name and pack position only (no email or
-- phone), and whether I already offered.
create or replace function public.help_wanted_roles()
returns table (id uuid, title text, description text, contact_name text, contact_title text,
               sort_order int, offered boolean)
language sql stable security definer set search_path = '' as $$
    select r.id, r.title, r.description,
           case when a.id is not null and a.is_active
                then coalesce(a.preferred_name, a.first_name) || ' ' || a.last_name end,
           case when a.id is not null and a.is_active then a.position_title end,
           r.sort_order,
           exists (select 1 from public.role_interest i
                    where i.role_id = r.id and i.adult_id = private.current_adult_id())
      from public.pack_roles r
      left join public.adults a on a.id = r.contact_adult_id
     where private.is_member() and r.open
     order by r.sort_order, r.created_at
$$;
revoke execute on function public.help_wanted_roles() from public, anon;
grant execute on function public.help_wanted_roles() to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Volunteer load per family (committee only)
-- -----------------------------------------------------------------------------
-- Volunteer job sign-ups for events in [p_from, p_to] (Eastern dates; a job with no event
-- counts by when it was signed up for). Cancelled (archived) events don't count. One row per
-- active family, including families with none, plus adults with no family who signed up.
create or replace function public.volunteer_load(p_from date, p_to date)
returns table (family_id uuid, family_name text, signups int, people text)
language sql stable security definer set search_path = '' as $$
    with s as (
        select a.family_id, a.id as adult_id,
               coalesce(a.preferred_name, a.first_name) as first_name,
               a.last_name
          from public.volunteer_signups vs
          join public.volunteer_slots sl on sl.id = vs.slot_id
          left join public.events e on e.id = sl.event_id
          join public.adults a on a.id = vs.adult_id
         where (e.id is null or e.archived_at is null)
           and (coalesce(e.starts_at, vs.created_at) at time zone 'America/New_York')::date
               between p_from and p_to
    ), rows as (
        select f.id as family_id, f.family_name,
               count(s.adult_id)::int as signups,
               string_agg(distinct s.first_name, ', ') as people
          from public.families f
          left join s on s.family_id = f.id
         where f.is_active
         group by f.id, f.family_name
        union all
        select null, min(s.first_name || ' ' || s.last_name), count(*)::int, min(s.first_name)
          from s
         where s.family_id is null
         group by s.adult_id
    )
    select r.family_id, r.family_name, r.signups, r.people
      from rows r
     where private.is_committee()
     order by r.signups desc, r.family_name
$$;
revoke execute on function public.volunteer_load(date, date) from public, anon;
grant execute on function public.volunteer_load(date, date) to authenticated;

commit;
