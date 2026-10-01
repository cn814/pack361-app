-- Pack documents library: meeting minutes, the budget, blank forms, packing lists, the den
-- leader guide and the like. Nothing medical or personal (the upload form says so).
--   1. A private "pack-docs" bucket: 10 MB per file, office files, PDFs, text and images.
--   2. public.documents: one row per file, with who can see it (everyone, leaders or
--      committee, optionally one den only).
--   3. Storage policies that mirror the table: you can read a file only if you can see its row.
--   4. Storage use per bucket for the Pack admin page.

-- -----------------------------------------------------------------------------
-- 1. Bucket
-- -----------------------------------------------------------------------------
-- No HTML or SVG: a file served from the storage domain can't run scripts.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pack-docs', 'pack-docs', false, 10485760, array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'image/jpeg',
    'image/png',
    'image/webp'])
on conflict (id) do update
   set public = false,
       file_size_limit = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;

-- -----------------------------------------------------------------------------
-- 2. Documents
-- -----------------------------------------------------------------------------
create table public.documents (
    id            uuid primary key default gen_random_uuid(),
    title         text not null check (length(trim(title)) between 1 and 120),
    description   text check (length(description) <= 500),
    folder        text not null default 'General' check (length(trim(folder)) between 1 and 60),
    audience      text not null default 'everyone' check (audience in ('everyone', 'leaders', 'committee')),
    den_id        uuid references public.dens(id) on delete cascade,   -- null = whole pack
    -- 'docs/<uploader adult id>/<random>.<ext>' in bucket pack-docs
    storage_path  text not null unique check (storage_path ~ '^docs/[0-9a-f-]{36}/[^/]+$'),
    file_name     text not null check (length(file_name) between 1 and 200),
    mime_type     text not null check (mime_type in (
                      'application/pdf',
                      'application/msword',
                      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                      'application/vnd.ms-excel',
                      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                      'application/vnd.ms-powerpoint',
                      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                      'text/plain', 'text/csv', 'image/jpeg', 'image/png', 'image/webp')),
    size_bytes    bigint not null check (size_bytes between 0 and 10485760),
    pinned        boolean not null default false,
    archived_at   timestamptz,
    uploaded_by   uuid references public.adults(id) on delete set null,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    updated_by    uuid references public.adults(id) on delete set null
);
create index documents_folder_idx   on public.documents(folder);
create index documents_den_idx      on public.documents(den_id) where den_id is not null;
create index documents_uploader_idx on public.documents(uploaded_by);
create index documents_created_idx  on public.documents(created_at);

create trigger documents_stamp before insert or update on public.documents
    for each row execute function private.stamp_updated();

-- Who added a document and when never changes, and a new file always goes in the editor's
-- own folder (so nobody can point a row at a file someone else is uploading).
create or replace function private.documents_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    if tg_op = 'UPDATE' then
        new.uploaded_by := old.uploaded_by;
        new.created_at  := old.created_at;
        if new.storage_path is distinct from old.storage_path
           and new.storage_path not like 'docs/' || private.current_adult_id()::text || '/%' then
            raise exception 'A replacement file must be your own upload' using errcode = '42501';
        end if;
    end if;
    new.title  := trim(new.title);
    new.folder := trim(new.folder);
    return new;
end;
$$;
revoke execute on function private.documents_guard() from public, anon, authenticated;
create trigger documents_guard before insert or update on public.documents
    for each row execute function private.documents_guard();

revoke all on public.documents from anon, authenticated;
grant select, insert, update, delete on public.documents to authenticated;
alter table public.documents enable row level security;

-- Members see documents for everyone; leaders and committee see theirs too. A den document is
-- for that den's families and all leaders. Archived documents are for leaders only.
create policy documents_read on public.documents for select to authenticated
    using (private.is_member()
           and (audience = 'everyone'
                or (audience = 'leaders' and private.is_leader())
                or (audience = 'committee' and private.is_committee()))
           and (den_id is null or private.is_leader() or private.family_in_den(den_id))
           and (archived_at is null or private.is_leader()));

-- Leaders add documents as themselves, with the file in their own folder. Den leaders can't
-- make committee-only documents and can only target the dens they lead.
create policy documents_insert on public.documents for insert to authenticated
    with check (private.is_leader()
                and uploaded_by = private.current_adult_id()
                and storage_path like 'docs/' || private.current_adult_id()::text || '/%'
                and (audience <> 'committee' or private.is_committee())
                and (den_id is null or private.leads_den(den_id)));

-- Committee edits or archives anything; the person who added a document edits or archives
-- their own, within the same limits as adding.
create policy documents_update on public.documents for update to authenticated
    using (private.is_leader()
           and (private.is_committee() or uploaded_by = private.current_adult_id()))
    with check (private.is_leader()
                and (private.is_committee()
                     or (uploaded_by = private.current_adult_id()
                         and audience <> 'committee'
                         and (den_id is null or private.leads_den(den_id)))));

-- Deleting for good: committee and admins only.
create policy documents_delete on public.documents for delete to authenticated
    using (private.is_committee());

-- -----------------------------------------------------------------------------
-- 3. Storage policies (mirror the table)
-- -----------------------------------------------------------------------------
-- Is any document using this file? Looks past RLS, so a file stays put even when the
-- document is one you can't see (say, committee changed it to committee-only).
create or replace function private.document_file_in_use(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (select 1 from public.documents d where d.storage_path = p_path)
$$;
revoke execute on function private.document_file_in_use(text) from public, anon;
grant execute on function private.document_file_in_use(text) to authenticated;

-- Read a file when its documents row is visible to you (RLS above decides). A file no
-- document uses (an old file after a replacement, or an upload that wasn't saved) can be seen
-- only by the leader who uploaded it and by committee, so they can delete it: Storage only
-- deletes files you can see.
create policy "pack docs read visible" on storage.objects for select to authenticated
    using (bucket_id = 'pack-docs'
           and (exists (select 1 from public.documents d where d.storage_path = storage.objects.name)
                or (private.is_leader()
                    and not private.document_file_in_use(name)
                    and (private.is_committee()
                         or ((storage.foldername(name))[1] = 'docs'
                             and (storage.foldername(name))[2] = private.current_adult_id()::text)))));

-- Leaders upload into docs/<their adult id>/. Files are never overwritten in place: a
-- replacement is a new file and the old one is deleted.
create policy "pack docs upload" on storage.objects for insert to authenticated
    with check (bucket_id = 'pack-docs'
                and private.is_leader()
                and (storage.foldername(name))[1] = 'docs'
                and (storage.foldername(name))[2] = private.current_adult_id()::text);

-- Committee can delete any document file. A leader can delete their own files that no
-- document uses any more (an old file after a replacement, or an upload that wasn't saved).
create policy "pack docs delete" on storage.objects for delete to authenticated
    using (bucket_id = 'pack-docs'
           and private.is_leader()
           and (private.is_committee()
                or ((storage.foldername(name))[1] = 'docs'
                    and (storage.foldername(name))[2] = private.current_adult_id()::text
                    and not private.document_file_in_use(name))));

-- After a browser upload, the app checks the real size and type of the file before saving
-- the document. Only your own uploads in the documents bucket.
create or replace function public.document_upload_info(p_path text)
returns table (size_bytes bigint, mime_type text)
language sql stable security definer set search_path = '' as $$
    select (o.metadata->>'size')::bigint, o.metadata->>'mimetype'
      from storage.objects o
     where o.bucket_id = 'pack-docs'
       and o.name = p_path
       and private.is_leader()
       and p_path like 'docs/' || private.current_adult_id()::text || '/%'
$$;
revoke execute on function public.document_upload_info(text) from public, anon;
grant execute on function public.document_upload_info(text) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Storage used per bucket (the free plan includes 1 GB in total). Admins only.
-- -----------------------------------------------------------------------------
create or replace function public.storage_usage()
returns table (bucket_id text, bytes bigint, files bigint)
language sql stable security definer set search_path = '' as $$
    select o.bucket_id, coalesce(sum((o.metadata->>'size')::bigint), 0)::bigint, count(*)
      from storage.objects o
     where private.is_admin()
     group by o.bucket_id
     order by o.bucket_id
$$;
revoke execute on function public.storage_usage() from public, anon;
grant execute on function public.storage_usage() to authenticated;
