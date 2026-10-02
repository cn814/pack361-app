-- Advancement import / catalog tests. Run after 01_rls_tests.sql (reuses its fixtures):
-- Smith family: Sky (Wolf den), River (Bear den). Jones: Jo (Bear den).
-- Lee leads the Bear den. Morgan is admin. Submission 8..01 (River, Bear Strong 2) is approved by Lee.
\set QUIET on
set client_min_messages = notice;

update public.scouts set bsa_member_id = '111' where first_name = 'River';
update public.scouts set bsa_member_id = '222' where first_name = 'Sky';
update public.scouts set bsa_member_id = '333' where first_name = 'Jo';

create table test.rows (j jsonb);
insert into test.rows values ($$[
 {"member_id":"111","name":"River Smith","kind":"adventure","rank":"bear","adventure":"Bear Strong","item":"Bear Strong","version":"2024","completed_on":"2026-09-25","approved":true,"awarded":false,"source_type":"Adventure","source_name":"Bear Strong Adventure"},
 {"member_id":"111","name":"River Smith","kind":"requirement","rank":"bear","adventure":"Bear Strong","item":"2a","version":"2024","completed_on":"2026-09-20","approved":true,"awarded":false,"source_type":"Bear Strong Adventure Requirements","source_name":"2a"},
 {"member_id":"111","name":"River Smith","kind":"rank","rank":"wolf","adventure":null,"item":"Wolf Rank","version":"2024","completed_on":"2026-05-01","approved":true,"awarded":true,"awarded_on":"2026-05-15","source_type":"Rank","source_name":"Wolf Rank"},
 {"member_id":"222","name":"Sky Smith","kind":"adventure","rank":"wolf","adventure":"Council Fire","item":"Council Fire","version":"2024","completed_on":"2026-09-01","approved":false,"awarded":false,"source_type":"Adventure","source_name":"Council Fire Adventure"},
 {"member_id":"333","name":"Jo Jones","kind":"adventure","rank":"bear","adventure":"Fellowship","item":"Fellowship","version":"2024","completed_on":"2026-09-01","approved":true,"awarded":false,"source_type":"Adventure","source_name":"Fellowship Adventure"},
 {"member_id":"999","name":"Not Registered","kind":"adventure","rank":"bear","adventure":"Fellowship","item":"Fellowship","version":"2024","completed_on":"2026-09-01","approved":true,"awarded":false,"source_type":"Adventure","source_name":"Fellowship Adventure"}
]$$);
grant select on test.rows to authenticated;

\echo '== Advancement: anonymous'
begin;
set local role anon;
select test.expect_error('select * from public.adventures', '42501', 'anon cannot read the adventure catalog');
select test.expect_error('select * from public.scout_advancement', '42501', 'anon cannot read advancement');
select test.expect_error($$select public.import_scout_advancement('x.csv', '[]')$$, '42501', 'anon cannot call the import');
rollback;

\echo '== Advancement: stranger'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000e","aal":"aal2"}', true);
select test.check(test.count('select * from public.adventures') = 0, 'stranger sees no catalog');
rollback;

\echo '== Advancement: parent (Alex)'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal2"}', true);
select test.check(test.count('select * from public.adventures') = 148, 'members read the 148-adventure catalog');
select test.check(test.count($$select * from public.adventures where rank = 'bear' and required$$) = 6, 'Bear has 6 required adventures');
select test.expect_error($$select public.import_scout_advancement('x.csv', (select j from test.rows))$$, '42501', 'parent cannot import');
select test.expect_error($$insert into public.scout_advancement (scout_id, kind, item, source_type, source_name)
                          values ('40000000-0000-0000-0000-000000000001', 'rank', 'Arrow of Light Rank', 'Rank', 'x')$$,
                         '42501', 'parent cannot write advancement records directly');
select test.expect_error($$update public.advancement_submissions set reviewed_by = '30000000-0000-0000-0000-00000000000a'$$,
                         '42501', 'nobody can forge the reviewer column');
select test.expect_error($$insert into public.adventures (rank, name, required, req_count, sort_order) values ('bear', 'Fake', true, 1, 99)$$,
                         '42501', 'parent cannot edit the catalog');
rollback;

\echo '== Advancement: den leader (Lee) cannot import'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);
select test.expect_error($$select public.import_scout_advancement('x.csv', (select j from test.rows))$$, '42501', 'den leader cannot import');
rollback;

\echo '== Advancement: admin (Morgan) imports'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","aal":"aal2"}', true);
create temp table res on commit drop as select * from public.import_scout_advancement('Pack0361_Advancement.csv', (select j from test.rows));
select test.check((select row_count from res) = 5, 'import saves rows for roster scouts only');
select test.check((select scout_count from res) = 3, 'import touches 3 roster scouts');
select test.check((select jsonb_array_length(unmatched) from res) = 1
                  and (select unmatched->0->>'member_id' from res) = '999', 'unregistered member ID is reported');
select test.check((select status from public.advancement_submissions where id = '80000000-0000-0000-0000-000000000001') = 'recorded',
                  'approved submission found in Scoutbook is marked recorded');
select test.check((select reviewed_by from public.advancement_submissions where id = '80000000-0000-0000-0000-000000000001') = '30000000-0000-0000-0000-00000000000c',
                  'recording keeps the den leader as approver');
select test.check((select recorded_by from public.advancement_submissions where id = '80000000-0000-0000-0000-000000000001') = '30000000-0000-0000-0000-00000000000d',
                  'recorder is stamped');
select test.check((select status from public.advancement_submissions where id = '80000000-0000-0000-0000-000000000002') = 'submitted',
                  'unapproved submission is left alone');
-- re-import replaces instead of duplicating
select public.import_scout_advancement('again.csv', (select j from test.rows) - 0);
select test.check(test.count('select * from public.scout_advancement') = 4, 're-import replaces the scout''s rows');
commit;

\echo '== Advancement: who sees what'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal2"}', true);
select test.check(test.count('select * from public.scout_advancement') = 3, 'parent sees both own scouts'' records only');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","aal":"aal2"}', true);
select test.check(test.count('select * from public.scout_advancement') = 1, 'other parent sees only their own scout');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);
select test.check(test.count('select * from public.scout_advancement') = 3, 'Bear den leader sees Bear den scouts only');
select test.check(test.count('select * from public.advancement_imports') = 2, 'leaders see the import log');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal2"}', true);
select test.check(test.count('select * from public.advancement_imports') = 0, 'parents do not see the import log');
rollback;

\echo '== ADVANCEMENT TESTS PASSED'
