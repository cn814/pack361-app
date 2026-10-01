-- Leader training, part 2: new courses, BSA member IDs (set_my_member_id) and the
-- my.scouting training import (import_trainings).
-- A = Alex Smith (parent), F = Sam Smith (Alex's co-parent), B = Blair Jones (parent),
-- C = Lee Leader (den leader), D = Morgan Admin (admin), E = signed in but not on the roster.
-- Every block rolls back, and starts by clearing the member IDs and training it relies on.
\set QUIET on
set client_min_messages = notice;

\echo '== Training: new course keys'
begin;
update public.adults set bsa_member_id = null where email like '%@example.com';
delete from public.adult_trainings where adult_id = '30000000-0000-0000-0000-00000000000c';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', true);
select test.expect_rows($$insert into public.adult_trainings (adult_id, course, completed_on, expires_on) values
                          ('30000000-0000-0000-0000-00000000000c', 'cor', '2026-01-05', null),
                          ('30000000-0000-0000-0000-00000000000c', 'iols', '2025-04-12', null),
                          ('30000000-0000-0000-0000-00000000000c', 'wood_badge', '2024-09-20', null),
                          ('30000000-0000-0000-0000-00000000000c', 'cpr_first_aid', '2026-03-01', '2028-03-01'),
                          ('30000000-0000-0000-0000-00000000000c', 'climb_on_safely', '2026-02-01', '2028-02-01'),
                          ('30000000-0000-0000-0000-00000000000c', 'trek_safely', '2026-02-02', '2028-02-02')$$, 6,
                        'the new course keys are accepted');
select test.expect_rows($$insert into public.adult_trainings (adult_id, course, completed_on, expires_on) values
                          ('30000000-0000-0000-0000-00000000000c', 'ypt', '2026-09-01', '2027-09-01'),
                          ('30000000-0000-0000-0000-00000000000c', 'position', '2025-06-01', null),
                          ('30000000-0000-0000-0000-00000000000c', 'hazardous_weather', '2026-08-15', '2028-08-15'),
                          ('30000000-0000-0000-0000-00000000000c', 'baloo', '2024-05-02', null),
                          ('30000000-0000-0000-0000-00000000000c', 'safe_swim', '2026-05-01', '2028-05-01'),
                          ('30000000-0000-0000-0000-00000000000c', 'safety_afloat', '2026-05-01', '2028-05-01')$$, 6,
                        'the existing course keys still work');
select test.expect_error($$insert into public.adult_trainings (adult_id, course, completed_on)
                          values ('30000000-0000-0000-0000-00000000000c', 'scuba', '2026-01-01')$$, '23514',
                         'an unknown course key is rejected');
select test.expect_rows($$update public.adult_trainings set completed_on = '2026-02-10'
                          where adult_id = '30000000-0000-0000-0000-00000000000c' and course = 'iols'$$, 1,
                        'a leader still updates their own training');
select test.expect_rows($$update public.adult_trainings set expires_on = '2030-01-01'
                          where adult_id = '30000000-0000-0000-0000-00000000000a'$$, 0,
                        'a den leader still cannot edit someone else''s training');
select test.expect_error($$insert into public.adult_trainings (adult_id, course, completed_on)
                          values ('30000000-0000-0000-0000-00000000000a', 'iols', '2026-01-01')$$, '42501',
                         'a den leader cannot add training for someone else');
select test.expect_error($$select public.import_trainings('[]'::jsonb, '[]'::jsonb)$$, '42501',
                         'a den leader cannot run the training import');
select test.expect_rows($$update public.adults set bsa_member_id = '1234567' where first_name = 'Alex'$$, 0,
                        'a den leader cannot set someone else''s member ID');
rollback;

\echo '== Member IDs: parent (Alex)'
begin;
update public.adults set bsa_member_id = null where email like '%@example.com';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', true);
select test.check(public.set_my_member_id(' 123456789 ') = '123456789', 'an adult sets their own member ID (trimmed)');
select test.check((select bsa_member_id from public.adults where id = '30000000-0000-0000-0000-00000000000a') = '123456789',
                  'the member ID is saved on their own row');
select test.check((select bsa_member_id from public.adults where id = '30000000-0000-0000-0000-00000000000f') is null,
                  'the co-parent''s member ID is unchanged');
select test.expect_error($$select public.set_my_member_id('12AB')$$, '22023', 'member ID must be digits');
select test.expect_error($$select public.set_my_member_id('1234567890123')$$, '22023', 'member ID is at most 12 digits');
select test.expect_error($$select public.set_my_member_id('123-456')$$, '22023', 'member ID has no dashes');
select test.check((select bsa_member_id from public.adults where id = '30000000-0000-0000-0000-00000000000a') = '123456789',
                  'a rejected value leaves the saved ID alone');
select test.expect_error($$update public.adults set bsa_member_id = '555' where first_name = 'Alex'$$, '42501',
                         'a parent cannot change their member ID directly (only through set_my_member_id)');
select test.expect_rows($$update public.adults set bsa_member_id = '555' where first_name = 'Blair'$$, 0,
                        'a parent cannot set another family''s member ID');
select test.expect_rows($$update public.adults set bsa_member_id = '555' where first_name = 'Lee'$$, 0,
                        'a parent cannot set a leader''s member ID');
select test.expect_error($$insert into public.adult_trainings (adult_id, course, completed_on)
                          values ('30000000-0000-0000-0000-00000000000b', 'cpr_first_aid', '2026-01-01')$$, '42501',
                         'a parent cannot add another adult''s training');
select test.expect_rows($$update public.adult_trainings set completed_on = '2026-02-01'
                          where adult_id <> '30000000-0000-0000-0000-00000000000a'$$, 0,
                        'a parent cannot edit others'' training');
select test.expect_error($$select public.import_trainings(
                            '[{"adult_id":"30000000-0000-0000-0000-00000000000b","course":"ypt","completed_on":"2026-09-01","expires_on":"2027-09-01"}]'::jsonb,
                            '[{"adult_id":"30000000-0000-0000-0000-00000000000b","member_id":"999"}]'::jsonb)$$, '42501',
                         'a parent cannot run the training import');
select test.check((select bsa_member_id from public.adults where id = '30000000-0000-0000-0000-00000000000b') is null,
                  'a parent''s import attempt changed nothing');
select public.set_my_member_id('');
select test.check((select bsa_member_id from public.adults where id = '30000000-0000-0000-0000-00000000000a') is null,
                  'an empty value clears your member ID');
select public.set_my_member_id('123456789');
-- Sam (Alex's co-parent) tries the same ID
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000f"}', true);
select test.expect_error($$select public.set_my_member_id('123456789')$$, '23505',
                         'a member ID already on another adult is refused');
select test.check(public.set_my_member_id('22334455') = '22334455'
                  and (select bsa_member_id from public.adults where id = '30000000-0000-0000-0000-00000000000a') = '123456789',
                  'the co-parent sets their own without touching Alex''s');
rollback;

\echo '== Member IDs: not on the roster, anonymous'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000e"}', true);
select test.expect_error($$select public.set_my_member_id('123')$$, '42501', 'someone not on the roster cannot set a member ID');
select test.expect_error($$select public.import_trainings('[]'::jsonb, '[]'::jsonb)$$, '42501', 'someone not on the roster cannot import');
rollback;
begin;
set local role anon;
select test.expect_error($$select public.set_my_member_id('123')$$, '42501', 'anon cannot call set_my_member_id');
select test.expect_error($$select public.import_trainings('[]'::jsonb, '[]'::jsonb)$$, '42501', 'anon cannot call import_trainings');
select test.expect_error('select * from public.adult_trainings', '42501', 'anon cannot read training');
select test.expect_error('select bsa_member_id from public.adults', '42501', 'anon cannot read member IDs');
rollback;

\echo '== Training import: admin (Morgan)'
begin;
update public.adults set bsa_member_id = null where email like '%@example.com';
delete from public.adult_trainings where adult_id in ('30000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000c');
insert into public.adult_trainings (adult_id, course, completed_on, expires_on)
values ('30000000-0000-0000-0000-00000000000a', 'ypt', '2026-01-10', '2027-01-10');
update public.adults set bsa_member_id = '700000001' where id = '30000000-0000-0000-0000-00000000000a';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d"}', true);
select test.check(public.import_trainings($$[
    {"adult_id":"30000000-0000-0000-0000-00000000000a","course":"ypt","completed_on":"2025-06-01","expires_on":"2026-06-01"},
    {"adult_id":"30000000-0000-0000-0000-00000000000a","course":"hazardous_weather","completed_on":"2026-08-15","expires_on":"2028-08-15"},
    {"adult_id":"30000000-0000-0000-0000-00000000000c","course":"baloo","completed_on":"2023-04-01","expires_on":null},
    {"adult_id":"30000000-0000-0000-0000-00000000000c","course":"baloo","completed_on":"2024-05-02","expires_on":null},
    {"adult_id":"30000000-0000-0000-0000-00000000000c","course":"ypt","completed_on":null,"expires_on":"2027-03-01"},
    {"adult_id":"30000000-0000-0000-0000-00000000000c","course":"iols","completed_on":"2099-01-01","expires_on":null}
  ]$$::jsonb, $$[
    {"adult_id":"30000000-0000-0000-0000-00000000000c","member_id":"700000002"},
    {"adult_id":"30000000-0000-0000-0000-00000000000a","member_id":"700000009"}
  ]$$::jsonb) = '{"trainings": 3, "adults": 2, "member_ids": 1}'::jsonb,
  'import applies new and newer rows only, and fills in a missing member ID');
select test.check((select completed_on from public.adult_trainings
                    where adult_id = '30000000-0000-0000-0000-00000000000a' and course = 'ypt') = '2026-01-10',
                  'an older completion in the report does not replace a newer one');
select test.check((select completed_on from public.adult_trainings
                    where adult_id = '30000000-0000-0000-0000-00000000000c' and course = 'baloo') = '2024-05-02',
                  'the newest of duplicate report rows wins');
select test.check(not exists (select 1 from public.adult_trainings
                               where adult_id = '30000000-0000-0000-0000-00000000000c' and course = 'iols'),
                  'a completion date in the future is skipped');
select test.check((select updated_by from public.adult_trainings
                    where adult_id = '30000000-0000-0000-0000-00000000000a' and course = 'hazardous_weather') = '30000000-0000-0000-0000-00000000000d',
                  'imported rows are stamped with who imported them');
select test.check((select bsa_member_id from public.adults where id = '30000000-0000-0000-0000-00000000000c') = '700000002'
                  and (select bsa_member_id from public.adults where id = '30000000-0000-0000-0000-00000000000a') = '700000001',
                  'import only fills in member IDs that are missing');
select test.check(public.import_trainings($$[
    {"adult_id":"30000000-0000-0000-0000-00000000000a","course":"hazardous_weather","completed_on":"2026-08-15","expires_on":"2028-08-15"}
  ]$$::jsonb, '[]'::jsonb) ->> 'trainings' = '0', 'importing the same report again changes nothing');
select test.check(public.import_trainings($$[
    {"adult_id":"30000000-0000-0000-0000-00000000000c","course":"ypt","completed_on":null,"expires_on":"2028-03-01"},
    {"adult_id":"30000000-0000-0000-0000-00000000000a","course":"ypt","completed_on":"2026-09-01","expires_on":"2027-09-01"}
  ]$$::jsonb, '[]'::jsonb) ->> 'trainings' = '2', 'a later expiration date or a newer completion is a renewal');
select test.check((select expires_on from public.adult_trainings
                    where adult_id = '30000000-0000-0000-0000-00000000000a' and course = 'ypt') = '2027-09-01',
                  'renewal replaces the dates');
select test.check(public.import_trainings('[]'::jsonb, $$[
    {"adult_id":"30000000-0000-0000-0000-00000000000b","member_id":"700000050"},
    {"adult_id":"30000000-0000-0000-0000-00000000000f","member_id":"700000050"},
    {"adult_id":"30000000-0000-0000-0000-00000000000d","member_id":"700000002"}
  ]$$::jsonb) ->> 'member_ids' = '0', 'a member ID is never given to two adults');
select test.check(public.import_trainings('[]'::jsonb, $$[
    {"adult_id":"30000000-0000-0000-0000-00000000000f","member_id":"12AB"}
  ]$$::jsonb) ->> 'member_ids' = '0', 'an invalid member ID from a report is not saved');
select test.expect_error($$select public.import_trainings(
                            (select jsonb_agg(jsonb_build_object('adult_id', '30000000-0000-0000-0000-00000000000c', 'course', 'ypt',
                                                                 'completed_on', '2026-01-01')) from generate_series(1, 2001)),
                            '[]'::jsonb)$$, '22023', 'import is capped at 2000 rows');
select test.expect_error($$select public.import_trainings(
                            '[{"adult_id":"30000000-0000-0000-0000-00000000000c","course":"scuba","completed_on":"2026-01-01"}]'::jsonb, '[]'::jsonb)$$,
                         '23514', 'import rejects an unknown course');
select test.expect_rows($$update public.adults set bsa_member_id = '700000077' where first_name = 'Blair'$$, 1,
                        'an admin edits someone''s member ID in the roster forms');
select test.expect_rows($$update public.adult_trainings set expires_on = '2029-01-01'
                          where adult_id = '30000000-0000-0000-0000-00000000000c' and course = 'ypt'$$, 1,
                        'an admin still edits anyone''s training');
rollback;
