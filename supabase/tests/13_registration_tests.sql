-- Registration expiry tracking: who sets dates, who reads them, reminders start over on a new date,
-- and the registration_billing setting.
-- From 01_rls_tests: A = Alex Smith (Smith family: Sky, River), B = Blair Jones (Jones family: Jo),
-- C = Lee Leader (den leader, not committee), D = Morgan Admin. From 12_gb_dues_tests:
-- K = Casey Committee (committee, no family).
\set QUIET on
set client_min_messages = notice;

\echo '== Registration: who sets dates'
begin;
set local role anon;
select test.expect_error($$select public.set_registration_expiry(array['40000000-0000-0000-0000-000000000001']::uuid[], null, '2030-10-31')$$,
                         '42501', 'anon cannot set registration dates');
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', true);
select test.expect_error($$select public.set_registration_expiry(array['40000000-0000-0000-0000-000000000001']::uuid[], null, '2030-10-31')$$,
                         '42501', 'parents cannot set registration dates');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', true);
select test.expect_error($$select public.set_registration_expiry(null, array['30000000-0000-0000-0000-00000000000c']::uuid[], '2030-10-31')$$,
                         '42501', 'den leaders off the committee cannot set registration dates');
rollback;

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1"}', false);
select test.check(public.set_registration_expiry(
                    array['40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000003']::uuid[],
                    array['30000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000c']::uuid[], '2030-10-31') = 5,
                  'committee sets one date for several scouts and adults');
select test.check(public.set_registration_expiry(array['40000000-0000-0000-0000-000000000001']::uuid[], null, '2030-10-31') = 0,
                  'setting the same date again changes nothing');
select test.expect_error($$select public.set_registration_expiry(array['40000000-0000-0000-0000-000000000001']::uuid[], null, '1900-01-01')$$,
                         '22023', 'a nonsense date is refused');
reset role;
select set_config('request.jwt.claims', '', false);
select test.check((select registration_expires_on from public.scouts where id = '40000000-0000-0000-0000-000000000003') = '2030-10-31',
                  'scout date saved');
select test.check((select registration_expires_on from public.adults where id = '30000000-0000-0000-0000-00000000000c') = '2030-10-31',
                  'adult date saved');

\echo '== Registration: reminders start over on a new date'
-- As the daily job does after a reminder goes out (secret key)
set role service_role;
update public.scouts set registration_reminded_days = 7 where id = '40000000-0000-0000-0000-000000000001';
update public.adults set registration_reminded_days = 30 where id = '30000000-0000-0000-0000-00000000000a';
reset role;
select test.check((select registration_reminded_days from public.scouts where id = '40000000-0000-0000-0000-000000000001') = 7,
                  'the daily job records a reminder');
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1"}', false);
select public.set_registration_expiry(array['40000000-0000-0000-0000-000000000001']::uuid[],
                                      array['30000000-0000-0000-0000-00000000000a']::uuid[], '2031-10-31');
reset role;
select set_config('request.jwt.claims', '', false);
select test.check((select registration_reminded_days is null from public.scouts where id = '40000000-0000-0000-0000-000000000001'),
                  'a new scout date resets the reminders');
select test.check((select registration_reminded_days is null from public.adults where id = '30000000-0000-0000-0000-00000000000a'),
                  'a new adult date resets the reminders');
update public.scouts set registration_reminded_days = 30 where id = '40000000-0000-0000-0000-000000000002';
update public.scouts set last_name = last_name where id = '40000000-0000-0000-0000-000000000002';
select test.check((select registration_reminded_days from public.scouts where id = '40000000-0000-0000-0000-000000000002') = 30,
                  'other changes keep the reminders');
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1"}', false);
select public.set_registration_expiry(array['40000000-0000-0000-0000-000000000002']::uuid[], null, null);
reset role;
select set_config('request.jwt.claims', '', false);
select test.check((select registration_expires_on is null and registration_reminded_days is null
                     from public.scouts where id = '40000000-0000-0000-0000-000000000002'), 'null clears the date');

\echo '== Registration: families read their own, and cannot change them'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', true);
select test.check((select registration_expires_on from public.scouts where id = '40000000-0000-0000-0000-000000000001') = '2031-10-31',
                  'a family reads its scout''s date');
select test.check((select registration_expires_on from public.adults where id = '30000000-0000-0000-0000-00000000000a') = '2031-10-31',
                  'an adult reads their own date');
select test.check(test.count($$select 1 from public.scouts where id = '40000000-0000-0000-0000-000000000003'$$) = 0,
                  'other families'' scouts stay hidden');
select test.expect_error($$update public.scouts set registration_expires_on = '2040-01-01' where id = '40000000-0000-0000-0000-000000000001'$$,
                         '42501', 'a family cannot change its scout''s date');
select test.expect_error($$update public.scouts set registration_reminded_days = 0 where id = '40000000-0000-0000-0000-000000000001'$$,
                         '42501', 'a family cannot change reminder tracking');
select test.expect_error($$update public.adults set registration_expires_on = '2040-01-01' where id = '30000000-0000-0000-0000-00000000000a'$$,
                         '42501', 'an adult cannot change their own date');
select test.expect_rows($$update public.adults set registration_expires_on = '2040-01-01' where id = '30000000-0000-0000-0000-00000000000b'$$, 0,
                        'nor anyone else''s');
rollback;

\echo '== Registration: registration_billing setting'
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1"}', false);
select test.check((select value from public.pack_settings where key = 'registration_billing') = 'off', 'registration billing starts off');
select public.save_pay_settings('{"registration_billing": "on"}');
select test.check((select value from public.pack_settings where key = 'registration_billing') = 'on', 'committee turns registration billing on');
select test.expect_error($$select public.save_pay_settings('{"registration_billing": "maybe"}')$$, '22023', 'registration billing is on or off');
select public.save_pay_settings('{"registration_billing": "off"}');
reset role;
select set_config('request.jwt.claims', '', false);
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', true);
select test.expect_error($$select public.save_pay_settings('{"registration_billing": "on"}')$$, '42501', 'parents cannot change registration billing');
rollback;

\echo '== REGISTRATION TESTS PASSED'
