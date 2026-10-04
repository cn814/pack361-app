-- Two-step sign-in: den leaders, pack leadership, the Cubmaster and admins get their extra access
-- only after entering their authenticator code (session "aal2").
\set QUIET on
set client_min_messages = notice;

\echo '== Admin, email code only (aal1)'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","aal":"aal1"}', true);
select test.check(not private.is_admin(), 'an admin without their code is not an admin');
select test.check(not private.is_committee(), 'nor pack leadership');
select test.check(not private.is_leader(), 'nor a leader');
select test.check(not private.can_review_scout('40000000-0000-0000-0000-000000000003'), 'and can''t review a scout''s advancement');
select test.check(not private.leads_den('10000000-0000-0000-0000-000000000001'), 'or run a den''s meetings');
select test.check(test.count('select * from public.scouts') = 0, 'sees no other family''s scouts');
select test.check(test.count('select * from public.adults') = 1, 'sees only their own roster row');
rollback;

\echo '== Admin, no aal claim at all'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d"}', true);
select test.check(not private.is_admin(), 'a session without an assurance level counts as no code');
rollback;

\echo '== Admin with their code (aal2)'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","aal":"aal2"}', true);
select test.check(private.is_admin() and private.is_committee() and private.is_leader(), 'with the code, full admin access');
select test.check(test.count('select * from public.scouts') >= 3, 'sees every scout');
rollback;

\echo '== Den leader, email code only'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal1"}', true);
select test.check(not private.is_leader(), 'a den leader without their code is not a leader');
select test.check(not private.leads_den('10000000-0000-0000-0000-000000000002'), 'and can''t run their own den yet');
select test.check(not exists (select private.my_led_den_ids()), 'no led dens');
select test.check(not exists (select private.led_meeting_ids()), 'no den meetings');
select test.check(not exists (select private.reviewable_scout_ids()), 'no scouts to review');
select test.check(test.count('select * from public.scouts') = 0, 'sees no other family''s scouts');
select test.check(test.count('select * from public.adults') = 1, 'sees only their own roster row');
rollback;

\echo '== Den leader with their code (aal2)'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);
select test.check(private.is_leader(), 'with the code, a leader');
select test.check(private.leads_den('10000000-0000-0000-0000-000000000002'), 'runs their own den');
select test.check(not private.leads_den('10000000-0000-0000-0000-000000000001'), 'but not other dens');
select test.check(exists (select private.my_led_den_ids()), 'has their led den');
rollback;

\echo '== Pack leadership (committee) who also leads a den, email code only'
update public.adults set role = 'committee' where id = '30000000-0000-0000-0000-00000000000c';
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal1"}', true);
select test.check(not private.is_committee(), 'leadership access waits for the code');
select test.check(not private.leads_den('10000000-0000-0000-0000-000000000002'), 'their own den waits for the code too');
select test.check(not private.leads_den('10000000-0000-0000-0000-000000000001'), 'as do other dens');
rollback;
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);
select test.check(private.is_committee() and private.leads_den('10000000-0000-0000-0000-000000000001'), 'with the code, every den');
rollback;
update public.adults set role = 'den_leader' where id = '30000000-0000-0000-0000-00000000000c';

\echo '== Anyone leading a den has at least the den-leader role (so the app asks for the code)'
select test.check(not exists (select 1 from public.adults a join public.den_leaders dl on dl.adult_id = a.id where a.role = 'parent'),
    'no parent-role den leaders after the two-step migration');
