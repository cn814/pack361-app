-- Fixes from the project review (Oct 2026):
--   1. Events are never deleted by the TroopWebHost sync. Removed ones are archived instead,
--      and a leader can hide an event (it moves to the archive and the sync leaves it there).
--   2. Photos: only leaders delete; families ask for removal (one open request each, capped
--      per day). The bucket only takes JPEGs up to 4 MB. Album list counted in the database.
--   3. Missing indexes.

-- -----------------------------------------------------------------------------
-- 1. Event archive
-- -----------------------------------------------------------------------------
alter table public.events
    add column archived_at     timestamptz,
    add column archived_reason text check (archived_reason in ('removed_in_twh', 'hidden'));

-- -----------------------------------------------------------------------------
-- 2. Photos
-- -----------------------------------------------------------------------------
drop policy if exists photos_delete on public.photos;
create policy photos_delete on public.photos for delete to authenticated
    using (private.is_leader());

drop policy if exists "pack photos delete" on storage.objects;
create policy "pack photos delete" on storage.objects for delete to authenticated
    using (bucket_id = 'pack-photos' and private.is_leader());

-- The app uploads browser-resized JPEGs (about 0.3–1 MB); refuse anything else sent
-- straight to the Storage API.
update storage.buckets
   set file_size_limit = 4194304, allowed_mime_types = array['image/jpeg']
 where id = 'pack-photos';

-- One open removal request per person per photo.
delete from public.photo_flags a
 using public.photo_flags b
 where a.resolved_at is null and b.resolved_at is null
   and a.photo_id = b.photo_id and a.adult_id = b.adult_id
   and (a.created_at, a.id) > (b.created_at, b.id);
create unique index photo_flags_open_key on public.photo_flags(photo_id, adult_id) where resolved_at is null;
create index photo_flags_adult_idx on public.photo_flags(adult_id, created_at);

-- Returns true when this is a new request (so admins are alerted once, not on every tap).
drop function if exists public.flag_photo(uuid, text);
create function public.flag_photo(p_photo_id uuid, p_reason text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
    me uuid := private.current_adult_id();
    added int;
begin
    if not private.is_member() then
        raise exception 'Not on the pack roster' using errcode = '42501';
    end if;
    -- Already asked (the photo is hidden from you now): nothing new to send.
    if exists (select 1 from public.photo_flags f
                where f.photo_id = p_photo_id and f.adult_id = me and f.resolved_at is null) then
        return false;
    end if;
    if not exists (select 1 from public.photos p
                    where p.id = p_photo_id
                      and (p.status = 'approved' or p.uploader_id = me or private.is_leader())) then
        raise exception 'Photo not found' using errcode = 'P0002';
    end if;
    if (select count(*) from public.photo_flags f
         where f.adult_id = me and f.created_at > now() - interval '1 day') >= 10 then
        raise exception 'Too many removal requests today' using errcode = '54000';
    end if;
    insert into public.photo_flags (photo_id, adult_id, reason)
    values (p_photo_id, me, left(nullif(trim(p_reason), ''), 500))
    on conflict (photo_id, adult_id) where resolved_at is null do nothing;
    get diagnostics added = row_count;
    update public.photos set status = 'pending_review' where id = p_photo_id and status = 'approved';
    return added > 0;
end;
$$;
revoke execute on function public.flag_photo(uuid, text) from public, anon;
grant execute on function public.flag_photo(uuid, text) to authenticated;

-- Albums: one row per event (null = "Around the pack") with its photo count and newest
-- photo as the cover. Runs as the caller, so RLS decides which photos count.
create or replace function public.photo_albums()
returns table (event_id uuid, photo_count bigint, cover_id uuid, latest_at timestamptz)
language sql stable security invoker set search_path = '' as $$
    select distinct on (p.event_id)
           p.event_id,
           count(*) over (partition by p.event_id),
           p.id,
           p.created_at
      from public.photos p
     where p.status = 'approved'
     order by p.event_id, p.created_at desc, p.id;
$$;
revoke execute on function public.photo_albums() from public, anon;
grant execute on function public.photo_albums() to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Indexes for the lookups the app and the policies make
-- -----------------------------------------------------------------------------
create index if not exists events_starts_at_idx               on public.events(starts_at);
create index if not exists den_leaders_adult_idx              on public.den_leaders(adult_id);
create index if not exists volunteer_slots_event_idx          on public.volunteer_slots(event_id);
create index if not exists volunteer_signups_adult_idx        on public.volunteer_signups(adult_id);
create index if not exists itinerary_items_event_idx          on public.itinerary_items(event_id);
create index if not exists packing_items_event_idx            on public.packing_items(event_id);
create index if not exists push_subscriptions_adult_idx       on public.push_subscriptions(adult_id);
create index if not exists photos_uploader_idx                on public.photos(uploader_id);
create index if not exists photos_event_idx                   on public.photos(event_id);
create index if not exists photos_status_created_idx          on public.photos(status, created_at);
create index if not exists den_meeting_attendance_scout_idx   on public.den_meeting_attendance(scout_id);
create index if not exists advancement_submissions_status_idx on public.advancement_submissions(status);

-- -----------------------------------------------------------------------------
-- 4. Email budget: Resend's free plan is 100 emails a day, shared by welcome emails, sign-in
--    emails, reminders and alerts. Everyone who gets a welcome email then signs in (another
--    email), so welcome emails get at most 40 a day, leaving room for the sign-ins they cause.
-- -----------------------------------------------------------------------------
update public.pack_settings set value = '40' where key = 'email_daily_limit' and value = '80';

-- -----------------------------------------------------------------------------
-- 5. How much photo storage is used (the free plan includes 1 GB), for the Pack admin page.
-- -----------------------------------------------------------------------------
create or replace function public.photo_storage_bytes()
returns bigint language sql stable security definer set search_path = '' as $$
    select case when private.is_admin()
                then coalesce(sum((o.metadata->>'size')::bigint), 0)::bigint
           end
      from storage.objects o
     where o.bucket_id = 'pack-photos';
$$;
revoke execute on function public.photo_storage_bytes() from public, anon;
grant execute on function public.photo_storage_bytes() to authenticated;
