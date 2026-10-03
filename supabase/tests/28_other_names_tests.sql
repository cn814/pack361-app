-- Remembered other names for adults (training import confirmations).
\set QUIET on
set client_min_messages = notice;

\echo '== Other names: pack leadership saves, others cannot'
update public.adults set role = 'committee' where id = '30000000-0000-0000-0000-00000000000c';
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);
select test.check(public.remember_adult_names($$[{"adult_id":"30000000-0000-0000-0000-00000000000b","name":"  Pat   Q Jones "}]$$::jsonb) = 1,
                  'pack leadership saves a confirmed name');
select test.check((select other_names from public.adults where id = '30000000-0000-0000-0000-00000000000b') = array['Pat Q Jones'],
                  'the name is tidied and saved');
select test.check(public.remember_adult_names($$[{"adult_id":"30000000-0000-0000-0000-00000000000b","name":"pat q jones"}]$$::jsonb) = 0,
                  'the same name is not saved twice');
rollback;
update public.adults set role = 'den_leader' where id = '30000000-0000-0000-0000-00000000000c';

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal2"}', true);
select test.expect_error($$select public.remember_adult_names('[]'::jsonb)$$, '42501', 'a parent cannot save names');
select test.expect_error($$update public.adults set other_names = '{x}' where id = '30000000-0000-0000-0000-00000000000a'$$, '42501',
                         'nor edit other names directly');
rollback;

\echo '== OTHER NAMES TESTS PASSED'
