-- Den meetings in one step (record_den_meeting) and per-scout RSVPs for den meetings.
-- Fixtures from 01_rls_tests.sql: Bear den ...0002 (leader Lee, scouts River Smith + Jo Jones),
-- Wolf den ...0001 (Sky Smith). River already has Bear Strong 2 entered in Scoutbook.
\set QUIET on

\echo '== Den meetings: who can record'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","aal":"aal2"}', true);   -- Blair, a parent
select test.expect_error($$select public.record_den_meeting('10000000-0000-0000-0000-000000000002', null,
                           (now() at time zone 'America/New_York')::date, '{40000000-0000-0000-0000-000000000003}', '[]')$$,
                         '42501', 'a parent cannot record a den meeting');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);   -- Lee, Bear den leader
select test.expect_error($$select public.record_den_meeting('10000000-0000-0000-0000-000000000001', null,
                           (now() at time zone 'America/New_York')::date, '{40000000-0000-0000-0000-000000000001}', '[]')$$,
                         '42501', 'a den leader cannot record another den''s meeting');
select test.expect_error($$select public.record_den_meeting('10000000-0000-0000-0000-000000000002', null,
                           (now() at time zone 'America/New_York')::date + 1, '{}', '[]')$$,
                         '22023', 'cannot record a meeting in the future');
select test.expect_error($$select public.record_den_meeting('10000000-0000-0000-0000-000000000002', null,
                           (now() at time zone 'America/New_York')::date, '{}', '[{"adventure":"Not Real","requirements":["1"]}]')$$,
                         '22023', 'unknown adventures are refused');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","aal":"aal2"}', true);   -- Morgan, admin
select test.check((public.record_den_meeting('10000000-0000-0000-0000-000000000001', null,
                    (now() at time zone 'America/New_York')::date - 2, '{40000000-0000-0000-0000-000000000001}', '[]') ->> 'present')::int = 1,
                  'committee and up can record any den (attendance only, no adventure)');
select test.check(test.count($$select * from public.den_meeting_attendance a join public.den_meetings m on m.id = a.meeting_id
                                where m.den_id = '10000000-0000-0000-0000-000000000001'$$) = 1, 'attendance-only meeting saved');
rollback;

\echo '== Den meetings: record, record again, edit'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);
create temporary table r on commit drop as
select public.record_den_meeting('10000000-0000-0000-0000-000000000002', null, (now() at time zone 'America/New_York')::date - 1,
       '{40000000-0000-0000-0000-000000000002,40000000-0000-0000-0000-000000000003,40000000-0000-0000-0000-000000000001}',
       '[{"adventure":"Bear Strong","requirements":["1","2","3","99"]}]') as res;
select test.check((select (res ->> 'present')::int from r) = 2, 'only scouts in this den are marked here');
select test.check((select (res ->> 'added')::int from r) = 5, 'records 2 scouts x 3 requirements, minus one already entered');
select test.check((select (res ->> 'already_done')::int from r) = 1, 'skips what Scoutbook already has');
select test.check((select m.title from public.den_meetings m where m.id = (select (res ->> 'meeting_id')::uuid from r)) = 'Bear Strong',
                  'no planning needed: the meeting is made on save');
select test.check((select m.adventure from public.den_meetings m where m.id = (select (res ->> 'meeting_id')::uuid from r)) = 'Bear Strong'
                  and (select m.requirements from public.den_meetings m where m.id = (select (res ->> 'meeting_id')::uuid from r)) = '{1,2,3}',
                  'adventure and requirements still mirror the first adventure');
select test.check(test.count($$select * from public.advancement_submissions where status = 'approved'
                                and meeting_id = (select (res ->> 'meeting_id')::uuid from r)$$) = 5, 'all approved, on the Scoutbook list');

-- Double tap: same answers again, with or without the meeting id
select test.check((public.record_den_meeting('10000000-0000-0000-0000-000000000002', null, (now() at time zone 'America/New_York')::date - 1,
       '{40000000-0000-0000-0000-000000000002,40000000-0000-0000-0000-000000000003}',
       '[{"adventure":"Bear Strong","requirements":["1","2","3"]}]') ->> 'added')::int = 0, 'recording twice adds nothing');
select test.check(test.count($$select * from public.den_meetings where den_id = '10000000-0000-0000-0000-000000000002'
                                and meets_on = (now() at time zone 'America/New_York')::date - 1$$) = 1, 'recording twice makes one meeting');
select test.check(test.count($$select * from public.advancement_submissions where meeting_id = (select (res ->> 'meeting_id')::uuid from r)$$) = 5,
                  'recording twice doubles nothing');
select test.expect_error($$insert into public.advancement_submissions (scout_id, submitted_by, rank, adventure, requirement, completed_on, status, meeting_id)
                           select '40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-00000000000c', 'bear', 'Bear Strong', '1',
                                  current_date, 'approved', (res ->> 'meeting_id')::uuid from r$$,
                         '23505', 'the database refuses a second copy from the same meeting');

-- The advancement chair enters River's requirement 1 in Scoutbook
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","aal":"aal2"}', true);
select test.expect_rows($$update public.advancement_submissions set status = 'recorded'
                          where scout_id = '40000000-0000-0000-0000-000000000002' and requirement = '1'
                            and meeting_id = (select (res ->> 'meeting_id')::uuid from r)$$, 1, 'chair marks one entered in Scoutbook');

-- The leader fixes it: River left early, and they never got to requirement 3; Jo skipped requirement 2
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);
create temporary table r2 on commit drop as
select public.record_den_meeting('10000000-0000-0000-0000-000000000002', (select (res ->> 'meeting_id')::uuid from r),
       (now() at time zone 'America/New_York')::date - 1, '{40000000-0000-0000-0000-000000000003}',
       '[{"adventure":"Bear Strong","requirements":["1","2"],"skip":{"40000000-0000-0000-0000-000000000003":["2"]}},
         {"adventure":"Bear Habitat","requirements":["1"]},
         {"adventure":"Fellowship","requirements":["1"]}]') as res;
select test.check((select (res ->> 'removed')::int from r2) = 3, 'edit removes River 3, Jo 2 and Jo 3');
select test.check((select (res ->> 'added')::int from r2) = 1, 'edit adds the new adventure, skipping one Scoutbook already shows done');
select test.check((select jsonb_array_length(res -> 'entered') from r2) = 1
                  and (select res -> 'entered' -> 0 ->> 'scout' from r2) = 'River S.', 'tells the leader what is already in Scoutbook');
select test.check(exists (select 1 from public.advancement_submissions where scout_id = '40000000-0000-0000-0000-000000000002'
                           and adventure = 'Bear Strong' and requirement = '1' and status = 'recorded'), 'entered rows are never removed here');
select test.check(exists (select 1 from public.advancement_submissions where meeting_id = '80000000-0000-0000-0000-000000000001'),
                  'other meetings'' rows are untouched');
select test.check(exists (select 1 from public.advancement_submissions where scout_id = '40000000-0000-0000-0000-000000000002'
                           and adventure = 'Bear Strong' and requirement = '2' and meeting_id is null), 'rows from outside the meeting are untouched');
select test.check(test.count($$select * from public.den_meeting_attendance where meeting_id = (select (res ->> 'meeting_id')::uuid from r)$$) = 1,
                  'attendance updated');
select test.check((select jsonb_array_length(work) from public.den_meetings where id = (select (res ->> 'meeting_id')::uuid from r)) = 3,
                  'one meeting can cover several adventures');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","aal":"aal2"}', true);
select test.expect_rows($$update public.den_meetings set work = '[]'$$, 0, 'families cannot change a meeting');
rollback;

\echo '== Den meeting RSVPs'
begin;
insert into public.den_meetings (id, den_id, meets_on, title) values
 ('80000000-0000-0000-0000-000000000014', '10000000-0000-0000-0000-000000000002', (now() at time zone 'America/New_York')::date + 7, 'Next week'),
 ('80000000-0000-0000-0000-000000000015', '10000000-0000-0000-0000-000000000002', (now() at time zone 'America/New_York')::date - 7, 'Last week');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal2"}', true);   -- Alex Smith
select public.set_den_meeting_rsvp('80000000-0000-0000-0000-000000000014', '40000000-0000-0000-0000-000000000002', true);
select test.check(test.count('select * from public.den_meeting_rsvps where going') = 1, 'a family says their scout is going');
select public.set_den_meeting_rsvp('80000000-0000-0000-0000-000000000014', '40000000-0000-0000-0000-000000000002', false);
select test.check(test.count('select * from public.den_meeting_rsvps') = 1 and test.count('select * from public.den_meeting_rsvps where going') = 0,
                  'changing the answer keeps one row');
select public.set_den_meeting_rsvp('80000000-0000-0000-0000-000000000014', '40000000-0000-0000-0000-000000000002', true);
select test.expect_error($$select public.set_den_meeting_rsvp('80000000-0000-0000-0000-000000000014', '40000000-0000-0000-0000-000000000003', true)$$,
                         '42501', 'a family cannot answer for another family''s scout');
select test.expect_error($$select public.set_den_meeting_rsvp('80000000-0000-0000-0000-000000000014', '40000000-0000-0000-0000-000000000001', true)$$,
                         'P0002', 'a scout outside the den cannot RSVP');
select test.expect_error($$select public.set_den_meeting_rsvp('80000000-0000-0000-0000-000000000015', '40000000-0000-0000-0000-000000000002', true)$$,
                         '22023', 'no RSVPs after the meeting');
select test.expect_error($$insert into public.den_meeting_rsvps (meeting_id, scout_id, going)
                           values ('80000000-0000-0000-0000-000000000014', '40000000-0000-0000-0000-000000000003', true)$$,
                         '42501', 'answers only go through set_den_meeting_rsvp');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","aal":"aal2"}', true);   -- Blair Jones
select test.check(test.count('select * from public.den_meeting_rsvps') = 0, 'other families cannot see the answer');
select public.set_den_meeting_rsvp('80000000-0000-0000-0000-000000000014', '40000000-0000-0000-0000-000000000003', false);
select test.check(test.count('select * from public.den_meeting_rsvps') = 1, 'a family sees only their own scouts');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);   -- Lee
select test.check(test.count('select * from public.den_meeting_rsvps') = 2, 'den leaders see their den''s answers');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000e","aal":"aal2"}', true);   -- stranger
select test.check(test.count('select * from public.den_meeting_rsvps') = 0, 'strangers see nothing');
select test.expect_error($$select public.set_den_meeting_rsvp('80000000-0000-0000-0000-000000000014', '40000000-0000-0000-0000-000000000003', true)$$,
                         '42501', 'strangers cannot answer');
rollback;

begin;
set local role anon;
select test.expect_error('select * from public.den_meeting_rsvps', '42501', 'anon cannot read den meeting RSVPs');
select test.expect_error($$select public.record_den_meeting(null, null, null, null, null)$$, '42501', 'anon cannot record meetings');
rollback;
