-- Attendance at pack events and campouts (record_event_attendance), camping nights and the
-- per-scout totals (attendance_summary).
-- A = Alex Smith (parent), B = Blair Jones (parent), C = Lee Leader (Bear den leader),
-- D = Morgan Admin, E = signed in but not on the roster.
-- Scouts added here: Pat Smith (Wolf), Kit Jones (Bear), Ash Jones (Bear, no longer active).
\set QUIET on
set client_min_messages = notice;

insert into public.scouts (id, family_id, den_id, first_name, last_name, is_active) values
 ('4a770000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Pat', 'Smith', true),
 ('4a770000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Kit', 'Jones', true),
 ('4a770000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Ash', 'Jones', false);

insert into public.events (id, title, category, starts_at, ends_at, all_day) values
 -- a pack meeting last week
 ('5a770000-0000-0000-0000-000000000001', 'Pack meeting', 'Pack Meeting', '2025-09-18 19:00-04', '2025-09-18 20:30-04', false),
 -- a Friday to Sunday campout: 2 nights
 ('5a770000-0000-0000-0000-000000000002', 'Fall campout', 'Campout', '2025-10-10 18:00-04', '2025-10-12 11:00-04', false),
 -- next week
 ('5a770000-0000-0000-0000-000000000003', 'Next pack meeting', 'Pack Meeting', now() + interval '7 days', null, false),
 -- later today (Eastern)
 ('5a770000-0000-0000-0000-000000000004', 'Tonight', 'Pack',
  ((now() at time zone 'America/New_York')::date + time '23:30') at time zone 'America/New_York', null, false),
 -- an all-day Monday to Friday day camp: dates say 4 nights
 ('5a770000-0000-0000-0000-000000000005', 'Day camp', 'Council', '2026-07-06 00:00-04', '2026-07-10 00:00-04', true),
 -- a campout with no end time: 0 until a leader says otherwise
 ('5a770000-0000-0000-0000-000000000006', 'Spring campout', 'Campout', '2026-04-17 18:00-04', null, false),
 -- last season's summer campout (2024-25): 1 night
 ('5a770000-0000-0000-0000-000000000007', 'Summer campout', 'Campout', '2025-06-14 10:00-04', '2025-06-15 10:00-04', false);

\echo '== Event attendance: camping nights'
select test.check((select private.event_nights(e) from public.events e where id = '5a770000-0000-0000-0000-000000000002') = 2,
                  'a Friday to Sunday campout counts 2 nights');
select test.check((select private.event_nights(e) from public.events e where id = '5a770000-0000-0000-0000-000000000001') = 0,
                  'a pack meeting counts 0 nights');
select test.check((select private.event_nights(e) from public.events e where id = '5a770000-0000-0000-0000-000000000005') = 4,
                  'a multi-day all-day event counts its Eastern days');
select test.check((select private.event_nights(e) from public.events e where id = '5a770000-0000-0000-0000-000000000006') = 0,
                  'a campout with no end counts 0');
-- A campout starting 11 pm Saturday Eastern (03:00 UTC Sunday) and ending Sunday morning: 1 night, not 0
insert into public.events (id, title, category, starts_at, ends_at)
values ('5a770000-0000-0000-0000-000000000008', 'Late start', 'Campout', '2025-11-08 23:00-05', '2025-11-09 09:00-05');
select test.check((select private.event_nights(e) from public.events e where id = '5a770000-0000-0000-0000-000000000008') = 1,
                  'nights use Eastern dates, not UTC');
delete from public.events where id = '5a770000-0000-0000-0000-000000000008';
select test.expect_error($$update public.events set camping_nights = 15 where id = '5a770000-0000-0000-0000-000000000002'$$,
                         '23514', 'camping nights stay between 0 and 14');

\echo '== Event attendance: who can record'
begin;
set local role anon;
select test.expect_error($$select public.record_event_attendance('5a770000-0000-0000-0000-000000000001', '{4a770000-0000-0000-0000-000000000001}')$$,
                         '42501', 'anon cannot take attendance');
select test.expect_error('select * from public.event_attendance', '42501', 'anon cannot read attendance');
select test.expect_error($$select * from public.attendance_summary('2025-07-01', '2026-06-30')$$, '42501', 'anon cannot read totals');
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000e"}', true);   -- stranger
select test.expect_error($$select public.record_event_attendance('5a770000-0000-0000-0000-000000000001', '{4a770000-0000-0000-0000-000000000001}')$$,
                         '42501', 'a stranger cannot take attendance');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', true);   -- Alex, parent
select test.expect_error($$select public.record_event_attendance('5a770000-0000-0000-0000-000000000001', '{4a770000-0000-0000-0000-000000000001}')$$,
                         '42501', 'a parent cannot take attendance');
select test.expect_error($$insert into public.event_attendance (event_id, scout_id)
                           values ('5a770000-0000-0000-0000-000000000001', '4a770000-0000-0000-0000-000000000001')$$,
                         '42501', 'a parent cannot write attendance directly');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', true);   -- Lee, den leader
select test.expect_error($$insert into public.event_attendance (event_id, scout_id)
                           values ('5a770000-0000-0000-0000-000000000001', '4a770000-0000-0000-0000-000000000001')$$,
                         '42501', 'leaders cannot write attendance directly either');
select test.expect_error($$select public.record_event_attendance('5a770000-0000-0000-0000-000000000003', '{4a770000-0000-0000-0000-000000000001}')$$,
                         '22023', 'an event next week cannot take attendance yet');
select test.expect_error($$select public.record_event_attendance('5a770000-0000-0000-0000-0000000000ff', '{4a770000-0000-0000-0000-000000000001}')$$,
                         'P0002', 'an unknown event is refused');
select test.check(public.record_event_attendance('5a770000-0000-0000-0000-000000000004', '{4a770000-0000-0000-0000-000000000002}') = 1,
                  'an event later today can take attendance');
rollback;

\echo '== Event attendance: record and replace'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', true);   -- Lee, den leader
select test.check(public.record_event_attendance('5a770000-0000-0000-0000-000000000002',
                    '{4a770000-0000-0000-0000-000000000001,4a770000-0000-0000-0000-000000000002,4a770000-0000-0000-0000-000000000003}') = 2,
                  'a den leader can record a campout; a scout who left the pack is skipped');
select test.check(test.count($$select * from public.event_attendance where event_id = '5a770000-0000-0000-0000-000000000002'$$) = 2,
                  'two scouts on the list');
select test.check((select recorded_by from public.event_attendance
                    where event_id = '5a770000-0000-0000-0000-000000000002' and scout_id = '4a770000-0000-0000-0000-000000000001')
                  = '30000000-0000-0000-0000-00000000000c', 'remembers who took attendance');
select test.check((select attendance_taken_at is not null from public.events where id = '5a770000-0000-0000-0000-000000000002'),
                  'the event shows attendance was taken');
select test.check(public.record_event_attendance('5a770000-0000-0000-0000-000000000002',
                    '{4a770000-0000-0000-0000-000000000001,4a770000-0000-0000-0000-000000000002}') = 2
                  and test.count($$select * from public.event_attendance where event_id = '5a770000-0000-0000-0000-000000000002'$$) = 2,
                  'saving the same list twice changes nothing');
select test.check(public.record_event_attendance('5a770000-0000-0000-0000-000000000002', '{4a770000-0000-0000-0000-000000000002}') = 1,
                  'saving again replaces the list');
select test.check(test.count($$select * from public.event_attendance where event_id = '5a770000-0000-0000-0000-000000000002'
                                and scout_id = '4a770000-0000-0000-0000-000000000001'$$) = 0, 'a scout taken off the list is removed');
select test.check(public.record_event_attendance('5a770000-0000-0000-0000-000000000002', null) = 0
                  and test.count($$select * from public.event_attendance where event_id = '5a770000-0000-0000-0000-000000000002'$$) = 0,
                  'an empty list clears it (nobody came)');
rollback;

-- Saved for the rest of the file, by Morgan (admin)
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d"}', true);
select public.record_event_attendance('5a770000-0000-0000-0000-000000000001',
       '{4a770000-0000-0000-0000-000000000001,4a770000-0000-0000-0000-000000000002}');
select public.record_event_attendance('5a770000-0000-0000-0000-000000000002',
       '{4a770000-0000-0000-0000-000000000001,4a770000-0000-0000-0000-000000000002}');
select public.record_event_attendance('5a770000-0000-0000-0000-000000000005', '{4a770000-0000-0000-0000-000000000002}');
select public.record_event_attendance('5a770000-0000-0000-0000-000000000007', '{4a770000-0000-0000-0000-000000000002}');
commit;
-- Ash came to the pack meeting before leaving the pack; Kit came to two Bear den meetings of three.
insert into public.event_attendance (event_id, scout_id) values
 ('5a770000-0000-0000-0000-000000000001', '4a770000-0000-0000-0000-000000000003');
insert into public.den_meetings (id, den_id, meets_on, title, recorded_at) values
 ('6a770000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '2025-09-04', 'Bear meeting 1', now()),
 ('6a770000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '2025-09-11', 'Bear meeting 2', now()),
 ('6a770000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', '2025-09-25', 'Bear meeting 3', now()),
 ('6a770000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000002', '2025-10-02', 'Planned, never held', null);
insert into public.den_meeting_attendance (meeting_id, scout_id) values
 ('6a770000-0000-0000-0000-000000000001', '4a770000-0000-0000-0000-000000000002'),
 ('6a770000-0000-0000-0000-000000000002', '4a770000-0000-0000-0000-000000000002');

\echo '== Event attendance: who sees what'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000e"}', true);   -- stranger
select test.check(test.count('select * from public.event_attendance') = 0, 'a stranger sees no attendance');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', true);   -- Alex (Pat's family)
select test.check(test.count($$select * from public.event_attendance where scout_id::text like '4a77%'$$) = 2
                  and test.count($$select * from public.event_attendance where scout_id <> '4a770000-0000-0000-0000-000000000001'
                                    and scout_id::text like '4a77%'$$) = 0,
                  'a parent sees only their own scouts'' attendance');
select test.check(test.count($$select * from public.attendance_summary('2025-07-01', '2026-06-30') where scout_id::text like '4a77%'$$) = 1,
                  'a parent''s totals cover only their own scouts');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', true);   -- Blair (Kit and Ash)
select test.check(test.count($$select * from public.event_attendance where scout_id::text like '4a77%'$$) = 5,
                  'the other family sees their two scouts'' attendance');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', true);   -- Lee, den leader
select test.check(test.count($$select * from public.event_attendance where scout_id::text like '4a77%'$$) = 7,
                  'leaders see everyone''s attendance');
rollback;

\echo '== Event attendance: totals per scout'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', true);   -- Blair
create temporary table t on commit drop as
select * from public.attendance_summary('2025-07-01', '2026-06-30', '4a770000-0000-0000-0000-000000000002');
select test.check((select den_meetings from t) = 2 and (select den_meetings_held from t) = 3,
                  'Kit: 2 of 3 recorded Bear meetings (a planned one that never happened is not counted)');
select test.check((select events from t) = 2, 'Kit: pack meeting and fall campout this season');
select test.check((select nights from t) = 2, 'Kit: 2 camping nights this season (the day camp is next season)');
select test.check((select nights_all from t) = 7, 'Kit: 7 nights in all (2 + 4 day camp + 1 last summer)');
select test.check((select nights from public.attendance_summary('2024-07-01', '2025-06-30', '4a770000-0000-0000-0000-000000000002')) = 1,
                  'Kit: 1 night last season');
select test.check((select den_meetings_held from public.attendance_summary('2025-07-01', '2026-06-30', '4a770000-0000-0000-0000-000000000003')) = 3
                  and (select den_meetings from public.attendance_summary('2025-07-01', '2026-06-30', '4a770000-0000-0000-0000-000000000003')) = 0,
                  'a scout with no den meetings is compared with their den');
rollback;

-- A leader fixes the camping nights: the day camp was not overnight
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', true);   -- Lee, den leader
select test.expect_rows($$update public.events set camping_nights = 0 where id = '5a770000-0000-0000-0000-000000000005'$$, 1,
                        'a leader can set the camping nights');
select test.check((select nights_all from public.attendance_summary('2025-07-01', '2026-06-30', '4a770000-0000-0000-0000-000000000002')) = 3,
                  'the leader''s number replaces the dates');
select test.expect_rows($$update public.events set camping_nights = 3 where id = '5a770000-0000-0000-0000-000000000006'$$, 1,
                        'a campout with no end gets its nights from a leader');
select test.check((select private.event_nights(e) from public.events e where id = '5a770000-0000-0000-0000-000000000006') = 3,
                  'override counts even with no end date');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', true);   -- Alex, parent
select test.expect_rows($$update public.events set camping_nights = 9 where id = '5a770000-0000-0000-0000-000000000002'$$, 0,
                        'a parent cannot change camping nights');
rollback;

-- Clean up so later files start from the shared fixtures.
delete from public.den_meetings where id::text like '6a77%';
delete from public.events where id::text like '5a77%';
delete from public.scouts where id::text like '4a77%';
