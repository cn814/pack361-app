-- Review fixes: photo removal requests, leader-only deletes, album counts, event archive.
\echo '== Review fixes: setup'
insert into public.photos (id, uploader_id, storage_path, status, event_id)
values ('70000000-0000-0000-0000-000000000021', '30000000-0000-0000-0000-00000000000d', '30000000-0000-0000-0000-00000000000d/a1.jpg', 'approved', null),
       ('70000000-0000-0000-0000-000000000022', '30000000-0000-0000-0000-00000000000d', '30000000-0000-0000-0000-00000000000d/a2.jpg', 'approved', null),
       ('70000000-0000-0000-0000-000000000023', '30000000-0000-0000-0000-00000000000d', '30000000-0000-0000-0000-00000000000d/a3.jpg', 'pending_review', null);
insert into storage.objects (bucket_id, name) values
    ('pack-photos', '30000000-0000-0000-0000-00000000000a/mine.jpg'),
    ('pack-photos', '30000000-0000-0000-0000-00000000000d/a1.jpg');

select test.check((select file_size_limit from storage.buckets where id = 'pack-photos') = 4194304
                  and (select allowed_mime_types from storage.buckets where id = 'pack-photos') = array['image/jpeg'],
                  'photo bucket only takes JPEGs up to 4 MB');

\echo '== Review fixes: parent (Alex)'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal2"}', true);
select test.expect_rows($$delete from public.photos where uploader_id = '30000000-0000-0000-0000-00000000000a'$$, 0,
                        'parents cannot delete even their own pending photos');
select test.expect_rows($$delete from storage.objects where name like '30000000-0000-0000-0000-00000000000a/%'$$, 0,
                        'parents cannot delete photo files');
select test.check((select a.photo_count from public.photo_albums() a where a.event_id is null)
                  = (select count(*) from public.photos where event_id is null and status = 'approved')
                  and not exists (select 1 from public.photo_albums() a join public.photos p on p.id = a.cover_id where p.status <> 'approved'),
                  'album count includes only approved photos the family can see');
select test.check(public.flag_photo('70000000-0000-0000-0000-000000000021', 'please remove'), 'removal request is recorded');
select test.check(not public.flag_photo('70000000-0000-0000-0000-000000000021', 'again'), 'a second tap does not add a second request');
select test.check((select count(*) from public.photo_flags where photo_id = '70000000-0000-0000-0000-000000000021') = 1,
                  'one open request per person per photo');
rollback;

\echo '== Review fixes: removal request limit (Blair)'
-- Ten requests today (already handled, so they don't trip the one-open-request rule).
insert into public.photo_flags (photo_id, adult_id, resolved_at)
select '70000000-0000-0000-0000-000000000009', '30000000-0000-0000-0000-00000000000b', now() from generate_series(1, 10);
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","aal":"aal2"}', true);
select test.expect_error($$select public.flag_photo('70000000-0000-0000-0000-000000000022', 'x')$$, '54000',
                         'removal requests are capped per day');
rollback;
delete from public.photo_flags where adult_id = '30000000-0000-0000-0000-00000000000b';

\echo '== Review fixes: den leader (Lee)'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);
select test.check(public.flag_photo('70000000-0000-0000-0000-000000000023', null), 'leaders can send a pending photo back with a request');
select test.expect_rows($$delete from public.photos where id = '70000000-0000-0000-0000-000000000022'$$, 1, 'leaders delete photos');
select test.expect_rows($$delete from storage.objects where name = '30000000-0000-0000-0000-00000000000d/a1.jpg'$$, 1,
                        'leaders delete photo files');
select test.expect_rows($$update public.events set archived_at = now(), archived_reason = 'hidden'
                           where id = '50000000-0000-0000-0000-000000000009'$$, 1, 'leaders can move an event to the archive');
select test.expect_error($$update public.events set archived_reason = 'bogus' where id = '50000000-0000-0000-0000-000000000009'$$,
                         '23514', 'archive reason must be a known one');
rollback;

\echo '== Review fixes: parent cannot archive events'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal2"}', true);
select test.expect_rows($$update public.events set archived_at = now()$$, 0, 'parents cannot archive events');
rollback;

\echo '== Review fixes: photo storage total'
update storage.objects set metadata = '{"size": 500000}' where bucket_id = 'pack-photos';
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","aal":"aal2"}', true);
select test.check(public.photo_storage_bytes() > 0, 'admins see how much photo storage is used');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal2"}', true);
select test.check(public.photo_storage_bytes() is null, 'parents do not');
rollback;

\echo '== REVIEW TESTS PASSED'
