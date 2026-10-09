-- Pilot only: on until the committee adopts the app; only admins change it; changes are logged.
\set QUIET on

\echo '== Pilot only: settings and who can change them'
select test.check((select value from public.pack_settings where key = 'pilot_only') = 'on', 'the pilot starts on');
select test.check((select value from public.pack_settings where key = 'pilot_people') = '', 'with nobody picked yet');

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal1"}', true);
update public.pack_settings set value = '' where key = 'pilot_only';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);
update public.pack_settings set value = '' where key = 'pilot_only';
reset role;
select test.check((select value from public.pack_settings where key = 'pilot_only') = 'on',
                  'a parent or a den leader cannot turn it off');
select test.check(not exists (select 1 from public.security_log where action like 'access.pilot%'), 'and nothing is logged');
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","aal":"aal2"}', true);
update public.pack_settings set value = '30000000-0000-0000-0000-00000000000a,30000000-0000-0000-0000-00000000000b'
 where key = 'pilot_people';
update public.pack_settings set value = '' where key = 'pilot_only';
reset role;
select test.check((select value from public.pack_settings where key = 'pilot_only') = '', 'an admin can turn it off');
select test.check(exists (select 1 from public.security_log where action = 'access.pilot_only'
                          and subject = 'Pilot only turned off' and actor_name = 'Morgan Admin'), 'which is logged with who did it');
select test.check((select (detail->>'count')::int from public.security_log where action = 'access.pilot_people') = 2,
                  'picking people is logged as a count, without names');
update public.pack_settings set value = '' where key = 'pilot_only';
select test.check((select count(*) from public.security_log where action = 'access.pilot_only') = 1,
                  'saving the same value again adds nothing');
update public.pack_settings set value = '9' where key = 'photo_keep_months';
select test.check(not exists (select 1 from public.security_log where at = now() and action not like 'access.pilot%'),
                  'other settings are not logged');
rollback;
