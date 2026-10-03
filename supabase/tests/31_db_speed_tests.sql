-- Database speed-up and fixes (20261011000000_db_speed_and_fixes.sql): same access rules with the
-- faster policies, plus the small fixes that came with them.
-- A = Alex Smith (family 1), B = Blair Jones (family 2), C = Lee Leader (den leader of den 2, no
-- family), D = Morgan Admin, E = stranger (not on the roster), F = Sam Smith (Alex's spouse).
\set QUIET on
set client_min_messages = notice;

insert into public.events (id, title, category, starts_at, rsvp_enabled, leaders_only) values
 ('31310000-0000-0000-0000-000000000001', 'Pack Picnic', 'Pack', now() + interval '10 days', true, false),
 ('31310000-0000-0000-0000-000000000002', 'Leader Planning', 'Committee', now() + interval '10 days', true, true);
insert into public.volunteer_slots (id, event_id, role_title, capacity) values
 ('31320000-0000-0000-0000-000000000001', '31310000-0000-0000-0000-000000000001', 'Grill', 2),
 ('31320000-0000-0000-0000-000000000002', '31310000-0000-0000-0000-000000000002', 'Snacks', 2);
insert into public.volunteer_signups (slot_id, adult_id) values
 ('31320000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000c'),
 ('31320000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-00000000000c');
insert into public.event_rsvps (event_id, family_id, adult_id, status, scouts, adults) values
 ('31310000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a', 'yes', 2, 1),
 ('31310000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-00000000000b', 'no', 0, 0),
 ('31310000-0000-0000-0000-000000000001', null, '30000000-0000-0000-0000-00000000000c', 'yes', 0, 1);

-- ---------------------------------------------------------------------------
\echo '== DB speed: helpers and grants'
select test.check(not has_function_privilege('anon', 'private.going_to_event(uuid)', 'execute'),
                  'signed-out visitors cannot call going_to_event()');
select test.check(has_function_privilege('authenticated', 'private.going_to_event(uuid)', 'execute'),
                  'signed-in members still can (the Signal policy uses it)');
select test.check(not has_function_privilege('anon', 'private.my_scout_ids()', 'execute')
                  and not has_function_privilege('anon', 'private.my_led_den_ids()', 'execute')
                  and not has_function_privilege('anon', 'private.my_family_adult_ids()', 'execute'),
                  'new id-list helpers are not open to signed-out visitors');
select test.check(has_function_privilege('authenticated', 'private.reviewable_scout_ids()', 'execute')
                  and has_function_privilege('authenticated', 'private.led_meeting_ids()', 'execute')
                  and has_function_privilege('authenticated', 'private.my_den_ids()', 'execute'),
                  'and are callable by signed-in members (policies need them)');
select test.check(not exists (
                    select 1 from pg_policies, lateral (select coalesce(qual, '') || ' ' || coalesce(with_check, '') as x) e
                     where regexp_count(e.x, 'private[.](is_member|is_leader|is_admin|is_committee|my_family_id|current_adult_id|dues_campaign_id)[(][)]')
                           <> regexp_count(e.x, 'SELECT private[.](is_member|is_leader|is_admin|is_committee|my_family_id|current_adult_id|dues_campaign_id)[(][)]')
                        or regexp_count(e.x, 'auth[.]uid[(][)]') <> regexp_count(e.x, 'SELECT auth[.]uid[(][)]')),
                  'policies call the no-argument helpers once per query');
select test.check(not exists (select 1 from pg_policies
                               where coalesce(qual, '') || coalesce(with_check, '')
                                     ~ 'private[.](is_my_scout|can_review_scout|leads_den|family_in_den|adult_in_my_family|can_see_poll|owns_charge)[(]'),
                  'no policy calls a per-row helper any more');
select test.check((select count(*) from pg_indexes where schemaname = 'public' and indexname in
                   ('event_rsvps_family_idx', 'event_rsvps_adult_idx', 'announcements_created_idx', 'den_meetings_meets_on_idx',
                    'events_den_idx', 'polls_den_idx', 'feedback_adult_idx', 'finance_budget_category_idx',
                    'scout_advancement_import_idx', 'join_requests_family_idx')) = 10, 'new indexes are in place');

-- ---------------------------------------------------------------------------
\echo '== DB speed: same rows as before for parents and leaders'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal2"}', true);
select test.check(test.count($$select * from public.event_rsvps where event_id = '31310000-0000-0000-0000-000000000001'$$) = 1,
                  'a parent sees only their own family''s RSVP');
select test.check(test.count($$select * from public.event_rsvps where family_id = '20000000-0000-0000-0000-000000000002'$$) = 0,
                  'not another family''s');
select test.check(test.count('select * from public.scouts') = 2
                  and test.count($$select * from public.scouts where family_id <> '20000000-0000-0000-0000-000000000001'$$) = 0,
                  'a parent sees only their own scouts');
select test.check(test.count($$select * from public.adults where family_id is distinct from '20000000-0000-0000-0000-000000000001'$$) = 0
                  and test.count('select * from public.adults') >= 2,
                  'a parent sees their own family''s adults and no one else''s');
select test.check(test.count($$select * from public.attendance_summary('2000-01-01', '2100-01-01')$$) = 2,
                  'attendance summary covers only their own scouts');
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000f","aal":"aal1"}', true);
select test.check(test.count($$select * from public.event_rsvps where event_id = '31310000-0000-0000-0000-000000000001'$$) = 1,
                  'the spouse sees the family RSVP too');
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);
select test.check(test.count($$select * from public.event_rsvps where event_id = '31310000-0000-0000-0000-000000000001'$$) = 3,
                  'a leader sees every RSVP');
reset role;
create temp table _all_scouts as select count(*) as n from public.scouts;
grant select on _all_scouts to authenticated;
set local role authenticated;
select test.check(test.count('select * from public.scouts') = (select n from _all_scouts), 'a leader sees every scout');
select test.check(test.count($$select * from public.attendance_summary('2000-01-01', '2100-01-01')$$) = (select n from _all_scouts),
                  'and gets a summary row for each');
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000e","aal":"aal2"}', true);
select test.check(test.count('select * from public.event_rsvps') = 0, 'someone not on the roster sees no RSVPs');
rollback;

-- ---------------------------------------------------------------------------
\echo '== DB speed: polls'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);
select test.expect_rows($$insert into public.polls (question, options, den_id, created_by)
                          values ('Pizza or tacos?', '{Pizza,Tacos}', '10000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-00000000000c')
                          returning id$$, 1,
                        'a leader can start a den poll and get it back (insert ... returning)');
select test.expect_error($$insert into public.polls (question, options, den_id, created_by)
                           values ('Wolves?', '{a,b}', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000c')$$,
                         '42501', 'but not for a den they do not lead');
rollback;

-- ---------------------------------------------------------------------------
\echo '== DB speed: to-do dismissals'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);
select test.expect_rows($$insert into public.todo_dismissals (key, hidden_until) values ('training-import', now() + interval '7 days')$$, 1,
                        'a leader can hide the training-import reminder');
select test.expect_rows($$insert into public.todo_dismissals (key) values ('job-31320000-0000-0000-0000-000000000001')$$, 1,
                        'job keys still work');
select test.expect_error($$insert into public.todo_dismissals (key) values ('training-import-x')$$, '23514', 'look-alike keys are refused');
select test.expect_error($$insert into public.todo_dismissals (key) values ('xtraining-import')$$, '23514', 'with anything in front, too');
select test.expect_error($$insert into public.todo_dismissals (key) values ('dues')$$, '23514', 'and money due still cannot be hidden');
rollback;

-- ---------------------------------------------------------------------------
\echo '== DB speed: editing announcements follows the posting rules'
insert into public.announcements (id, author_id, title, body, den_id) values
 ('31330000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000c', 'Bear den news', 'x', '10000000-0000-0000-0000-000000000002');

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);
select test.expect_rows($$update public.announcements set title = 'Bear den news (updated)' where id = '31330000-0000-0000-0000-000000000001'$$, 1,
                        'the author can still edit their den post');
select test.expect_error($$update public.announcements set den_id = '10000000-0000-0000-0000-000000000001' where id = '31330000-0000-0000-0000-000000000001'$$,
                         '42501', 'but cannot move it to a den they do not lead');
select test.expect_rows($$update public.announcements set den_id = null where id = '31330000-0000-0000-0000-000000000001'$$, 1,
                        'can make it pack-wide, as they could post it pack-wide');
select test.expect_error($$update public.announcements set author_id = '30000000-0000-0000-0000-00000000000d' where id = '31330000-0000-0000-0000-000000000001'$$,
                         '42501', 'cannot hand it to someone else');
rollback;

begin;
insert into public.announcements (id, author_id, title, body, den_id) values
 ('31330000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-00000000000c', 'Pack news', 'x', null);
update public.adults set role = 'parent' where id = '30000000-0000-0000-0000-00000000000c';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);
select test.expect_error($$update public.announcements set title = 'still mine' where id = '31330000-0000-0000-0000-000000000002'$$,
                         '42501', 'an author who is no longer a leader cannot edit their pack-wide post');
select test.expect_rows($$update public.announcements set title = 'still mine' where id = '31330000-0000-0000-0000-000000000001'$$, 0,
                        'and their den post is out of reach (no family in that den)');
select test.expect_rows($$delete from public.announcements where id = '31330000-0000-0000-0000-000000000002'$$, 1,
                        'but they can still delete a post they can see');
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","aal":"aal2"}', true);
select test.expect_rows($$update public.announcements set den_id = '10000000-0000-0000-0000-000000000001' where id = '31330000-0000-0000-0000-000000000001'$$, 1,
                        'an admin can move any post to any den');
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal2"}', true);
select test.expect_rows($$update public.announcements set den_id = null where id = '31330000-0000-0000-0000-000000000001'$$, 0,
                        'a parent cannot edit a leader''s post');
rollback;
delete from public.announcements where id = '31330000-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------------------
\echo '== DB speed: saving a device for alerts'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal2"}', true);
select public.register_push_subscription('https://fcm.googleapis.com/fcm/send/shared-tablet', 'key-a', 'auth-a', 'Tablet');
select test.check(test.count($$select * from public.push_subscriptions where endpoint like '%/shared-tablet'$$) = 1, 'a parent saves this device for alerts');
select public.register_push_subscription('https://fcm.googleapis.com/fcm/send/shared-tablet', 'key-a2', 'auth-a2', 'Tablet');
select test.check((select p256dh from public.push_subscriptions where endpoint like '%/shared-tablet') = 'key-a2' and test.count($$select * from public.push_subscriptions where endpoint like '%/shared-tablet'$$) = 1,
                  're-subscribing updates the same row');
select test.expect_error($$select public.register_push_subscription('http://evil.example/x', 'k', 'a', null)$$, '22023',
                         'only https push endpoints');
select test.expect_error($$select public.register_push_subscription('https://fcm.googleapis.com/fcm/send/x', '', 'a', null)$$, '22023',
                         'keys are required');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","aal":"aal2"}', true);
select public.register_push_subscription('https://fcm.googleapis.com/fcm/send/shared-tablet', 'key-a2', 'auth-a2', 'Tablet');
select test.check(test.count($$select * from public.push_subscriptions where endpoint like '%/shared-tablet'$$) = 1, 'signing in as someone else moves the device to them');
select test.check((select adult_id from public.push_subscriptions where endpoint like '%/shared-tablet') = '30000000-0000-0000-0000-00000000000b', 'now saved for the new person');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal2"}', true);
select test.check(test.count($$select * from public.push_subscriptions where endpoint like '%/shared-tablet'$$) = 0, 'and no longer for the first');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000e","aal":"aal2"}', true);
select test.expect_error($$select public.register_push_subscription('https://fcm.googleapis.com/fcm/send/shared-tablet', 'k', 'a', null)$$,
                         '42501', 'someone not on the roster cannot take a device');
rollback;

begin;
set local role anon;
select test.expect_error($$select public.register_push_subscription('https://fcm.googleapis.com/fcm/send/x', 'k', 'a', null)$$, '42501',
                         'signed-out visitors cannot save a device');
rollback;

-- ---------------------------------------------------------------------------
\echo '== DB speed: volunteer roster respects leaders-only events'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal2"}', true);
select test.check(test.count($$select * from public.volunteer_roster('31310000-0000-0000-0000-000000000001')$$) = 1,
                  'a parent sees who signed up for a pack event');
select test.check(test.count($$select * from public.volunteer_roster('31310000-0000-0000-0000-000000000002')$$) = 0,
                  'but not for a leaders-only event');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);
select test.check(test.count($$select * from public.volunteer_roster('31310000-0000-0000-0000-000000000002')$$) = 1,
                  'leaders still see the leaders-only roster');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000e","aal":"aal2"}', true);
select test.check(test.count($$select * from public.volunteer_roster('31310000-0000-0000-0000-000000000001')$$) = 0,
                  'someone not on the roster sees nobody');
rollback;

-- ---------------------------------------------------------------------------
-- Clean up so later files start from the shared fixtures.
delete from public.events where id in ('31310000-0000-0000-0000-000000000001', '31310000-0000-0000-0000-000000000002');

\echo '== DB SPEED TESTS PASSED'
