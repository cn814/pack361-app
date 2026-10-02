-- Pack documents library: who can see, add, change and delete documents and their files.
-- A = Alex Smith (parent: Sky in Wolf 1, River in Bear 1), F = Sam Smith (Alex's co-parent),
-- B = Blair Jones (parent: Jo in Bear 1), C = Lee Leader (Bear 1 den leader), D = Morgan Admin,
-- E = signed in but not on the roster.
-- Added here: R = Robin (Wolf 1 den leader), Q = Quinn (committee member).
\set QUIET on
set client_min_messages = notice;

insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-000000000091', 'robin.wolf@example.com'),
 ('00000000-0000-0000-0000-000000000092', 'quinn.committee@example.com');
insert into public.adults (id, first_name, last_name, email, role) values
 ('30000000-0000-0000-0000-000000000091', 'Robin', 'Wolf',      'robin.wolf@example.com',      'den_leader'),
 ('30000000-0000-0000-0000-000000000092', 'Quinn', 'Committee', 'quinn.committee@example.com', 'committee');
insert into public.den_leaders (den_id, adult_id) values
 ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000091');

-- d1 everyone, d2 leaders, d3 committee, d4 Wolf den, d5 Bear den, d6 archived (everyone),
-- d7 one of Lee's that committee later made committee-only.
insert into public.documents (id, title, folder, audience, den_id, storage_path, file_name, mime_type, size_bytes, uploaded_by, archived_at, pinned) values
 ('d0000000-0000-0000-0000-000000000001', 'Pack calendar',        'Forms',            'everyone',  null,                                   'docs/30000000-0000-0000-0000-00000000000d/d1.pdf', 'calendar.pdf', 'application/pdf', 1000, '30000000-0000-0000-0000-00000000000d', null, true),
 ('d0000000-0000-0000-0000-000000000002', 'Den leader guide',     'Leader resources', 'leaders',   null,                                   'docs/30000000-0000-0000-0000-00000000000d/d2.pdf', 'guide.pdf',    'application/pdf', 2000, '30000000-0000-0000-0000-00000000000d', null, false),
 ('d0000000-0000-0000-0000-000000000003', 'Budget',               'Budget & finance', 'committee', null,                                   'docs/30000000-0000-0000-0000-00000000000d/d3.xlsx', 'budget.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 3000, '30000000-0000-0000-0000-00000000000d', null, false),
 ('d0000000-0000-0000-0000-000000000004', 'Wolf hike packing list', 'Campouts',       'everyone',  '10000000-0000-0000-0000-000000000001', 'docs/30000000-0000-0000-0000-00000000000d/d4.txt', 'packing.txt', 'text/plain', 400, '30000000-0000-0000-0000-00000000000d', null, false),
 ('d0000000-0000-0000-0000-000000000005', 'Bear den schedule',    'Forms',            'everyone',  '10000000-0000-0000-0000-000000000002', 'docs/30000000-0000-0000-0000-00000000000c/d5.pdf', 'bear.pdf',     'application/pdf', 500, '30000000-0000-0000-0000-00000000000c', null, false),
 ('d0000000-0000-0000-0000-000000000006', 'Old popcorn form',     'Popcorn & fundraising', 'everyone', null,                              'docs/30000000-0000-0000-0000-00000000000d/d6.pdf', 'popcorn.pdf',  'application/pdf', 600, '30000000-0000-0000-0000-00000000000d', now(), false),
 ('d0000000-0000-0000-0000-000000000007', 'Committee notes',      'Meeting minutes',  'committee', null,                                   'docs/30000000-0000-0000-0000-00000000000c/d7.pdf', 'notes.pdf',    'application/pdf', 700, '30000000-0000-0000-0000-00000000000c', null, false);

insert into storage.objects (bucket_id, name, metadata)
select 'pack-docs', storage_path, jsonb_build_object('size', size_bytes, 'mimetype', mime_type) from public.documents;
-- A file of Lee's that no document uses (an upload that was never saved).
insert into storage.objects (bucket_id, name, metadata) values
 ('pack-docs', 'docs/30000000-0000-0000-0000-00000000000c/orphan.pdf', '{"size": 900, "mimetype": "application/pdf"}');

\echo '== Documents: bucket'
select test.check((select file_size_limit from storage.buckets where id = 'pack-docs') = 10485760, 'documents bucket takes files up to 10 MB');
select test.check((select not public from storage.buckets where id = 'pack-docs'), 'documents bucket is private');
select test.check((select allowed_mime_types @> array['application/pdf', 'text/csv', 'image/webp',
                                                       'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
                     from storage.buckets where id = 'pack-docs')
                  and (select cardinality(allowed_mime_types) from storage.buckets where id = 'pack-docs') = 12,
                  'documents bucket takes office files, PDFs, text and images');
select test.check((select not (allowed_mime_types && array['text/html', 'image/svg+xml', 'application/octet-stream'])
                     from storage.buckets where id = 'pack-docs'),
                  'documents bucket refuses web pages, SVGs and unknown files');

\echo '== Documents: anonymous visitor'
begin;
set local role anon;
select test.expect_error('select * from public.documents', '42501', 'anon cannot read documents');
select test.expect_error($$select * from storage.objects where bucket_id = 'pack-docs'$$, '42501', 'anon cannot read document files');
select test.expect_error($$select * from public.document_upload_info('docs/x/y.pdf')$$, '42501', 'anon cannot check uploads');
select test.expect_error('select * from public.storage_usage()', '42501', 'anon cannot see storage use');
rollback;

\echo '== Documents: signed in but not on the roster'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000e","aal":"aal2"}', true);
select test.check(test.count('select * from public.documents') = 0, 'stranger sees no documents');
select test.check(test.count($$select * from storage.objects where bucket_id = 'pack-docs'$$) = 0, 'stranger sees no document files');
select test.expect_error($$insert into public.documents (title, storage_path, file_name, mime_type, size_bytes, uploaded_by)
                          values ('x', 'docs/00000000-0000-0000-0000-00000000000e/x.pdf', 'x.pdf', 'application/pdf', 1, null)$$,
                         '42501', 'stranger cannot add a document');
select test.expect_error($$insert into storage.objects (bucket_id, name) values ('pack-docs', 'docs/00000000-0000-0000-0000-00000000000e/x.pdf')$$,
                         '42501', 'stranger cannot upload a document file');
rollback;

\echo '== Documents: parent (Alex, Wolf and Bear families)'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal2"}', true);
select test.check(test.count('select * from public.documents') = 3
                  and test.count($$select * from public.documents where id in ('d0000000-0000-0000-0000-000000000001',
                                   'd0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000005')$$) = 3,
                  'parent sees pack documents and both their dens'' documents');
select test.check(test.count($$select * from public.documents where audience <> 'everyone'$$) = 0, 'parent sees no leader or committee documents');
select test.check(test.count('select * from public.documents where archived_at is not null') = 0, 'parent does not see archived documents');
select test.check(test.count($$select * from storage.objects where bucket_id = 'pack-docs'$$) = 3, 'parent can read exactly the files of the documents they see');
select test.expect_error($$insert into public.documents (title, storage_path, file_name, mime_type, size_bytes, uploaded_by)
                          values ('Mine', 'docs/30000000-0000-0000-0000-00000000000a/m.pdf', 'm.pdf', 'application/pdf', 1, '30000000-0000-0000-0000-00000000000a')$$,
                         '42501', 'parent cannot add a document');
select test.expect_error($$insert into storage.objects (bucket_id, name) values ('pack-docs', 'docs/30000000-0000-0000-0000-00000000000a/m.pdf')$$,
                         '42501', 'parent cannot upload a document file');
select test.expect_rows($$update public.documents set title = 'Hacked'$$, 0, 'parent cannot edit documents');
select test.expect_rows($$delete from public.documents$$, 0, 'parent cannot delete documents');
select test.expect_rows($$delete from storage.objects where bucket_id = 'pack-docs'$$, 0, 'parent cannot delete document files');
select test.check(test.count($$select * from public.document_upload_info('docs/30000000-0000-0000-0000-00000000000d/d1.pdf')$$) = 0,
                  'parent cannot look up upload details');
select test.check(test.count('select * from public.storage_usage()') = 0, 'parent does not see storage use');
rollback;

\echo '== Documents: co-parent (Sam) and Bear-only parent (Blair)'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000f","aal":"aal2"}', true);
select test.check(test.count('select * from public.documents') = 3, 'co-parent sees the same documents as Alex');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","aal":"aal2"}', true);
select test.check(test.count('select * from public.documents') = 2
                  and test.count($$select * from public.documents where id = 'd0000000-0000-0000-0000-000000000004'$$) = 0,
                  'Bear-only parent does not see a Wolf den document');
select test.check(test.count($$select * from storage.objects where bucket_id = 'pack-docs'
                                and name = 'docs/30000000-0000-0000-0000-00000000000d/d4.txt'$$) = 0,
                  'Bear-only parent cannot read the Wolf den file');
rollback;

\echo '== Documents: Bear den leader (Lee)'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);
select test.check(test.count('select * from public.documents') = 5
                  and test.count($$select * from public.documents where audience = 'committee'$$) = 0,
                  'den leader sees everyone and leader documents, every den and the archive, but not committee ones');
select test.check(test.count($$select * from storage.objects where bucket_id = 'pack-docs' and name not like '%/orphan.pdf'$$) = 5,
                  'den leader reads the files of the documents they see, not committee files');
select test.check(test.count($$select * from storage.objects where name = 'docs/30000000-0000-0000-0000-00000000000c/orphan.pdf'$$) = 1,
                  'den leader sees their own unsaved upload (so they can tidy it up)');

-- uploading files
select test.expect_rows($$insert into storage.objects (bucket_id, name) values ('pack-docs', 'docs/30000000-0000-0000-0000-00000000000c/new.pdf')$$,
                        1, 'den leader uploads into their own folder');
select test.expect_error($$insert into storage.objects (bucket_id, name) values ('pack-docs', 'docs/30000000-0000-0000-0000-00000000000d/new.pdf')$$,
                         '42501', 'den leader cannot upload into someone else''s folder');
select test.expect_error($$insert into storage.objects (bucket_id, name) values ('pack-docs', 'other/30000000-0000-0000-0000-00000000000c/new.pdf')$$,
                         '42501', 'uploads must go under docs/');

-- adding documents
select test.expect_rows($$insert into public.documents (id, title, folder, storage_path, file_name, mime_type, size_bytes, uploaded_by)
                          values ('d0000000-0000-0000-0000-000000000010', 'Uniform inspection sheet', 'Forms',
                                  'docs/30000000-0000-0000-0000-00000000000c/new.pdf', 'inspection.pdf', 'application/pdf', 1234,
                                  '30000000-0000-0000-0000-00000000000c')$$, 1, 'den leader adds a pack-wide document');
select test.expect_rows($$insert into public.documents (title, audience, den_id, storage_path, file_name, mime_type, size_bytes, uploaded_by)
                          values ('Bear leaders only', 'leaders', '10000000-0000-0000-0000-000000000002',
                                  'docs/30000000-0000-0000-0000-00000000000c/bear.pdf', 'bear.pdf', 'application/pdf', 1,
                                  '30000000-0000-0000-0000-00000000000c')$$, 1, 'den leader adds a leaders document for their own den');
select test.expect_error($$insert into public.documents (title, den_id, storage_path, file_name, mime_type, size_bytes, uploaded_by)
                          values ('Wolf', '10000000-0000-0000-0000-000000000001', 'docs/30000000-0000-0000-0000-00000000000c/w.pdf',
                                  'w.pdf', 'application/pdf', 1, '30000000-0000-0000-0000-00000000000c')$$,
                         '42501', 'den leader cannot add a document for another den');
select test.expect_error($$insert into public.documents (title, audience, storage_path, file_name, mime_type, size_bytes, uploaded_by)
                          values ('Secret', 'committee', 'docs/30000000-0000-0000-0000-00000000000c/c.pdf',
                                  'c.pdf', 'application/pdf', 1, '30000000-0000-0000-0000-00000000000c')$$,
                         '42501', 'den leader cannot add a committee-only document');
select test.expect_error($$insert into public.documents (title, storage_path, file_name, mime_type, size_bytes, uploaded_by)
                          values ('As Morgan', 'docs/30000000-0000-0000-0000-00000000000c/m.pdf', 'm.pdf', 'application/pdf', 1,
                                  '30000000-0000-0000-0000-00000000000d')$$,
                         '42501', 'den leader cannot add a document as someone else');
select test.expect_error($$insert into public.documents (title, storage_path, file_name, mime_type, size_bytes, uploaded_by)
                          values ('Their file', 'docs/30000000-0000-0000-0000-00000000000d/zzz.pdf', 'z.pdf', 'application/pdf', 1,
                                  '30000000-0000-0000-0000-00000000000c')$$,
                         '42501', 'den leader cannot point a document at someone else''s folder');
select test.expect_error($$insert into public.documents (title, storage_path, file_name, mime_type, size_bytes, uploaded_by)
                          values ('Web page', 'docs/30000000-0000-0000-0000-00000000000c/p.html', 'p.html', 'text/html', 1,
                                  '30000000-0000-0000-0000-00000000000c')$$,
                         '23514', 'only allowed file types can be listed');
select test.expect_error($$insert into public.documents (title, storage_path, file_name, mime_type, size_bytes, uploaded_by)
                          values ('Huge', 'docs/30000000-0000-0000-0000-00000000000c/h.pdf', 'h.pdf', 'application/pdf', 20000000,
                                  '30000000-0000-0000-0000-00000000000c')$$,
                         '23514', 'documents over 10 MB are refused');
select test.check(test.count($$select * from storage.objects where name = 'docs/30000000-0000-0000-0000-00000000000c/new.pdf'$$) = 1,
                  'den leader reads the file once its document is saved');
select test.check((select size_bytes from public.document_upload_info('docs/30000000-0000-0000-0000-00000000000c/orphan.pdf')) = 900,
                  'den leader checks the real size of their own upload');
select test.check(test.count($$select * from public.document_upload_info('docs/30000000-0000-0000-0000-00000000000d/d1.pdf')$$) = 0,
                  'den leader cannot look up someone else''s upload');

-- editing
select test.expect_rows($$update public.documents set title = 'Bear den schedule (fall)' where id = 'd0000000-0000-0000-0000-000000000005'$$,
                        1, 'den leader edits their own document');
select test.check((select updated_by from public.documents where id = 'd0000000-0000-0000-0000-000000000005') = '30000000-0000-0000-0000-00000000000c',
                  'who changed it is stamped');
select test.expect_rows($$update public.documents set uploaded_by = '30000000-0000-0000-0000-00000000000d', created_at = '2020-01-01'
                          where id = 'd0000000-0000-0000-0000-000000000005'$$, 1, 'update that tries to change who added it');
select test.check((select uploaded_by = '30000000-0000-0000-0000-00000000000c' and created_at > '2026-01-01'
                     from public.documents where id = 'd0000000-0000-0000-0000-000000000005'),
                  'who added a document and when cannot be changed');
select test.expect_error($$update public.documents set den_id = '10000000-0000-0000-0000-000000000001' where id = 'd0000000-0000-0000-0000-000000000005'$$,
                         '42501', 'den leader cannot move their document to another den');
select test.expect_error($$update public.documents set audience = 'committee' where id = 'd0000000-0000-0000-0000-000000000005'$$,
                         '42501', 'den leader cannot make a document committee-only');
select test.expect_error($$update public.documents set storage_path = 'docs/30000000-0000-0000-0000-00000000000d/d1.pdf'
                          where id = 'd0000000-0000-0000-0000-000000000010'$$,
                         '42501', 'a replacement file must be the editor''s own upload');
select test.expect_rows($$update public.documents set archived_at = now() where id = 'd0000000-0000-0000-0000-000000000010'$$,
                        1, 'den leader archives their own document');
select test.expect_rows($$update public.documents set archived_at = null where id = 'd0000000-0000-0000-0000-000000000010'$$,
                        1, 'and puts it back');
select test.expect_rows($$update public.documents set title = 'Mine now' where id = 'd0000000-0000-0000-0000-000000000001'$$,
                        0, 'den leader cannot edit someone else''s document');
select test.expect_rows($$update public.documents set archived_at = now() where id = 'd0000000-0000-0000-0000-000000000002'$$,
                        0, 'den leader cannot archive someone else''s document');

-- deleting
select test.expect_rows($$delete from public.documents where id = 'd0000000-0000-0000-0000-000000000005'$$, 0,
                        'den leader cannot delete a document, even their own');
select test.expect_rows($$delete from storage.objects where name = 'docs/30000000-0000-0000-0000-00000000000c/d5.pdf'$$, 0,
                        'den leader cannot delete a file a document still uses');
select test.expect_rows($$delete from storage.objects where name = 'docs/30000000-0000-0000-0000-00000000000c/d7.pdf'$$, 0,
                        'den leader cannot delete a file used by a document they can''t see');
select test.expect_rows($$delete from storage.objects where name = 'docs/30000000-0000-0000-0000-00000000000d/d1.pdf'$$, 0,
                        'den leader cannot delete someone else''s file');
select test.expect_rows($$delete from storage.objects where name = 'docs/30000000-0000-0000-0000-00000000000c/orphan.pdf'$$, 1,
                        'den leader tidies up their own unused upload');
select test.check(test.count('select * from public.storage_usage()') = 0, 'den leader does not see storage use');
rollback;

\echo '== Documents: Wolf den leader (Robin)'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000091","aal":"aal2"}', true);
select test.expect_rows($$update public.documents set title = 'Robin was here' where id = 'd0000000-0000-0000-0000-000000000005'$$,
                        0, 'one den leader cannot edit another den leader''s document');
select test.check(test.count($$select * from storage.objects where name like '%/orphan.pdf'$$) = 0,
                  'den leaders do not see each other''s unsaved uploads');
select test.expect_rows($$delete from storage.objects where name like '%/orphan.pdf'$$, 0,
                        'or delete them');
select test.expect_rows($$insert into public.documents (title, den_id, storage_path, file_name, mime_type, size_bytes, uploaded_by)
                          values ('Wolf den dues', '10000000-0000-0000-0000-000000000001', 'docs/30000000-0000-0000-0000-000000000091/w.pdf',
                                  'w.pdf', 'application/pdf', 1, '30000000-0000-0000-0000-000000000091')$$,
                        1, 'Wolf den leader adds a Wolf den document');
select test.expect_error($$insert into public.documents (title, den_id, storage_path, file_name, mime_type, size_bytes, uploaded_by)
                          values ('Bear', '10000000-0000-0000-0000-000000000002', 'docs/30000000-0000-0000-0000-000000000091/b.pdf',
                                  'b.pdf', 'application/pdf', 1, '30000000-0000-0000-0000-000000000091')$$,
                         '42501', 'Wolf den leader cannot add a Bear den document');
rollback;

\echo '== Documents: committee member (Quinn)'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000092","aal":"aal2"}', true);
select test.check(test.count('select * from public.documents') = 7, 'committee sees every document');
select test.check(test.count($$select * from storage.objects where bucket_id = 'pack-docs'$$) = 8,
                  'committee reads every document file and unused uploads');
select test.expect_rows($$insert into public.documents (title, audience, den_id, storage_path, file_name, mime_type, size_bytes, uploaded_by)
                          values ('Treasurer report', 'committee', '10000000-0000-0000-0000-000000000001',
                                  'docs/30000000-0000-0000-0000-000000000092/t.pdf', 't.pdf', 'application/pdf', 1,
                                  '30000000-0000-0000-0000-000000000092')$$,
                        1, 'committee adds a committee-only document for any den');
select test.expect_rows($$update public.documents set title = 'Pack calendar 2026-27', pinned = false where id = 'd0000000-0000-0000-0000-000000000001'$$,
                        1, 'committee edits anyone''s document');
select test.expect_rows($$update public.documents set archived_at = now() where id = 'd0000000-0000-0000-0000-000000000005'$$,
                        1, 'committee archives anyone''s document');
select test.expect_rows($$update public.documents set storage_path = 'docs/30000000-0000-0000-0000-000000000092/new.pdf'
                          where id = 'd0000000-0000-0000-0000-000000000005'$$,
                        1, 'committee replaces the file on someone else''s document with their own upload');
select test.check((select uploaded_by from public.documents where id = 'd0000000-0000-0000-0000-000000000005') = '30000000-0000-0000-0000-00000000000c',
                  'replacing the file keeps who added the document');
select test.expect_rows($$delete from public.documents where id = 'd0000000-0000-0000-0000-000000000002'$$, 1,
                        'committee deletes a document');
select test.expect_rows($$delete from storage.objects where name = 'docs/30000000-0000-0000-0000-00000000000d/d2.pdf'$$, 1,
                        'committee deletes its file');
select test.expect_rows($$delete from storage.objects where name = 'docs/30000000-0000-0000-0000-00000000000c/d5.pdf'$$, 1,
                        'committee deletes the old file it replaced on someone else''s document');
select test.expect_rows($$delete from storage.objects where name like '%/orphan.pdf'$$, 1,
                        'committee tidies up a leader''s unsaved upload');
select test.check(test.count('select * from public.storage_usage()') = 0, 'committee members who aren''t admins do not see storage use');
rollback;

\echo '== Documents: admin (Morgan)'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","aal":"aal2"}', true);
select test.check(test.count('select * from public.documents') = 7, 'admin sees every document');
select test.expect_rows($$delete from public.documents where id = 'd0000000-0000-0000-0000-000000000006'$$, 1, 'admin deletes a document');
select test.check((select bytes from public.storage_usage() where bucket_id = 'pack-docs') = 9100,
                  'admin sees document storage use');
select test.check(exists (select 1 from public.storage_usage() where bucket_id = 'pack-photos'),
                  'admin sees photo storage use separately');
rollback;

\echo '== Documents: a former leader loses editing'
update public.adults set role = 'parent' where id = '30000000-0000-0000-0000-00000000000c';
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);
select test.expect_rows($$update public.documents set title = 'Still mine?' where id = 'd0000000-0000-0000-0000-000000000005'$$,
                        0, 'someone who is no longer a leader cannot edit what they added');
select test.expect_error($$insert into storage.objects (bucket_id, name) values ('pack-docs', 'docs/30000000-0000-0000-0000-00000000000c/late.pdf')$$,
                         '42501', 'or upload new files');
rollback;
update public.adults set role = 'den_leader' where id = '30000000-0000-0000-0000-00000000000c';

-- Tidy up so later test files see the original fixtures.
delete from storage.objects where bucket_id = 'pack-docs';
delete from public.documents;
delete from public.den_leaders where adult_id = '30000000-0000-0000-0000-000000000091';
delete from public.adults where id in ('30000000-0000-0000-0000-000000000091', '30000000-0000-0000-0000-000000000092');
delete from auth.users where id in ('00000000-0000-0000-0000-000000000091', '00000000-0000-0000-0000-000000000092');
