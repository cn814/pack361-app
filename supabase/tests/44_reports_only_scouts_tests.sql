-- Reports (roster, membership) and events only for some scouts.
\set QUIET on
set client_min_messages = notice;

\echo '== Leaving the roster is dated'
begin;
reset role;
update public.scouts set is_active = false where id = '40000000-0000-0000-0000-000000000003';
select test.check((select left_on = (now() at time zone 'America/New_York')::date from public.scouts where id = '40000000-0000-0000-0000-000000000003'),
                  'a scout turned off gets today as the day they left');
update public.scouts set is_active = true where id = '40000000-0000-0000-0000-000000000003';
select test.check((select left_on is null from public.scouts where id = '40000000-0000-0000-0000-000000000003'),
                  'and coming back clears it');
rollback;

\echo '== Roster report'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","aal":"aal2"}', true);
select test.check(test.count('select * from public.report_roster()') > 0, 'an admin opens the roster report');
select test.check((select count(*) from public.report_roster() where person = 'Adult' and email = 'alex.smith@example.com') = 1,
                  'with contact details');
select test.check('roster' = any(public.my_reports()), 'and it is in their reports');
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","aal":"aal1"}', true);
select test.expect_error('select * from public.report_roster()', '42501', 'not before the authenticator code');
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);
select test.expect_error('select * from public.report_roster()', '42501', 'a den leader cannot open the roster report');
select test.expect_error($$select * from public.report_membership('2026-27')$$, '42501', 'or the membership report');
select test.check(cardinality(public.my_reports()) = 0, 'and has no reports listed');
select test.expect_error($$insert into public.report_access (report, adult_id) values ('roster', '30000000-0000-0000-0000-00000000000c')$$, '42501',
                         'and cannot add themselves');
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal1"}', true);
select test.expect_error('select * from public.report_roster()', '42501', 'a parent cannot open it');
rollback;

\echo '== An admin adds a den leader to the membership report'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","aal":"aal2"}', true);
select test.expect_rows($$insert into public.report_access (report, adult_id) values ('membership', '30000000-0000-0000-0000-00000000000c')$$, 1,
                        'an admin adds Lee to the membership report');
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);
select test.check(test.count($$select * from public.report_membership('2026-27')$$) > 0, 'Lee now opens the membership report');
select test.check(public.my_reports() = array['membership'], 'only that one');
select test.expect_error('select * from public.report_roster()', '42501', 'still not the roster');
select test.check(test.count('select * from public.report_access') = 1, 'Lee sees their own access');
rollback;

reset role;
delete from public.report_access;

\echo '== Events only for some scouts'
reset role;
insert into public.events (id, title, category, starts_at, only_scouts) values
 ('44000000-0000-0000-0000-000000000001', 'Rescue workshop', 'Den', '2027-03-06 10:00-05', array['40000000-0000-0000-0000-000000000003']::uuid[]);
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","aal":"aal1"}', true);
select test.check(test.count($$select * from public.events where id = '44000000-0000-0000-0000-000000000001'$$) = 1,
                  'the family of a scout it is for sees it');
rollback;
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal1"}', true);
select test.check(test.count($$select * from public.events where id = '44000000-0000-0000-0000-000000000001'$$) = 0,
                  'another family does not');
select test.check(not private.can_see_event('44000000-0000-0000-0000-000000000001'), 'and cannot open it');
rollback;
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);
select test.check(test.count($$select * from public.events where id = '44000000-0000-0000-0000-000000000001'$$) = 1, 'leaders see it');
rollback;
begin;
reset role;
select test.expect_error($$update public.events set only_scouts = '{}' where id = '44000000-0000-0000-0000-000000000001'$$, '23514',
                         'an empty list is stored as nobody picked (null), not as an empty list');
rollback;
reset role;
delete from public.events where id = '44000000-0000-0000-0000-000000000001';
