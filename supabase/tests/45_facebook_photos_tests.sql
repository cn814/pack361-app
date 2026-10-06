-- Photos on the pack's public Facebook page: the family's yes, who's in a photo, who may see it.
\set QUIET on
set client_min_messages = notice;

reset role;
insert into public.photos (id, uploader_id, storage_path, status) values
 ('45000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000c', '30000000-0000-0000-0000-00000000000c/fb1.jpg', 'approved'),
 ('45000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-00000000000c', '30000000-0000-0000-0000-00000000000c/fb2.jpg', 'pending_review');
update public.scouts set social_ok = null, photo_permission = null;

\echo '== Families answer for their own scouts'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","aal":"aal1"}', true);
select test.expect_rows($$update public.scouts set social_ok = true where id = '40000000-0000-0000-0000-000000000003'$$, 1,
                        'a family says yes for their scout');
select test.check((select social_ok_at is not null from public.scouts where id = '40000000-0000-0000-0000-000000000003'), 'and when is kept');
select test.expect_rows($$update public.scouts set social_ok = true where id = '40000000-0000-0000-0000-000000000001'$$, 0,
                        'not for another family''s scout');
select test.expect_error($$update public.scouts set social_ok = true, first_name = 'Joe' where id = '40000000-0000-0000-0000-000000000003'$$, '42501',
                         'and cannot change anything else with it');
select test.check(not public.social_access(), 'a family has no Facebook access');
select test.check(test.count('select * from public.social_scouts()') = 0, 'and sees nobody''s answers');
select test.check(test.count('select * from public.photo_social_status()') = 0, 'or photo status');
select test.expect_error($$select public.set_photo_people('45000000-0000-0000-0000-000000000001', array['40000000-0000-0000-0000-000000000003']::uuid[])$$,
                         '42501', 'and cannot mark who is in a photo');
update public.scouts set photo_permission = 'no' where id = '40000000-0000-0000-0000-000000000003';
select test.check((select social_ok = false from public.scouts where id = '40000000-0000-0000-0000-000000000003'),
                  'opting out of pack photos turns Facebook off too');
rollback;

reset role;
update public.scouts set social_ok = true where id = '40000000-0000-0000-0000-000000000003';
update public.scouts set social_ok = false where id = '40000000-0000-0000-0000-000000000002';

\echo '== Leaders mark who is in a photo'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);
select test.check(public.social_access(), 'a den leader may post');
select test.check(test.count('select * from public.social_scouts()') = (select count(*) from public.scouts where is_active), 'and sees every scout''s answer');
select test.check((select social_ok and answered from public.social_scouts() where scout_id = '40000000-0000-0000-0000-000000000003'), 'Jo: yes');
select test.check((select not social_ok and answered from public.social_scouts() where scout_id = '40000000-0000-0000-0000-000000000002'), 'River: no');
select test.check((select not social_ok and not answered from public.social_scouts() where scout_id = '40000000-0000-0000-0000-000000000001'), 'Sky: not answered');
select test.check((select name from public.social_scouts() where scout_id = '40000000-0000-0000-0000-000000000003') = 'Jo J.', 'first name and last initial only');
select test.check((select not checked from public.photo_social_status(array['45000000-0000-0000-0000-000000000001']::uuid[])), 'a new photo is not checked');
select public.set_photo_people('45000000-0000-0000-0000-000000000001', array['40000000-0000-0000-0000-000000000003']::uuid[]);
select test.check((select checked and people = 1 and not_ok = 0 from public.photo_social_status(array['45000000-0000-0000-0000-000000000001']::uuid[])),
                  'only Jo in it: OK for Facebook');
select public.set_photo_people('45000000-0000-0000-0000-000000000001', array['40000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001']::uuid[]);
select test.check((select people = 3 and not_ok = 2 and not_ok_names = 'River S., Sky S.' from public.photo_social_status(array['45000000-0000-0000-0000-000000000001']::uuid[])),
                  'with River and Sky: not OK, and it says who');
select public.set_photo_people('45000000-0000-0000-0000-000000000001', '{}');
select test.check((select checked and people = 0 and not_ok = 0 from public.photo_social_status(array['45000000-0000-0000-0000-000000000001']::uuid[])),
                  'no scout''s face: OK');
select test.expect_error($$insert into public.photo_people (photo_id, scout_id) values ('45000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001')$$, '42501',
                         'not written directly');
commit;

\echo '== A family changing their answer changes the photo'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);
select public.set_photo_people('45000000-0000-0000-0000-000000000001', array['40000000-0000-0000-0000-000000000003']::uuid[]);
commit;
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","aal":"aal1"}', true);
update public.scouts set social_ok = false where id = '40000000-0000-0000-0000-000000000003';
commit;
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);
select test.check((select not_ok = 1 from public.photo_social_status(array['45000000-0000-0000-0000-000000000001']::uuid[])),
                  'Jo''s family said no: the photo is not OK any more');
rollback;

\echo '== A pack admin adds the social media coordinator'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","aal":"aal2"}', true);
select test.expect_rows($$insert into public.report_access (report, adult_id) values ('social', '30000000-0000-0000-0000-00000000000a')$$, 1,
                        'an admin adds a parent for Facebook photos');
commit;
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal1"}', true);
select test.check(public.social_access(), 'the coordinator may post, without the authenticator code');
select test.check(test.count('select * from public.social_scouts()') > 3, 'sees the answers');
select test.check(test.count($$select * from public.photo_social_status() where photo_id = '45000000-0000-0000-0000-000000000001'$$) = 1
              and test.count($$select * from public.photo_social_status() where photo_id = '45000000-0000-0000-0000-000000000002'$$) = 0,
                  'and approved photos only');
select test.check(test.count('select * from public.photo_people') = 1, 'sees who is in them');
select public.set_photo_people('45000000-0000-0000-0000-000000000001', '{}');
select test.check((select people_checked_by = '30000000-0000-0000-0000-00000000000a' from public.photos where id = '45000000-0000-0000-0000-000000000001'),
                  'marks who is in a photo, and it says who checked');
select test.expect_error('select * from public.report_roster()', '42501', 'but no other report');
select test.check(cardinality(public.my_reports()) = 0, 'and no reports listed');
rollback;

reset role;
delete from public.report_access;
delete from public.photos where id in ('45000000-0000-0000-0000-000000000001', '45000000-0000-0000-0000-000000000002');
update public.scouts set social_ok = null, photo_permission = null;
