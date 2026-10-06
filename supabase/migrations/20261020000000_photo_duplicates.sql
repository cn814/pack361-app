-- The same person can't upload the same photo twice (2026-10-20).
-- The phone takes a fingerprint (SHA-256) of the original photo file before shrinking it, and the
-- upload saves it. One fingerprint per uploader: a second upload of the same file by the same
-- person is refused, and the app tells them it's already in the album. Another family uploading
-- their own copy isn't affected, and a copy that was texted or saved again has a different
-- fingerprint. Photos uploaded before this have none.

begin;

alter table public.photos add column if not exists source_hash text;
alter table public.photos drop constraint if exists photos_source_hash_format;
alter table public.photos add constraint photos_source_hash_format
    check (source_hash is null or source_hash ~ '^[0-9a-f]{64}$');
create unique index if not exists photos_uploader_source_hash
    on public.photos (uploader_id, source_hash) where source_hash is not null;

commit;
