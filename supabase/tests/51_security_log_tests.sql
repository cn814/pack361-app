-- Security log: access changes and downloads are recorded; only admins (after their code) read it;
-- nobody changes or deletes it from the app.
\set QUIET on

\echo '== Security log: changes are recorded'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","aal":"aal2"}', true);   -- Morgan, admin
update public.adults set role = 'den_leader', position_title = 'Quartermaster' where id = '30000000-0000-0000-0000-00000000000b';
reset role;
select test.check(exists (select 1 from public.security_log where action = 'adult.changed' and subject = 'Blair Jones'
                            and actor_id = '30000000-0000-0000-0000-00000000000d' and actor_name = 'Morgan Admin'
                            and detail -> 'role' = '["parent", "den_leader"]'::jsonb
                            and detail -> 'position' = '[null, "Quartermaster"]'::jsonb),
                  'a role and position change is logged with who made it');
update public.adults set phone = '410-555-0199' where id = '30000000-0000-0000-0000-00000000000b';
select test.check((select count(*) from public.security_log where subject = 'Blair Jones' and action = 'adult.changed') = 1,
                  'a phone change alone is not logged');
insert into public.den_leaders (den_id, adult_id) values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000b');
delete from public.den_leaders where den_id = '10000000-0000-0000-0000-000000000001' and adult_id = '30000000-0000-0000-0000-00000000000b';
select test.check((select count(*) from public.security_log where subject = 'Blair Jones' and action like 'den_leader.%') = 2,
                  'making and unmaking a den leader is logged');
insert into public.report_access (report, adult_id) values ('roster', '30000000-0000-0000-0000-00000000000b');
select test.check(exists (select 1 from public.security_log where action = 'report_access.added' and detail ->> 'report' = 'roster'),
                  'giving report access is logged');
update public.scouts set is_active = false where id = '40000000-0000-0000-0000-000000000003';
select test.check(exists (select 1 from public.security_log where action = 'scout.changed' and subject = 'Jo J.'),
                  'a scout turned off is logged, first name and initial only');
select set_config('request.jwt.claims', '', true);   -- as the app's own jobs (no one signed in)
update public.families set is_active = false where id = '20000000-0000-0000-0000-000000000002';
select test.check(exists (select 1 from public.security_log where action = 'family.off' and subject = 'Jones family'),
                  'a family turned off is logged');
select test.check((select actor_id from public.security_log where action = 'family.off') is null,
                  'changes made by the app''s own jobs have no person');
rollback;

\echo '== Security log: downloads'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);   -- Lee, den leader
select public.log_download('roster');
select test.expect_error($$select public.log_download('roster; drop table x')$$, '22023', 'only plain download names');
reset role;
select test.check(exists (select 1 from public.security_log where action = 'download' and subject = 'roster'
                            and actor_id = '30000000-0000-0000-0000-00000000000c'), 'a download is logged with who');
rollback;

begin;
set local role anon;
select test.expect_error($$select public.log_download('roster')$$, '42501', 'the public cannot write to it');
rollback;

\echo '== Security log: who can read it'
begin;
select private.log_security('test.entry', 'Test', '{}'::jsonb);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","aal":"aal2"}', true);
select test.check(test.count('select * from public.security_log') > 0, 'an admin with their code reads it');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","aal":"aal1"}', true);
select test.check(test.count('select * from public.security_log') = 0, 'not before the two-step code');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);
select test.check(test.count('select * from public.security_log') = 0, 'not a den leader');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","aal":"aal1"}', true);
select test.check(test.count('select * from public.security_log') = 0, 'not a parent');
rollback;

begin;
set local role anon;
select test.expect_error('select * from public.security_log', '42501', 'not the public');
rollback;

\echo '== Security log: nobody edits it'
begin;
select private.log_security('test.entry', 'Test', '{}'::jsonb);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","aal":"aal2"}', true);
select test.expect_error($$insert into public.security_log (action) values ('fake')$$, '42501', 'an admin cannot add rows');
select test.expect_error($$update public.security_log set action = 'x'$$, '42501', 'or change them');
select test.expect_error($$delete from public.security_log$$, '42501', 'or delete them');
select test.expect_error($$select private.log_security('fake', 'x', '{}')$$, '42501', 'or call the logger directly');
rollback;

\echo '== Security log: two years'
begin;
insert into public.security_log (at, action, subject) values (now() - interval '25 months', 'old.entry', 'Old'), (now() - interval '23 months', 'kept.entry', 'Kept');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","aal":"aal2"}', true);
select test.expect_error($$select public.purge_security_log()$$, '42501', 'only the nightly job clears old rows');
reset role;
set local role service_role;
select test.check(public.purge_security_log() >= 1, 'the nightly job clears rows over two years old');
reset role;
select test.check(not exists (select 1 from public.security_log where action = 'old.entry')
                  and exists (select 1 from public.security_log where action = 'kept.entry'), 'and keeps the rest');
rollback;
