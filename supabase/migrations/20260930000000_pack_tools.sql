-- Pack tools (2026-09-30):
--   Roster admin      admins add and edit families, adults, scouts, dens and den leaders in the app
--   Welcome emails    adults.welcomed_at; admins see who has signed in (public.roster_sign_ins)
--   Den meetings      den_meetings + attendance; leaders report requirements for everyone present
--   Volunteer jobs    reminder stamp on sign-ups; public.volunteer_roster shows who signed up
--   Training          adult_trainings (Youth Protection, Hazardous Weather, BALOO, ...) + reminders
--   Photo vault       per-scout photo permission, thumbnails, removal requests, leader auto-approve
-- Everything stays behind Row Level Security; the only new SECURITY DEFINER functions are
-- small read helpers and flag_photo, each of which checks the caller first.

-- -----------------------------------------------------------------------------
-- 1. Roster admin
-- -----------------------------------------------------------------------------
-- Admins get full insert/update on adults. Everyone else can still change only their own
-- phone and preferred name: the guard trigger rejects any other column change.
grant insert, update on public.adults to authenticated;

create policy adults_admin_insert on public.adults for insert to authenticated
    with check (private.is_admin());
create policy adults_admin_update on public.adults for update to authenticated
    using (private.is_admin()) with check (private.is_admin());

create or replace function private.guard_row_changes()
returns trigger language plpgsql set search_path = '' as $$
-- TG_ARGV: the columns a non-admin may change on rows the policies let them update.
begin
    if current_user = 'authenticated' and not private.is_admin() then
        if (to_jsonb(new) - tg_argv::text[]) is distinct from (to_jsonb(old) - tg_argv::text[]) then
            raise exception 'Only pack admins can change that' using errcode = '42501';
        end if;
    end if;
    return new;
end;
$$;
revoke execute on function private.guard_row_changes() from public, anon, authenticated;

create trigger adults_guard_changes
    before update on public.adults
    for each row execute function private.guard_row_changes('phone', 'preferred_name');

-- Scouts: families answer the photo question for their own scouts; admins change the rest.
alter table public.scouts
    add column photo_permission text check (photo_permission in ('yes', 'no')),  -- null = not answered
    add column photo_permission_at timestamptz;
update public.scouts set photo_permission = 'no' where media_opt_out;
comment on column public.scouts.media_opt_out is 'Replaced by photo_permission (2026-09-30).';

create policy scouts_family_photo on public.scouts for update to authenticated
    using (family_id = private.my_family_id()) with check (family_id = private.my_family_id());

create trigger scouts_guard_changes
    before update on public.scouts
    for each row execute function private.guard_row_changes('photo_permission', 'photo_permission_at');

create or replace function private.stamp_photo_permission()
returns trigger language plpgsql set search_path = '' as $$
begin
    if new.photo_permission is distinct from old.photo_permission then
        new.photo_permission_at := now();
    end if;
    return new;
end;
$$;
revoke execute on function private.stamp_photo_permission() from public, anon, authenticated;
create trigger scouts_stamp_photo_permission
    before update of photo_permission on public.scouts
    for each row execute function private.stamp_photo_permission();

-- -----------------------------------------------------------------------------
-- 2. Welcome emails
-- -----------------------------------------------------------------------------
alter table public.adults add column welcomed_at timestamptz;

-- Last sign-in per roster adult, for the admin welcome page (auth.users isn't readable otherwise).
create or replace function public.roster_sign_ins()
returns table (adult_id uuid, last_sign_in_at timestamptz)
language sql stable security definer set search_path = '' as $$
    select a.id, u.last_sign_in_at
      from public.adults a
      join auth.users u on u.id = a.user_id
     where private.is_admin()
$$;
revoke execute on function public.roster_sign_ins() from public, anon;
grant execute on function public.roster_sign_ins() to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Den meetings
-- -----------------------------------------------------------------------------
-- Den leaders of this den, plus committee / cubmaster / admin.
create or replace function private.leads_den(p_den_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (
        select 1 from public.adults a
         where a.user_id = auth.uid() and a.is_active
           and a.role in ('committee', 'cubmaster', 'admin'))
    or exists (
        select 1 from public.den_leaders dl
          join public.adults a on a.id = dl.adult_id
         where dl.den_id = p_den_id and a.user_id = auth.uid() and a.is_active)
$$;

-- Does the signed-in family have a scout in this den?
create or replace function private.family_in_den(p_den_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (
        select 1 from public.scouts s
          join public.adults a on a.family_id = s.family_id
         where s.den_id = p_den_id and s.is_active and a.user_id = auth.uid() and a.is_active)
$$;

create table public.den_meetings (
    id            uuid primary key default gen_random_uuid(),
    den_id        uuid not null references public.dens(id) on delete cascade,
    meets_on      date not null,
    title         text not null,
    rank          public.den_rank,
    adventure     text,                          -- catalog adventure the meeting works on
    requirements  text[] not null default '{}',  -- requirement numbers covered, e.g. {1,3}
    location      text,
    family_note   text,                          -- shown to families: "bring a flashlight"
    created_by    uuid references public.adults(id) on delete set null,
    created_at    timestamptz not null default now(),
    recorded_at   timestamptz,                   -- when requirements were reported for attendees
    recorded_by   uuid references public.adults(id) on delete set null
);
create index den_meetings_den_idx on public.den_meetings(den_id, meets_on);

create or replace function private.meeting_den(p_meeting_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
    select den_id from public.den_meetings where id = p_meeting_id
$$;

create table public.den_meeting_attendance (
    meeting_id  uuid not null references public.den_meetings(id) on delete cascade,
    scout_id    uuid not null references public.scouts(id) on delete cascade,
    primary key (meeting_id, scout_id)
);

alter table public.advancement_submissions
    add column meeting_id uuid references public.den_meetings(id) on delete set null;

-- Leaders may enter already-approved requirements (from a den meeting) for scouts they review.
create policy adv_sub_leader_insert on public.advancement_submissions for insert to authenticated
    with check (private.can_review_scout(scout_id)
                and submitted_by = private.current_adult_id()
                and status in ('submitted', 'approved'));

-- Stamp the reviewer on insert, the same way stamp_review does on update.
create or replace function private.stamp_insert_review()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    if new.status::text = 'approved' then
        new.reviewed_by := private.current_adult_id();
        new.reviewed_at := now();
    else
        new.reviewed_by := null;
        new.reviewed_at := null;
    end if;
    return new;
end;
$$;
revoke execute on function private.stamp_insert_review() from public, anon, authenticated;

create trigger advancement_stamp_insert
    before insert on public.advancement_submissions
    for each row execute function private.stamp_insert_review();

-- -----------------------------------------------------------------------------
-- 4. Volunteer jobs
-- -----------------------------------------------------------------------------
alter table public.volunteer_signups add column reminded_at timestamptz;

-- Who signed up for each job at an event, shown to members as first name + last initial
-- (parents can't read other families' adult rows directly).
create or replace function public.volunteer_roster(p_event_id uuid)
returns table (slot_id uuid, adult_id uuid, name text)
language sql stable security definer set search_path = '' as $$
    select vs.slot_id, a.id,
           coalesce(a.preferred_name, a.first_name) || ' ' || left(a.last_name, 1) || '.'
      from public.volunteer_signups vs
      join public.volunteer_slots s on s.id = vs.slot_id
      join public.adults a on a.id = vs.adult_id
     where private.is_member() and s.event_id = p_event_id
     order by vs.created_at
$$;
revoke execute on function public.volunteer_roster(uuid) from public, anon;
grant execute on function public.volunteer_roster(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Leader training
-- -----------------------------------------------------------------------------
create table public.adult_trainings (
    adult_id       uuid not null references public.adults(id) on delete cascade,
    course         text not null check (course in
                     ('ypt', 'position', 'hazardous_weather', 'baloo', 'safe_swim', 'safety_afloat')),
    completed_on   date,
    expires_on     date,
    reminded_days  int,          -- smallest "days before expiry" reminder already sent
    updated_at     timestamptz not null default now(),
    updated_by     uuid references public.adults(id) on delete set null,
    primary key (adult_id, course)
);

insert into public.adult_trainings (adult_id, course, expires_on)
select id, 'ypt', ypt_expires_on from public.adults where ypt_expires_on is not null
on conflict do nothing;
comment on column public.adults.ypt_expires_on is 'Replaced by adult_trainings (2026-09-30).';

create or replace function private.stamp_training()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    if tg_op = 'UPDATE' and new.completed_on is not distinct from old.completed_on
                        and new.expires_on is not distinct from old.expires_on then
        return new;                  -- only the reminder job's bookkeeping changed
    end if;
    new.updated_at := now();
    new.updated_by := private.current_adult_id();
    new.reminded_days := null;       -- new or renewed dates: remind again before the new expiry
    return new;
end;
$$;
revoke execute on function private.stamp_training() from public, anon, authenticated;
create trigger adult_trainings_stamp
    before insert or update on public.adult_trainings
    for each row execute function private.stamp_training();

-- -----------------------------------------------------------------------------
-- 6. Photo vault
-- -----------------------------------------------------------------------------
alter table public.photos add column thumb_path text unique;

create table public.photo_flags (
    id           uuid primary key default gen_random_uuid(),
    photo_id     uuid not null references public.photos(id) on delete cascade,
    adult_id     uuid not null references public.adults(id) on delete cascade,
    reason       text,
    created_at   timestamptz not null default now(),
    resolved_at  timestamptz,
    resolved_by  uuid references public.adults(id) on delete set null
);
create index photo_flags_photo_idx on public.photo_flags(photo_id);

-- Leaders' own uploads go straight to the album; everyone else's wait for a leader.
drop policy if exists photos_upload on public.photos;
create policy photos_upload on public.photos for insert to authenticated
    with check (uploader_id = private.current_adult_id()
                and (status = 'pending_review' or (status = 'approved' and private.is_leader()))
                and storage_path like private.current_adult_id()::text || '/%'
                and (thumb_path is null or thumb_path like private.current_adult_id()::text || '/%'));

create trigger photos_stamp_insert
    before insert on public.photos
    for each row execute function private.stamp_insert_review();

-- Thumbnails are readable whenever their photo is.
drop policy if exists "pack photos read visible" on storage.objects;
create policy "pack photos read visible" on storage.objects for select to authenticated
    using (bucket_id = 'pack-photos'
           and exists (select 1 from public.photos p
                        where p.storage_path = storage.objects.name
                           or p.thumb_path = storage.objects.name));

-- "Please take this down": any member can flag a photo they can see. The photo is hidden
-- from families at once and goes back to the leaders' review list with the reason.
create or replace function public.flag_photo(p_photo_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
    if not private.is_member() then
        raise exception 'Not on the pack roster' using errcode = '42501';
    end if;
    if not exists (select 1 from public.photos p
                    where p.id = p_photo_id
                      and (p.status = 'approved' or p.uploader_id = private.current_adult_id())) then
        raise exception 'Photo not found' using errcode = 'P0002';
    end if;
    insert into public.photo_flags (photo_id, adult_id, reason)
    values (p_photo_id, private.current_adult_id(), left(nullif(trim(p_reason), ''), 500));
    update public.photos set status = 'pending_review' where id = p_photo_id;
end;
$$;
revoke execute on function public.flag_photo(uuid, text) from public, anon;
grant execute on function public.flag_photo(uuid, text) to authenticated;

insert into public.pack_settings (key, value) values
    ('photo_keep_months', '24'),
    ('email_daily_limit', '80')
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- 7. Privileges and Row Level Security for the new tables
-- -----------------------------------------------------------------------------
revoke all on public.den_meetings, public.den_meeting_attendance, public.adult_trainings,
              public.photo_flags from anon, authenticated;
grant select, insert, update, delete on public.den_meetings to authenticated;
grant select, insert, delete on public.adult_trainings to authenticated;
grant update (completed_on, expires_on) on public.adult_trainings to authenticated;
grant select, insert, delete on public.den_meeting_attendance to authenticated;
grant select, update (resolved_at, resolved_by) on public.photo_flags to authenticated;

alter table public.den_meetings           enable row level security;
alter table public.den_meeting_attendance enable row level security;
alter table public.adult_trainings        enable row level security;
alter table public.photo_flags            enable row level security;

-- Meetings: the den's families read them; the den's leaders plan them.
create policy meetings_read on public.den_meetings for select to authenticated
    using (private.leads_den(den_id) or private.family_in_den(den_id));
create policy meetings_write on public.den_meetings for all to authenticated
    using (private.leads_den(den_id)) with check (private.leads_den(den_id));

-- Attendance: leaders of the meeting's den; families see their own scouts' attendance.
create policy attendance_read on public.den_meeting_attendance for select to authenticated
    using (private.leads_den(private.meeting_den(meeting_id)) or private.is_my_scout(scout_id));
create policy attendance_write on public.den_meeting_attendance for insert to authenticated
    with check (private.leads_den(private.meeting_den(meeting_id)) and private.can_review_scout(scout_id));
create policy attendance_remove on public.den_meeting_attendance for delete to authenticated
    using (private.leads_den(private.meeting_den(meeting_id)));

-- Training: you and pack leaders can see yours; you or an admin can update it.
create policy trainings_read on public.adult_trainings for select to authenticated
    using (adult_id = private.current_adult_id() or private.is_leader());
create policy trainings_insert on public.adult_trainings for insert to authenticated
    with check (adult_id = private.current_adult_id() or private.is_admin());
create policy trainings_update on public.adult_trainings for update to authenticated
    using (adult_id = private.current_adult_id() or private.is_admin())
    with check (adult_id = private.current_adult_id() or private.is_admin());
create policy trainings_delete on public.adult_trainings for delete to authenticated
    using (adult_id = private.current_adult_id() or private.is_admin());

-- Photo removal requests: the requester and leaders see them; leaders resolve them.
create policy flags_read on public.photo_flags for select to authenticated
    using (adult_id = private.current_adult_id() or private.is_leader());
create policy flags_resolve on public.photo_flags for update to authenticated
    using (private.is_leader()) with check (private.is_leader());

revoke execute on function private.leads_den(uuid), private.family_in_den(uuid), private.meeting_den(uuid)
    from public, anon;
grant execute on function private.leads_den(uuid), private.family_in_den(uuid), private.meeting_den(uuid)
    to authenticated;
