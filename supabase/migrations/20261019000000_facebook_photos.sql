-- Photos on the pack's public Facebook page (2026-10-19).
-- The album in the app stays private to the pack. Some photos also go on the pack's public
-- Facebook page, and a scout's face may only show there if their family said yes.
--   1. scouts.social_ok   the family's answer: true = yes, false = no, null = not answered (= no).
--                         Families answer for their own scouts (the row guard allows it).
--   2. Who may post       leaders, plus anyone a pack admin adds (report_access 'social'), such
--                         as the pack's social media coordinator. They see who said yes (first
--                         name, last initial, den) and mark who's in each photo.
--   3. photo_people       the scouts in a photo. photos.people_checked_at: someone went through
--                         the photo and the list is complete (an empty list = no scout's face
--                         shows). A photo is OK for Facebook when it's approved, checked, and
--                         every scout in it has a yes.
--   4. To-do              families who haven't answered get a Home to-do; "Not now" files
--                         'facebook-photos' in todo_dismissals.

begin;

-- -----------------------------------------------------------------------------
-- 1. The family's answer
-- -----------------------------------------------------------------------------
alter table public.scouts add column if not exists social_ok boolean;
alter table public.scouts add column if not exists social_ok_at timestamptz;
comment on column public.scouts.social_ok is
    'Face on the pack''s public Facebook page. true = the family said yes; false or null (not answered) = no.';

-- Families may now change photo_permission and social_ok on their own scouts.
drop trigger if exists scouts_guard_changes on public.scouts;
create trigger scouts_guard_changes
    before update on public.scouts
    for each row execute function private.guard_row_changes('photo_permission', 'photo_permission_at', 'social_ok', 'social_ok_at');

create or replace function private.stamp_social_ok()
returns trigger language plpgsql set search_path = '' as $$
begin
    -- Out of pack photos means off Facebook too.
    if new.photo_permission = 'no' then
        new.social_ok := false;
    end if;
    if new.social_ok is distinct from old.social_ok then
        new.social_ok_at := now();
    end if;
    return new;
end;
$$;
revoke execute on function private.stamp_social_ok() from public, anon, authenticated;
drop trigger if exists scouts_stamp_social_ok on public.scouts;
create trigger scouts_stamp_social_ok
    before update of social_ok, photo_permission on public.scouts
    for each row execute function private.stamp_social_ok();

-- -----------------------------------------------------------------------------
-- 2. Who may post to the pack's Facebook
-- -----------------------------------------------------------------------------
alter table public.report_access drop constraint if exists report_access_report_check;
alter table public.report_access add constraint report_access_report_check
    check (report in ('roster', 'membership', 'social'));

-- Leaders, and anyone a pack admin added for Facebook photos (no authenticator code needed:
-- they see first names, last initials and dens, and the photos every family sees).
create or replace function private.can_social()
returns boolean language sql stable security definer set search_path = '' as $$
    select private.is_leader() or exists (
        select 1 from public.adults a
          join public.report_access r on r.adult_id = a.id and r.report = 'social'
         where a.user_id = auth.uid() and a.is_active)
$$;
revoke execute on function private.can_social() from public, anon;
grant execute on function private.can_social() to authenticated;

create or replace function public.social_access()
returns boolean language sql stable security definer set search_path = '' as $$
    select private.can_social()
$$;
revoke execute on function public.social_access() from public, anon;
grant execute on function public.social_access() to authenticated;

-- Can a scout's face go on Facebook? A yes, and not opted out of pack photos.
create or replace function private.social_yes(p_social_ok boolean, p_photo_permission text)
returns boolean language sql immutable set search_path = '' as $$
    select coalesce(p_social_ok, false) and p_photo_permission is distinct from 'no'
$$;

-- Every active scout and their family's answer, for the tag picker and the yes list.
create or replace function public.social_scouts()
returns table (scout_id uuid, name text, den text, rank text, social_ok boolean, answered boolean)
language sql stable security definer set search_path = '' as $$
    select s.id,
           s.first_name || coalesce(' ' || nullif(left(s.last_name, 1), '') || '.', ''),
           d.name,
           d.rank::text,
           private.social_yes(s.social_ok, s.photo_permission),
           s.social_ok is not null or s.photo_permission is not distinct from 'no'
      from public.scouts s
      left join public.dens d on d.id = s.den_id
     where s.is_active and private.can_social()
$$;
revoke execute on function public.social_scouts() from public, anon;
grant execute on function public.social_scouts() to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Who's in each photo
-- -----------------------------------------------------------------------------
alter table public.photos add column if not exists people_checked_at timestamptz;
alter table public.photos add column if not exists people_checked_by uuid references public.adults(id) on delete set null;

create table if not exists public.photo_people (
    photo_id  uuid not null references public.photos(id) on delete cascade,
    scout_id  uuid not null references public.scouts(id) on delete cascade,
    primary key (photo_id, scout_id)
);
create index if not exists photo_people_scout on public.photo_people (scout_id);
alter table public.photo_people enable row level security;
revoke all on public.photo_people from anon;
grant select on public.photo_people to authenticated;
drop policy if exists photo_people_read on public.photo_people;
create policy photo_people_read on public.photo_people for select to authenticated
    using ((select private.can_social()));
-- Changes go through set_photo_people (one list at a time).

-- Save the complete list of scouts in a photo (empty = no scout's face shows).
create or replace function public.set_photo_people(p_photo_id uuid, p_scouts uuid[])
returns void language plpgsql security definer set search_path = '' as $$
begin
    if not private.can_social() then
        raise exception 'Not allowed' using errcode = '42501';
    end if;
    if not exists (select 1 from public.photos p where p.id = p_photo_id) then
        raise exception 'Photo not found' using errcode = 'P0002';
    end if;
    if cardinality(coalesce(p_scouts, '{}')) > 60 then
        raise exception 'Too many scouts' using errcode = '22023';
    end if;
    delete from public.photo_people where photo_id = p_photo_id;
    insert into public.photo_people (photo_id, scout_id)
    select distinct p_photo_id, s.id from public.scouts s where s.id = any(coalesce(p_scouts, '{}'));
    update public.photos
       set people_checked_at = now(), people_checked_by = private.current_adult_id()
     where id = p_photo_id;
end $$;
revoke execute on function public.set_photo_people(uuid, uuid[]) from public, anon;
grant execute on function public.set_photo_people(uuid, uuid[]) to authenticated;

-- Facebook status of approved photos: checked or not, how many scouts, how many without a yes.
-- p_photo_ids null = every approved photo.
create or replace function public.photo_social_status(p_photo_ids uuid[] default null)
returns table (photo_id uuid, checked boolean, people int, not_ok int, not_ok_names text)
language sql stable security definer set search_path = '' as $$
    select p.id,
           p.people_checked_at is not null,
           (select count(*)::int from public.photo_people pp where pp.photo_id = p.id),
           (select count(*)::int from public.photo_people pp join public.scouts s on s.id = pp.scout_id
             where pp.photo_id = p.id and not private.social_yes(s.social_ok, s.photo_permission)),
           (select string_agg(s.first_name || coalesce(' ' || nullif(left(s.last_name, 1), '') || '.', ''), ', ' order by s.first_name)
              from public.photo_people pp join public.scouts s on s.id = pp.scout_id
             where pp.photo_id = p.id and not private.social_yes(s.social_ok, s.photo_permission))
      from public.photos p
     where private.can_social()
       and (p.status = 'approved' or private.is_leader())
       and (p_photo_ids is null or p.id = any(p_photo_ids))
$$;
revoke execute on function public.photo_social_status(uuid[]) from public, anon;
grant execute on function public.photo_social_status(uuid[]) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. To-do dismissals: poll-<id>, job-<id>, training-import, getting-started, facebook-photos
-- -----------------------------------------------------------------------------
alter table public.todo_dismissals drop constraint if exists todo_dismissals_key_check;
alter table public.todo_dismissals add constraint todo_dismissals_key_check
    check (key ~ '^((poll|job)-[0-9a-f-]{36}|training-import|getting-started|facebook-photos)$');

commit;
