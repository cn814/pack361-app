-- Security review fixes (2026-10-02). See docs/SECURITY-REVIEW.md.

-- 1. "Report a problem" sends every admin an email and an alert: at most 10 a day per person, so
--    nobody can flood the admins or use up the day's email allowance (which sign-in codes share).
create or replace function private.feedback_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    if (select count(*) from public.feedback f
         where f.adult_id = new.adult_id and f.created_at > now() - interval '1 day') >= 10 then
        raise exception 'That''s a lot of messages today. Email info@pack361.org instead.' using errcode = '54000';
    end if;
    return new;
end;
$$;
revoke execute on function private.feedback_limit() from public, anon, authenticated;
create trigger feedback_limit
    before insert on public.feedback
    for each row execute function private.feedback_limit();

-- 2. Polls: after people vote, only the closing date can change (votes are stored as option
--    numbers, so editing the options would change what people voted for). Only leaders edit or
--    delete their polls; someone who is no longer a leader can't.
revoke update on public.polls from authenticated;
grant update (closed_at, closes_at) on public.polls to authenticated;
drop policy polls_edit on public.polls;
drop policy polls_delete on public.polls;
create policy polls_edit on public.polls for update to authenticated
    using (private.is_admin() or (private.is_leader() and created_by = private.current_adult_id()))
    with check (private.is_admin() or (private.is_leader() and created_by = private.current_adult_id()));
create policy polls_delete on public.polls for delete to authenticated
    using (private.is_admin() or (private.is_leader() and created_by = private.current_adult_id()));

-- 3. Calendar feed links: anyone can get a new one (the old link stops working), e.g. after
--    pasting it somewhere it shouldn't be.
create or replace function public.reset_calendar_token()
returns void language plpgsql security definer set search_path = '' as $$
begin
    if private.current_adult_id() is null then
        raise exception 'Sign in first' using errcode = '42501';
    end if;
    update public.adults set calendar_token = gen_random_uuid() where id = private.current_adult_id();
end;
$$;
revoke all on function public.reset_calendar_token() from public, anon;
grant execute on function public.reset_calendar_token() to authenticated;

-- 4. Uploads: the advancement-evidence bucket was never used by the app, but anyone could upload
--    any file of any size to it. Close it and give it the same limits as the others.
drop policy if exists "evidence upload own folder" on storage.objects;
update storage.buckets
   set file_size_limit = 4194304, allowed_mime_types = array['image/jpeg']
 where id = 'advancement-evidence';

--    Photos and receipts: a daily cap per person, so one account can't fill the pack's 1 GB of
--    file storage. (Generous: a big campout is a few dozen photos.)
create or replace function private.uploads_today(p_bucket text, p_folder text)
returns bigint language sql stable security definer set search_path = '' as $$
    select count(*) from storage.objects o
     where o.bucket_id = p_bucket
       and o.name like p_folder || '/%'
       and o.created_at > now() - interval '1 day'
$$;
revoke execute on function private.uploads_today(text, text) from public, anon;
grant execute on function private.uploads_today(text, text) to authenticated;

drop policy "pack photos upload own folder" on storage.objects;
create policy "pack photos upload own folder" on storage.objects for insert to authenticated
    with check (bucket_id = 'pack-photos'
                and private.is_member()
                and (storage.foldername(name))[1] = private.current_adult_id()::text
                and (private.is_leader() or private.uploads_today('pack-photos', private.current_adult_id()::text) < 300));

drop policy "receipts upload" on storage.objects;
create policy "receipts upload" on storage.objects for insert to authenticated
    with check (bucket_id = 'receipts'
                and private.is_member()
                and (storage.foldername(name))[1] = 'r'
                and (storage.foldername(name))[2] = private.current_adult_id()::text
                and private.uploads_today('receipts', 'r/' || private.current_adult_id()::text) < 40);

-- 5. Helper and trigger functions don't need to be callable by signed-out visitors.
revoke execute on function private.adult_in_my_family(uuid) from public, anon;
revoke execute on function private.can_see_event(uuid) from public, anon;
revoke execute on function private.can_see_poll(uuid) from public, anon;
revoke execute on function private.is_committee() from public, anon;
grant execute on function private.adult_in_my_family(uuid), private.can_see_event(uuid), private.can_see_poll(uuid),
    private.is_committee() to authenticated;
revoke execute on function private.join_request_insert() from public, anon, authenticated;
revoke execute on function private.permission_slip_insert() from public, anon, authenticated;
