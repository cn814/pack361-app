-- Advancement import reports what changed (new, changed, removed). Reuses 02's fixtures
-- (test.rows; River 111, Sky 222, Jo 333; Morgan is admin).
\set QUIET on
set client_min_messages = notice;

\echo '== Advancement import: what changed'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","aal":"aal2"}', true);
-- Start from the full file.
select public.import_scout_advancement('base.csv', (select j from test.rows));
-- Same file again: nothing new or changed.
create temp table same on commit drop as select * from public.import_scout_advancement('same.csv', (select j from test.rows));
select test.check((select (changes->>'new')::int = 0 and (changes->>'changed')::int = 0 and (changes->>'removed')::int = 0 from same),
                  'importing the same file again reports no changes');
-- Sky's adventure is now approved, Jo has a new requirement, and River's 2a is gone.
create temp table next on commit drop as
select * from public.import_scout_advancement('next.csv', (
  select jsonb_agg(case when e->>'member_id' = '222' then jsonb_set(e, '{approved}', 'true') else e end)
         || $$[{"member_id":"333","name":"Jo Jones","kind":"requirement","rank":"bear","adventure":"Fellowship","item":"1","version":"2024","completed_on":"2026-10-01","approved":false,"awarded":false,"source_type":"Fellowship Adventure Requirements","source_name":"1"}]$$::jsonb
    from jsonb_array_elements((select j from test.rows)) e
   where e->>'item' <> '2a'));
select test.check((select (changes->>'new')::int from next) = 1, 'a record not in the app before counts as new');
select test.check((select (changes->>'changed')::int from next) = 1, 'a record that became approved counts as changed');
select test.check((select (changes->>'removed')::int from next) = 1, 'a record no longer in the file counts as removed');
select test.check((select changes->'new_by_kind'->>'requirement' from next) = '1', 'new records are counted by kind');
rollback;

\echo '== ADVANCEMENT CHANGES TESTS PASSED'
