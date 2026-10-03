-- The weekly Scoutbook job runs the advancement and training imports with the server's key.
\set QUIET on
set client_min_messages = notice;

\echo '== Weekly Scoutbook job (server key)'
grant select on test.rows to service_role;
grant usage on schema test to service_role;
begin;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
create temp table w on commit drop as select * from public.import_scout_advancement('Scoutbook (weekly)', (select j from test.rows));
select test.check((select row_count from w) = 5, 'the server can import advancement');
select test.check((select imported_by from w) is null, 'with no person recorded as the importer');
select test.check((public.import_trainings($$[
    {"adult_id":"30000000-0000-0000-0000-00000000000b","course":"ypt","completed_on":"2026-09-01","expires_on":"2027-09-01"}
  ]$$::jsonb, '[]'::jsonb) ->> 'trainings')::int >= 0, 'the server can import training');
rollback;

\echo '== Only the server key, not a signed-in member claiming to be it'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal2","role":"authenticated"}', true);
select test.expect_error($$select public.import_scout_advancement('x.csv', (select j from test.rows))$$, '42501', 'a parent still cannot import advancement');
select test.expect_error($$select public.import_trainings('[]'::jsonb, '[]'::jsonb)$$, '42501', 'nor training');
rollback;

\echo '== WEEKLY SCOUTBOOK TESTS PASSED'
