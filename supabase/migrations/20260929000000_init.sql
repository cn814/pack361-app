-- =============================================================================
-- Pack 361 (Ellicott City, MD) private member app: initial schema
-- Replaces the schema from the original mockup bundle and the Supabase setup guide.
--
-- What changed vs. the mockup version, and why:
--   * Access checks live in SECURITY DEFINER helper functions, so policies never
--     query the table they protect (the old profiles policy recursed forever).
--   * Roster = families + adults + scouts (two-parent families and siblings in
--     different dens work). An adult's email is the login whitelist.
--   * Parents can only edit their own phone / preferred name. Role, verified
--     status and YPT dates are leader/admin-only (column privileges).
--   * Volunteer signups are their own rows (claim / un-claim yourself only,
--     capacity enforced).
--   * Photos start as pending_review; members only see approved photos plus
--     their own uploads. Leaders approve.
--   * Advancement submissions have real policies (the old table was locked).
--   * Nothing is readable by anonymous visitors.
--
-- Run in Supabase: Dashboard -> SQL Editor (or `supabase db push`).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Enums
-- -----------------------------------------------------------------------------
create type public.app_role as enum ('parent', 'den_leader', 'committee', 'cubmaster', 'admin');
create type public.den_rank as enum ('lion', 'tiger', 'wolf', 'bear', 'webelos', 'aol');
create type public.photo_status as enum ('pending_review', 'approved', 'rejected');
create type public.submission_status as enum ('submitted', 'approved', 'returned', 'recorded');

-- -----------------------------------------------------------------------------
-- 2. Roster tables (loaded from Scoutbook Plus / TroopWebHost exports)
-- -----------------------------------------------------------------------------
create table public.dens (
    id          uuid primary key default gen_random_uuid(),
    rank        public.den_rank not null,
    number      int  not null default 1,
    name        text generated always as (
                  case rank
                    when 'lion' then 'Lion' when 'tiger' then 'Tiger'
                    when 'wolf' then 'Wolf' when 'bear' then 'Bear'
                    when 'webelos' then 'Webelos' when 'aol' then 'Arrow of Light'
                  end || ' Den ' || number) stored,
    meeting_info text,                                -- e.g. "Thursdays 6:30 PM"
    is_active   boolean not null default true,
    unique (rank, number)
);

create table public.families (
    id          uuid primary key default gen_random_uuid(),
    family_name text not null,
    is_active   boolean not null default true,
    created_at  timestamptz not null default now()
);

-- Every adult who may log in: parents/guardians and leaders.
-- The email here IS the login whitelist.
create table public.adults (
    id              uuid primary key default gen_random_uuid(),
    family_id       uuid references public.families(id) on delete set null, -- null for leaders w/o a scout
    user_id         uuid unique references auth.users(id) on delete set null, -- set automatically on first login
    first_name      text not null,
    last_name       text not null,
    preferred_name  text,
    email           text not null check (email = lower(trim(email))),  -- stored lowercase
    phone           text,
    relationship    text,                       -- Mother, Father, Guardian, ...
    role            public.app_role not null default 'parent',   -- app permissions
    position_title  text,                       -- display only: "Cubmaster", "Advancement Chair"
    bsa_member_id   text,
    ypt_expires_on  date,                       -- from my.scouting YPT Aging report
    is_active       boolean not null default true,
    created_at      timestamptz not null default now()
);
create unique index adults_email_key on public.adults(email);
create index adults_family_idx on public.adults(family_id);

create table public.scouts (
    id              uuid primary key default gen_random_uuid(),
    family_id       uuid not null references public.families(id) on delete cascade,
    den_id          uuid references public.dens(id) on delete set null,
    first_name      text not null,
    last_name       text not null,
    bsa_member_id   text unique,
    media_opt_out   boolean not null default false,   -- no photos of this scout in the vault
    is_active       boolean not null default true,
    created_at      timestamptz not null default now()
);
create index scouts_family_idx on public.scouts(family_id);
create index scouts_den_idx on public.scouts(den_id);

create table public.den_leaders (
    den_id   uuid not null references public.dens(id) on delete cascade,
    adult_id uuid not null references public.adults(id) on delete cascade,
    title    text not null default 'Den Leader',       -- or 'Assistant Den Leader'
    primary key (den_id, adult_id)
);

-- -----------------------------------------------------------------------------
-- 3. Access helper functions
--    SECURITY DEFINER so they can read the roster without triggering RLS
--    (this is what prevents the infinite-recursion error).
-- -----------------------------------------------------------------------------
create or replace function public.current_adult_id()
returns uuid language sql stable security definer set search_path = '' as $$
    select a.id from public.adults a
    where a.user_id = auth.uid() and a.is_active
    limit 1
$$;

create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (select 1 from public.adults a where a.user_id = auth.uid() and a.is_active)
$$;

create or replace function public.is_leader()
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (
        select 1 from public.adults a
        where a.user_id = auth.uid() and a.is_active
          and a.role in ('den_leader', 'committee', 'cubmaster', 'admin'))
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (
        select 1 from public.adults a
        where a.user_id = auth.uid() and a.is_active
          and a.role in ('cubmaster', 'admin'))
$$;

create or replace function public.my_family_id()
returns uuid language sql stable security definer set search_path = '' as $$
    select a.family_id from public.adults a
    where a.user_id = auth.uid() and a.is_active
    limit 1
$$;

create or replace function public.is_my_scout(p_scout_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (
        select 1 from public.scouts s
        join public.adults a on a.family_id = s.family_id
        where s.id = p_scout_id and a.user_id = auth.uid() and a.is_active)
$$;

-- Can the current user review this scout's advancement?
-- Den leaders for the scout's den, plus committee / cubmaster / admin.
create or replace function public.can_review_scout(p_scout_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (
        select 1 from public.adults a
        where a.user_id = auth.uid() and a.is_active
          and a.role in ('committee', 'cubmaster', 'admin'))
    or exists (
        select 1 from public.scouts s
        join public.den_leaders dl on dl.den_id = s.den_id
        join public.adults a on a.id = dl.adult_id
        where s.id = p_scout_id and a.user_id = auth.uid() and a.is_active)
$$;

-- -----------------------------------------------------------------------------
-- 4. Link logins to the roster
--    On sign-up: attach the auth user to the roster row with the same email.
--    If someone signs in before they're on the roster, they get no access;
--    adding them to the roster later links them automatically.
-- -----------------------------------------------------------------------------
create or replace function public.link_auth_user_to_roster()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    update public.adults
       set user_id = new.id
     where email = lower(new.email)
       and user_id is null;
    return new;
end;
$$;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.link_auth_user_to_roster();

create or replace function public.link_roster_to_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    new.email := lower(trim(new.email));   -- imports can have mixed case
    if new.user_id is null or (tg_op = 'UPDATE' and new.email is distinct from old.email) then
        select u.id into new.user_id
          from auth.users u
         where lower(u.email) = new.email
         limit 1;
    end if;
    return new;
end;
$$;

create trigger adults_link_user
    before insert or update of email on public.adults
    for each row execute function public.link_roster_to_auth_user();

-- -----------------------------------------------------------------------------
-- 5. Content tables
-- -----------------------------------------------------------------------------
create table public.events (
    id              uuid primary key default gen_random_uuid(),
    title           text not null,
    category        text not null default 'Pack',  -- Campout, Pack Meeting, Den, Derby, Service, Fundraiser
    starts_at       timestamptz not null,
    ends_at         timestamptz,
    location_name   text,
    address         text,
    den_id          uuid references public.dens(id) on delete set null,  -- null = whole pack
    details         text,
    signup_url      text,        -- e.g. Givebutter campaign link
    source          text,        -- 'givebutter', 'scoutbook_ics', 'troopwebhost', 'manual'
    external_id     text,
    created_by      uuid references public.adults(id),
    created_at      timestamptz not null default now(),
    unique (source, external_id)
);

create table public.itinerary_items (
    id          uuid primary key default gen_random_uuid(),
    event_id    uuid not null references public.events(id) on delete cascade,
    starts_at   timestamptz not null,
    title       text not null,
    location    text,
    notes       text
);

create table public.packing_items (
    id          uuid primary key default gen_random_uuid(),
    event_id    uuid references public.events(id) on delete cascade, -- null = default campout list
    category    text not null,     -- 'Cub Scout Six Essentials', 'Sleeping', 'Clothing', ...
    label       text not null,
    detail      text,
    required    boolean not null default true,
    sort_order  int not null default 0
);

create table public.announcements (
    id          uuid primary key default gen_random_uuid(),
    author_id   uuid not null references public.adults(id),
    title       text not null,
    body        text not null,
    category    text not null default 'General',
    den_id      uuid references public.dens(id) on delete set null,
    event_id    uuid references public.events(id) on delete set null,
    is_pinned   boolean not null default false,
    created_at  timestamptz not null default now()
);

create table public.volunteer_slots (
    id          uuid primary key default gen_random_uuid(),
    event_id    uuid references public.events(id) on delete cascade,
    role_title  text not null,
    shift_label text,
    starts_at   timestamptz,
    capacity    int not null default 1 check (capacity > 0),
    is_urgent   boolean not null default false,
    notes       text,
    created_at  timestamptz not null default now()
);

create table public.volunteer_signups (
    slot_id     uuid not null references public.volunteer_slots(id) on delete cascade,
    adult_id    uuid not null references public.adults(id) on delete cascade,
    created_at  timestamptz not null default now(),
    primary key (slot_id, adult_id)
);

create table public.photos (
    id              uuid primary key default gen_random_uuid(),
    uploader_id     uuid not null references public.adults(id),
    storage_path    text not null unique,     -- '<uploader adult id>/<file>' in bucket pack-photos
    caption         text,
    event_id        uuid references public.events(id) on delete set null,
    den_id          uuid references public.dens(id) on delete set null,
    status          public.photo_status not null default 'pending_review',
    reviewed_by     uuid references public.adults(id),
    reviewed_at     timestamptz,
    created_at      timestamptz not null default now()
);

-- Home requirements a parent reports for their scout; den leader approves;
-- advancement chair records it in Scoutbook Plus and marks it 'recorded'.
create table public.advancement_submissions (
    id              uuid primary key default gen_random_uuid(),
    scout_id        uuid not null references public.scouts(id) on delete cascade,
    submitted_by    uuid not null references public.adults(id),
    adventure       text not null,
    requirement     text not null,
    completed_on    date not null,
    notes           text,
    evidence_path   text,       -- optional photo in bucket advancement-evidence
    status          public.submission_status not null default 'submitted',
    reviewed_by     uuid references public.adults(id),
    reviewed_at     timestamptz,
    review_note     text,
    created_at      timestamptz not null default now()
);
create index advancement_submissions_scout_idx on public.advancement_submissions(scout_id);

-- Snapshot of Scoutbook Plus "Quick Export -> Advancement" (read-only in the app)
create table public.scout_advancement (
    id              uuid primary key default gen_random_uuid(),
    scout_id        uuid not null references public.scouts(id) on delete cascade,
    item_type       text not null,       -- 'rank', 'adventure', 'requirement', 'award'
    item_name       text not null,
    item_version    text,
    completed_on    date,
    imported_at     timestamptz not null default now(),
    unique (scout_id, item_type, item_name, item_version)
);

-- -----------------------------------------------------------------------------
-- 6. Triggers that enforce business rules RLS can't express
-- -----------------------------------------------------------------------------
-- Volunteer slot capacity (row lock prevents two parents grabbing the last spot)
create or replace function public.enforce_slot_capacity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
    v_capacity int;
    v_taken    int;
begin
    select capacity into v_capacity from public.volunteer_slots where id = new.slot_id for update;
    select count(*) into v_taken from public.volunteer_signups where slot_id = new.slot_id;
    if v_taken >= v_capacity then
        raise exception 'This volunteer slot is already full' using errcode = 'P0001';
    end if;
    return new;
end;
$$;

create trigger volunteer_signups_capacity
    before insert on public.volunteer_signups
    for each row execute function public.enforce_slot_capacity();

-- Stamp reviewer info server-side so it can't be forged
create or replace function public.stamp_review()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    if new.status is distinct from old.status then
        if new.status::text in ('submitted', 'pending_review') then
            new.reviewed_by := null;          -- resubmitted: clear the old review
            new.reviewed_at := null;
        else
            new.reviewed_by := public.current_adult_id();
            new.reviewed_at := now();
        end if;
    end if;
    return new;
end;
$$;

create trigger photos_stamp_review
    before update on public.photos
    for each row execute function public.stamp_review();

create trigger advancement_stamp_review
    before update on public.advancement_submissions
    for each row execute function public.stamp_review();

-- -----------------------------------------------------------------------------
-- 7. Privileges
--    Supabase grants ALL on new tables to anon/authenticated by default;
--    tighten that so RLS is not the only line of defense.
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;
revoke all on all tables in schema public from authenticated;

grant select on all tables in schema public to authenticated;

-- adults: parents may only change their own phone / preferred name
grant update (phone, preferred_name) on public.adults to authenticated;
grant insert, update, delete on public.adults to service_role;

-- leader-managed tables (RLS narrows these to leaders)
grant insert, update, delete on
    public.dens, public.families, public.scouts, public.den_leaders,
    public.events, public.itinerary_items, public.packing_items,
    public.announcements, public.volunteer_slots
to authenticated;

grant insert, delete on public.volunteer_signups to authenticated;
grant insert, update, delete on public.photos to authenticated;
grant insert, update, delete on public.advancement_submissions to authenticated;
-- scout_advancement is written only by the import (service role)

-- -----------------------------------------------------------------------------
-- 8. Row Level Security
-- -----------------------------------------------------------------------------
alter table public.dens                    enable row level security;
alter table public.families                enable row level security;
alter table public.adults                  enable row level security;
alter table public.scouts                  enable row level security;
alter table public.den_leaders             enable row level security;
alter table public.events                  enable row level security;
alter table public.itinerary_items         enable row level security;
alter table public.packing_items           enable row level security;
alter table public.announcements           enable row level security;
alter table public.volunteer_slots         enable row level security;
alter table public.volunteer_signups       enable row level security;
alter table public.photos                  enable row level security;
alter table public.advancement_submissions enable row level security;
alter table public.scout_advancement       enable row level security;

-- Pack-wide reference data: any roster member reads, admins write
create policy dens_read on public.dens for select to authenticated using (public.is_member());
create policy dens_write on public.dens for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy den_leaders_read on public.den_leaders for select to authenticated using (public.is_member());
create policy den_leaders_write on public.den_leaders for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Families / adults / scouts: you see your own family; leaders see everyone
create policy families_read on public.families for select to authenticated
    using (id = public.my_family_id() or public.is_leader());
create policy families_write on public.families for all to authenticated
    using (public.is_admin()) with check (public.is_admin());

create policy adults_read on public.adults for select to authenticated
    using (user_id = auth.uid()
           or (family_id is not null and family_id = public.my_family_id())
           or public.is_leader());
create policy adults_update_self on public.adults for update to authenticated
    using (user_id = auth.uid()) with check (user_id = auth.uid());
-- (column grants above limit what "self" can change to phone / preferred_name;
--  roster changes go through the import or the Supabase dashboard)

create policy scouts_read on public.scouts for select to authenticated
    using (family_id = public.my_family_id() or public.is_leader());
create policy scouts_write on public.scouts for all to authenticated
    using (public.is_admin()) with check (public.is_admin());

-- Events, itineraries, packing lists, announcements: members read, leaders write
create policy events_read on public.events for select to authenticated using (public.is_member());
create policy events_write on public.events for all to authenticated using (public.is_leader()) with check (public.is_leader());

create policy itinerary_read on public.itinerary_items for select to authenticated using (public.is_member());
create policy itinerary_write on public.itinerary_items for all to authenticated using (public.is_leader()) with check (public.is_leader());

create policy packing_read on public.packing_items for select to authenticated using (public.is_member());
create policy packing_write on public.packing_items for all to authenticated using (public.is_leader()) with check (public.is_leader());

create policy announcements_read on public.announcements for select to authenticated using (public.is_member());
create policy announcements_insert on public.announcements for insert to authenticated
    with check (public.is_leader() and author_id = public.current_adult_id());
create policy announcements_edit on public.announcements for update to authenticated
    using (author_id = public.current_adult_id() or public.is_admin())
    with check (author_id = public.current_adult_id() or public.is_admin());
create policy announcements_delete on public.announcements for delete to authenticated
    using (author_id = public.current_adult_id() or public.is_admin());

-- Volunteering: members see slots and who signed up; sign up / drop only yourself
create policy slots_read on public.volunteer_slots for select to authenticated using (public.is_member());
create policy slots_write on public.volunteer_slots for all to authenticated using (public.is_leader()) with check (public.is_leader());

create policy signups_read on public.volunteer_signups for select to authenticated using (public.is_member());
create policy signups_add_self on public.volunteer_signups for insert to authenticated
    with check (adult_id = public.current_adult_id());
create policy signups_remove on public.volunteer_signups for delete to authenticated
    using (adult_id = public.current_adult_id() or public.is_leader());

-- Photo vault: approved photos + your own uploads; leaders review everything
create policy photos_read on public.photos for select to authenticated
    using ((public.is_member() and status = 'approved')
           or uploader_id = public.current_adult_id()
           or public.is_leader());
create policy photos_upload on public.photos for insert to authenticated
    with check (uploader_id = public.current_adult_id()
                and status = 'pending_review'
                and reviewed_by is null
                and storage_path like public.current_adult_id()::text || '/%');
create policy photos_review on public.photos for update to authenticated
    using (public.is_leader()) with check (public.is_leader());
create policy photos_delete on public.photos for delete to authenticated
    using ((uploader_id = public.current_adult_id() and status = 'pending_review')
           or public.is_leader());

-- Advancement: families submit for their own scouts; den leaders review
create policy adv_sub_read on public.advancement_submissions for select to authenticated
    using (public.is_my_scout(scout_id) or public.can_review_scout(scout_id));
create policy adv_sub_insert on public.advancement_submissions for insert to authenticated
    with check (public.is_my_scout(scout_id)
                and submitted_by = public.current_adult_id()
                and status = 'submitted'
                and reviewed_by is null);
create policy adv_sub_family_edit on public.advancement_submissions for update to authenticated
    using (public.is_my_scout(scout_id) and status in ('submitted', 'returned'))
    with check (public.is_my_scout(scout_id) and status = 'submitted');
create policy adv_sub_review on public.advancement_submissions for update to authenticated
    using (public.can_review_scout(scout_id))
    with check (public.can_review_scout(scout_id));
create policy adv_sub_delete on public.advancement_submissions for delete to authenticated
    using ((public.is_my_scout(scout_id) and status = 'submitted') or public.is_admin());

create policy scout_adv_read on public.scout_advancement for select to authenticated
    using (public.is_my_scout(scout_id) or public.can_review_scout(scout_id));

-- -----------------------------------------------------------------------------
-- 9. Leader directory (safe for every member to call)
--    Returns only adults with a leadership role/position. Parents' contact
--    info is NOT exposed to other parents.
-- -----------------------------------------------------------------------------
create or replace function public.leader_directory()
returns table (adult_id uuid, name text, position_title text, role public.app_role,
               email text, phone text, dens text)
language sql stable security definer set search_path = '' as $$
    select a.id,
           coalesce(a.preferred_name, a.first_name) || ' ' || a.last_name,
           a.position_title,
           a.role,
           a.email,
           a.phone,
           (select string_agg(d.name || ' ' || dl.title, ', ' order by d.rank, d.number)
              from public.den_leaders dl join public.dens d on d.id = dl.den_id
             where dl.adult_id = a.id)
      from public.adults a
     where public.is_member()
       and a.is_active
       and (a.role <> 'parent' or a.position_title is not null
            or exists (select 1 from public.den_leaders dl where dl.adult_id = a.id))
     order by a.role desc, a.last_name
$$;

revoke execute on function public.leader_directory() from public, anon;
grant execute on function public.leader_directory() to authenticated;
grant execute on function public.current_adult_id(), public.is_member(), public.is_leader(),
    public.is_admin(), public.my_family_id(), public.is_my_scout(uuid),
    public.can_review_scout(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 10. Storage buckets (private) and policies
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('pack-photos', 'pack-photos', false),
       ('advancement-evidence', 'advancement-evidence', false)
on conflict (id) do nothing;

-- Photo files: upload only into your own folder; read if the photo row is visible to you
create policy "pack photos upload own folder" on storage.objects for insert to authenticated
    with check (bucket_id = 'pack-photos'
                and public.is_member()
                and (storage.foldername(name))[1] = public.current_adult_id()::text);

create policy "pack photos read visible" on storage.objects for select to authenticated
    using (bucket_id = 'pack-photos'
           and exists (select 1 from public.photos p where p.storage_path = storage.objects.name));
           -- the photos table's own RLS decides which rows "exist" for this user

create policy "pack photos delete" on storage.objects for delete to authenticated
    using (bucket_id = 'pack-photos'
           and ((storage.foldername(name))[1] = public.current_adult_id()::text or public.is_leader()));

-- Advancement evidence: own folder; readable by you and leaders
create policy "evidence upload own folder" on storage.objects for insert to authenticated
    with check (bucket_id = 'advancement-evidence'
                and public.is_member()
                and (storage.foldername(name))[1] = public.current_adult_id()::text);

create policy "evidence read" on storage.objects for select to authenticated
    using (bucket_id = 'advancement-evidence'
           and ((storage.foldername(name))[1] = public.current_adult_id()::text or public.is_leader()));
