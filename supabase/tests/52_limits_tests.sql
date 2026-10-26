-- Leaders' code lasts 30 days; contact details of families who left are cleared after the set
-- number of months; the app's contact address is app@pack361.org.
\set QUIET on

\echo '== Leader code: lasts 30 days'
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-00000000000d', 'aal', 'aal2',
    'amr', json_build_array(json_build_object('method', 'otp', 'timestamp', extract(epoch from now())::bigint),
                            json_build_object('method', 'totp', 'timestamp', extract(epoch from now() - interval '29 days')::bigint)))::text, true);
select test.check(private.is_admin(), 'an admin who entered the code 29 days ago has admin access');
select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-00000000000d', 'aal', 'aal2',
    'amr', json_build_array(json_build_object('method', 'totp', 'timestamp', extract(epoch from now() - interval '31 days')::bigint)))::text, true);
select test.check(not private.is_admin(), 'after 30 days the code must be entered again');
select test.check(not exists (select 1 from public.security_log), 'and the admin-only security log is closed to them');
select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-00000000000c', 'aal', 'aal2',
    'amr', json_build_array(json_build_object('method', 'totp', 'timestamp', extract(epoch from now() - interval '31 days')::bigint)))::text, true);
select test.check(not private.is_leader(), 'the same goes for den leaders');
select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-00000000000d', 'aal', 'aal2',
    'amr', json_build_array(json_build_object('method', 'otp', 'timestamp', extract(epoch from now())::bigint)))::text, true);
select test.check(not private.is_admin(), 'aal2 without an authenticator code entry does not count');
select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-00000000000d', 'aal', 'aal1',
    'amr', json_build_array(json_build_object('method', 'totp', 'timestamp', extract(epoch from now())::bigint)))::text, true);
select test.check(not private.is_admin(), 'nor does a fresh entry on a session that is not aal2');
rollback;

\echo '== Families who left: contact details cleared after the set time'
begin;
update public.families set is_active = false where id = '20000000-0000-0000-0000-000000000002';
update public.adults set is_active = false where family_id = '20000000-0000-0000-0000-000000000002';
update public.adults set left_on = current_date - 800 where family_id = '20000000-0000-0000-0000-000000000002';
update public.families set left_on = current_date - 800 where id = '20000000-0000-0000-0000-000000000002';
update public.families set is_active = false, left_on = current_date - 100 where id = '20000000-0000-0000-0000-000000000001';
update public.adults set is_active = false where family_id = '20000000-0000-0000-0000-000000000001';
update public.adults set left_on = current_date - 100 where family_id = '20000000-0000-0000-0000-000000000001';
set local role anon;
select test.expect_error('select public.purge_left_families()', '42501', 'visitors cannot run the clearing');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","aal":"aal2"}', true);
select test.expect_error('select public.purge_left_families()', '42501', 'nor can an admin from the app');
reset role;
select set_config('request.jwt.claims', '', true);
select test.check(public.purge_left_families() = 1, 'one adult cleared: the family that left over two years ago');
select test.check((select email from public.adults where id = '30000000-0000-0000-0000-00000000000b')
                  = 'removed-30000000-0000-0000-0000-00000000000b@left.invalid', 'their email is gone');
select test.check((select phone is null and user_id is null and other_names = '{}' from public.adults
                    where id = '30000000-0000-0000-0000-00000000000b'), 'and their phone, other names and sign-in');
select test.check(not exists (select 1 from auth.users where id = '00000000-0000-0000-0000-00000000000b'),
                  'their sign-in account is deleted');
select test.check((select first_name || ' ' || last_name from public.adults where id = '30000000-0000-0000-0000-00000000000b') = 'Blair Jones',
                  'their name stays for the pack''s records');
select test.check((select count(*) from public.scouts where family_id = '20000000-0000-0000-0000-000000000002') > 0,
                  'and so do their scouts');
select test.check(exists (select 1 from public.security_log where action = 'adult.contact_cleared' and subject = 'Blair Jones'),
                  'the clearing is in the security log');
select test.check(not exists (select 1 from public.security_log where detail::text like '%@%'),
                  'without the old email');
select test.check((select email from public.adults where id = '30000000-0000-0000-0000-00000000000a') not like 'removed-%',
                  'a family that left 100 days ago is untouched');
select test.check(public.purge_left_families() = 0, 'running it again changes nothing');
update public.pack_settings set value = '' where key = 'left_family_months';
update public.families set left_on = current_date - 9000 where id = '20000000-0000-0000-0000-000000000001';
update public.adults set left_on = current_date - 9000 where family_id = '20000000-0000-0000-0000-000000000001';
select test.check(public.purge_left_families() = 0, 'with the setting blank, nothing is cleared');
rollback;

\echo '== Contact address'
select test.check(not exists (select 1 from public.guide_pages where body like '%info@pack361.org%'),
                  'guide pages point to app@pack361.org');
select test.check(position('app@pack361.org' in pg_get_functiondef('private.feedback_limit()'::regprocedure)) > 0
                  and position('app@pack361.org' in pg_get_functiondef('private.join_request_insert()'::regprocedure)) > 0,
                  'and so do the database''s own messages');
