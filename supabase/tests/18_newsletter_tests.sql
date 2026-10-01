-- Weekly newsletter: the setting starts at "pack admins only", and the send log is admin-read-only.
\set QUIET on
set client_min_messages = notice;

select test.check((select value from public.pack_settings where key = 'newsletter_mode') = 'admins',
                  'the newsletter starts out going to pack admins only');
insert into public.newsletter_sends (adult_id, week_of) values ('30000000-0000-0000-0000-00000000000a', '2026-10-04');
select test.expect_error($$insert into public.newsletter_sends (adult_id, week_of) values ('30000000-0000-0000-0000-00000000000a', '2026-10-04')$$,
                         '23505', 'one newsletter per person per week');

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', true);
select test.check(test.count('select * from public.newsletter_sends') = 0, 'a parent cannot see the send log');
select test.expect_error($$insert into public.newsletter_sends (adult_id, week_of) values ('30000000-0000-0000-0000-00000000000a', '2026-10-11')$$,
                         '42501', 'nobody signed in can write the send log');
select test.expect_rows($$update public.pack_settings set value = 'everyone' where key = 'newsletter_mode'$$, 0,
                        'a parent cannot change who gets the newsletter');
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d"}', true);
select test.check(test.count('select * from public.newsletter_sends') = 1, 'an admin can see the send log');
select test.expect_rows($$update public.pack_settings set value = 'everyone' where key = 'newsletter_mode'$$, 1,
                        'an admin can turn the newsletter on for everyone');
rollback;
