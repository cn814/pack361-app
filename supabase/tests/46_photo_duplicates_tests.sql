-- The same person can't upload the same photo file twice.
\set QUIET on
set client_min_messages = notice;

\echo '== The same person cannot upload the same photo twice'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal1"}', true);
select test.expect_rows($$insert into public.photos (uploader_id, storage_path, source_hash) values ('30000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a/d1.jpg', repeat('ab', 32))$$, 1,
                        'a parent uploads a photo with its fingerprint');
select test.expect_error($$insert into public.photos (uploader_id, storage_path, source_hash) values ('30000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a/d2.jpg', repeat('ab', 32))$$, '23505',
                         'the same file again is refused');
select test.expect_error($$insert into public.photos (uploader_id, storage_path, source_hash) values ('30000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a/d3.jpg', 'not-a-hash')$$, '23514',
                         'only a real fingerprint is kept');
select test.check(test.count($$select * from public.photos where source_hash = repeat('ab', 32)$$) = 1, 'and they can see it is already there');
rollback;
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal1"}', true);
insert into public.photos (uploader_id, storage_path, source_hash) values ('30000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a/d1.jpg', repeat('ab', 32));
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","aal":"aal1"}', true);
select test.expect_rows($$insert into public.photos (uploader_id, storage_path, source_hash) values ('30000000-0000-0000-0000-00000000000b', '30000000-0000-0000-0000-00000000000b/d1.jpg', repeat('ab', 32))$$, 1,
                        'another family can upload their own copy');
rollback;
