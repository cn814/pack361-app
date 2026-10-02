-- Two-step sign-in: pack leadership, the Cubmaster and admins get their extra access only after
-- entering their authenticator code (session "aal2"). Den leaders are unchanged.
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
select test.check(private.is_leader(), 'den leaders don''t need the second step');
select test.check(private.leads_den('10000000-0000-0000-0000-000000000002'), 'and still run their own den');
select test.check(not private.leads_den('10000000-0000-0000-0000-000000000001'), 'but not other dens');
rollback;

\echo '== Pack leadership (committee) who also leads a den, email code only'
update public.adults set role = 'committee' where id = '30000000-0000-0000-0000-00000000000c';
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal1"}', true);
select test.check(not private.is_committee(), 'leadership access waits for the code');
select test.check(private.leads_den('10000000-0000-0000-0000-000000000002'), 'their own den still works (as its den leader)');
select test.check(not private.leads_den('10000000-0000-0000-0000-000000000001'), 'other dens wait for the code');
rollback;
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);
select test.check(private.is_committee() and private.leads_den('10000000-0000-0000-0000-000000000001'), 'with the code, every den');
rollback;
update public.adults set role = 'den_leader' where id = '30000000-0000-0000-0000-00000000000c';
