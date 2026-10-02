-- Pack leadership (e.g. the Committee Chair) can run the my.scouting training import, and each
-- import records when it ran (for the monthly reminder).
\set QUIET on
set client_min_messages = notice;

\echo '== Training import: pack leadership'
update public.adults set role = 'committee' where id = '30000000-0000-0000-0000-00000000000c';
delete from public.pack_settings where key = 'training_last_import';
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);
select test.check((public.import_trainings($$[
    {"adult_id":"30000000-0000-0000-0000-00000000000b","course":"hazardous_weather","completed_on":"2026-09-01","expires_on":"2028-09-01"}
  ]$$::jsonb, '[]'::jsonb) ->> 'trainings')::int = 1, 'pack leadership can import training for other adults');
select test.check(exists (select 1 from public.pack_settings where key = 'training_last_import'), 'the import records when it ran');
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal1"}', true);
select test.expect_error($$select public.import_trainings('[]'::jsonb, '[]'::jsonb)$$, '42501',
                         'not before entering their two-step code');
rollback;
update public.adults set role = 'den_leader' where id = '30000000-0000-0000-0000-00000000000c';

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal2"}', true);
select test.expect_error($$select public.import_trainings('[]'::jsonb, '[]'::jsonb)$$, '42501', 'a parent cannot import training');
select test.expect_rows($$update public.pack_settings set value = 'x' where key = 'training_last_import'$$, 0,
                        'nor change when it last ran');
rollback;
