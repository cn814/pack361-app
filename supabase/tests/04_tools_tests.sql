-- Roster admin, den meetings, volunteer roster, training, photo vault.
-- Run after 03_features_tests.sql (reuses the fixtures from 01).
\set QUIET on
set client_min_messages = notice;

-- A = Alex Smith (parent: Sky in Wolf 1, River in Bear 1), B = Blair Jones (parent: Jo in Bear 1),
-- C = Lee Leader (Bear 1 den leader), D = Morgan Admin, E = stranger.
insert into public.photos (id, uploader_id, storage_path, status)
values ('70000000-0000-0000-0000-000000000009', '30000000-0000-0000-0000-00000000000d',
        '30000000-0000-0000-0000-00000000000d/campfire.jpg', 'approved');
insert into public.volunteer_signups (slot_id, adult_id)
select '60000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a'
where not exists (select 1 from public.volunteer_signups where slot_id = '60000000-0000-0000-0000-000000000001');

\echo '== Tools: parent (Alex)'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', true);
select test.expect_error($$insert into public.adults (first_name, last_name, email) values ('Fake', 'Person', 'fake@example.com')$$,
                         '42501', 'parent cannot add adults');
select test.expect_error($$update public.adults set welcomed_at = now() where first_name = 'Alex'$$,
                         '42501', 'parent cannot change admin-only columns on own row');
select test.expect_rows($$update public.scouts set photo_permission = 'yes' where first_name = 'Sky'$$, 1,
                        'parent answers the photo question for own scout');
select test.check((select photo_permission_at from public.scouts where first_name = 'Sky') is not null,
                  'photo answer is time-stamped');
select test.expect_error($$update public.scouts set den_id = null where first_name = 'Sky'$$,
                         '42501', 'parent cannot move own scout to another den');
select test.expect_rows($$update public.scouts set photo_permission = 'yes' where first_name = 'Jo'$$, 0,
                        'parent cannot answer for another family''s scout');
select test.check(test.count('select * from public.roster_sign_ins()') = 0, 'parent cannot see sign-in times');
select test.expect_error($$insert into public.den_meetings (den_id, meets_on, title) values ('10000000-0000-0000-0000-000000000002', '2026-10-08', 'Fake')$$,
                         '42501', 'parent cannot plan den meetings');
select test.expect_error($$insert into public.advancement_submissions (scout_id, submitted_by, adventure, requirement, completed_on, status)
                          values ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a', 'Council Fire', '1', '2026-10-01', 'approved')$$,
                         '42501', 'parent cannot self-approve a requirement');
select test.check((select count(*) from public.volunteer_roster('50000000-0000-0000-0000-000000000001')) = 1,
                  'members see who volunteered');
select test.check((select name from public.volunteer_roster('50000000-0000-0000-0000-000000000001') limit 1) = 'Alex S.',
                  'volunteer names are first name + last initial');
select test.expect_rows($$insert into public.adult_trainings (adult_id, course, completed_on, expires_on)
                          values ('30000000-0000-0000-0000-00000000000a', 'ypt', '2026-01-10', '2028-01-10')$$, 1,
                        'adult records own training');
select test.check((select updated_by from public.adult_trainings where adult_id = '30000000-0000-0000-0000-00000000000a') = '30000000-0000-0000-0000-00000000000a',
                  'training update is stamped');
select test.expect_error($$insert into public.adult_trainings (adult_id, course, expires_on)
                          values ('30000000-0000-0000-0000-00000000000b', 'ypt', '2030-01-01')$$,
                         '42501', 'parent cannot enter someone else''s training');
select test.expect_error($$update public.adult_trainings set reminded_days = 0$$, '42501',
                         'reminder bookkeeping is not editable');
select test.expect_error($$insert into public.photos (uploader_id, storage_path, status)
                          values ('30000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a/x.jpg', 'approved')$$,
                         '42501', 'parent uploads still need a leader''s approval');
select test.expect_rows($$insert into public.photos (uploader_id, storage_path, thumb_path)
                          values ('30000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a/y.jpg', '30000000-0000-0000-0000-00000000000a/y_t.jpg')$$, 1,
                        'parent uploads a photo with a thumbnail');
select public.flag_photo('70000000-0000-0000-0000-000000000009', 'My son is in this one and we said no photos');
select test.check((select status from public.photos where id = '70000000-0000-0000-0000-000000000009') is null,
                  'a flagged photo disappears for the family right away');
select test.check(test.count('select * from public.photo_flags') = 1, 'requester sees their own request');
select test.expect_rows($$update public.photo_flags set resolved_at = now()$$, 0, 'parent cannot resolve requests');
commit;

\echo '== Tools: other parent (Blair)'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', true);
select test.check(test.count('select * from public.adult_trainings') = 0, 'training records are private to leaders');
select test.check(test.count('select * from public.photo_flags') = 0, 'other parents cannot see removal requests');
select test.check(test.count($$select * from public.photos where id = '70000000-0000-0000-0000-000000000009'$$) = 0,
                  'flagged photo is hidden from other families');
select test.expect_error($$select public.flag_photo('70000000-0000-0000-0000-000000000009', 'x')$$, 'P0002',
                         'cannot flag a photo you cannot see');
rollback;

\echo '== Tools: den leader (Lee, Bear 1)'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', true);
select test.expect_rows($$insert into public.den_meetings (id, den_id, meets_on, title, rank, adventure, requirements)
                          values ('80000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '2026-10-08',
                                  'Bear Claws', 'bear', 'Bear Claws', '{1,2}')$$, 1, 'den leader plans a meeting for own den');
select test.expect_error($$insert into public.den_meetings (den_id, meets_on, title) values ('10000000-0000-0000-0000-000000000001', '2026-10-08', 'Not mine')$$,
                         '42501', 'den leader cannot plan another den''s meeting');
select test.expect_rows($$insert into public.den_meeting_attendance (meeting_id, scout_id) values
                          ('80000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000003'),
                          ('80000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002')$$, 2,
                        'den leader takes attendance');
select test.expect_error($$insert into public.den_meeting_attendance (meeting_id, scout_id) values
                          ('80000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001')$$,
                         '42501', 'cannot mark a scout from another den present');
select test.expect_rows($$insert into public.advancement_submissions (scout_id, submitted_by, rank, adventure, requirement, completed_on, status, meeting_id)
                          values ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-00000000000c', 'bear', 'Bear Claws', '1', '2026-10-08', 'approved',
                                  '80000000-0000-0000-0000-000000000001')$$, 1, 'den leader reports a meeting requirement as approved');
select test.check((select reviewed_by from public.advancement_submissions where meeting_id = '80000000-0000-0000-0000-000000000001') = '30000000-0000-0000-0000-00000000000c',
                  'the leader is stamped as approver');
select test.expect_error($$insert into public.advancement_submissions (scout_id, submitted_by, adventure, requirement, completed_on, status)
                          values ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000c', 'Council Fire', '1', '2026-10-01', 'approved')$$,
                         '42501', 'den leader cannot approve for a scout outside the den');
select test.check(test.count('select * from public.adult_trainings') = 1, 'leaders see training records');
select test.expect_rows($$update public.adult_trainings set expires_on = '2030-01-01'$$, 0, 'den leader cannot edit others'' training');
select test.expect_rows($$insert into public.photos (uploader_id, storage_path, status)
                          values ('30000000-0000-0000-0000-00000000000c', '30000000-0000-0000-0000-00000000000c/den.jpg', 'approved')$$, 1,
                        'leader photos go straight to the album');
select test.check((select reviewed_by from public.photos where storage_path like '%/den.jpg') = '30000000-0000-0000-0000-00000000000c',
                  'leader upload is stamped as reviewed');
select test.check(test.count('select * from public.photo_flags') = 1, 'leaders see removal requests');
select test.expect_rows($$update public.photo_flags set resolved_at = now()$$, 1, 'leader resolves a removal request');
commit;

\echo '== Tools: families see their den''s meetings'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', true);
select test.check(test.count('select * from public.den_meetings') = 1, 'family sees their den''s meeting');
select test.check(test.count('select * from public.den_meeting_attendance') = 1, 'family sees only their own scout''s attendance');
select test.expect_rows($$delete from public.den_meetings$$, 0, 'family cannot delete meetings');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000e"}', true);
select test.check(test.count('select * from public.den_meetings') = 0, 'stranger sees no meetings');
rollback;

\echo '== Tools: admin'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d"}', true);
select test.expect_rows($$insert into public.adults (first_name, last_name, email, family_id)
                          values ('Pat', 'Jones', 'PAT.JONES@example.com', '20000000-0000-0000-0000-000000000002')$$, 1, 'admin adds an adult');
select test.check((select email from public.adults where first_name = 'Pat') = 'pat.jones@example.com', 'new email is lowercased');
select test.expect_rows($$update public.adults set role = 'den_leader', position_title = 'Assistant Den Leader' where first_name = 'Blair'$$, 1,
                        'admin changes a role');
select test.expect_rows($$update public.adults set welcomed_at = now() where first_name = 'Pat'$$, 1, 'admin marks a welcome email sent');
select test.expect_rows($$update public.scouts set den_id = '10000000-0000-0000-0000-000000000001' where first_name = 'Jo'$$, 1, 'admin moves a scout');
select test.check(test.count('select * from public.roster_sign_ins()') >= 4, 'admin sees who has signed in');
select test.expect_rows($$update public.adult_trainings set expires_on = '2028-06-01' where course = 'ypt'$$, 1, 'admin updates someone''s training');
select test.check((select reminded_days from public.adult_trainings where course = 'ypt') is null, 'new expiry resets reminders');
rollback;

\echo '== Tools: anonymous'
begin;
set local role anon;
select test.expect_error('select * from public.den_meetings', '42501', 'anon cannot read den meetings');
select test.expect_error('select * from public.adult_trainings', '42501', 'anon cannot read training');
select test.expect_error($$select public.flag_photo('70000000-0000-0000-0000-000000000009', 'x')$$, '42501', 'anon cannot flag photos');
select test.expect_error('select * from public.roster_sign_ins()', '42501', 'anon cannot call roster_sign_ins');
rollback;

\echo '== TOOLS TESTS PASSED'
