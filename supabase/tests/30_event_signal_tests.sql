-- Signal group link on an event: leaders set it; only families going (RSVP yes) can read it.
-- A = Alex Smith (family 1), B = Blair Jones (family 2), C = Lee Leader (den leader, no family).
\set QUIET on
set client_min_messages = notice;

insert into public.events (id, title, category, starts_at, rsvp_enabled, leaders_only) values
 ('53000000-0000-0000-0000-000000000001', 'Fall Campout', 'Campout', now() + interval '20 days', true, false),
 ('53000000-0000-0000-0000-000000000002', 'Leader Retreat', 'Committee', now() + interval '20 days', true, true);

\echo '== Signal group: leaders set the link'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);
select test.expect_rows($$insert into public.event_signal (event_id, url)
                          values ('53000000-0000-0000-0000-000000000001', 'https://signal.group/#CjQKIAbc_def-123=')$$, 1,
                        'a leader adds the Signal group link');
select test.expect_error($$insert into public.event_signal (event_id, url)
                           values ('53000000-0000-0000-0000-000000000002', 'https://evil.example/#CjQKIAbcdef')$$, '23514',
                         'only signal.group invite links are accepted');
select test.expect_error($$insert into public.event_signal (event_id, url)
                           values ('53000000-0000-0000-0000-000000000002', 'https://signal.group/#a b')$$, '23514',
                         'no spaces or odd characters');
insert into public.event_signal (event_id, url) values ('53000000-0000-0000-0000-000000000002', 'https://signal.group/#LeadersOnly1');
select test.check(test.count('select * from public.event_signal') = 2, 'leaders see every link');
commit;

\echo '== Signal group: families'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal2"}', true);
select test.check(test.count('select * from public.event_signal') = 0, 'a family that has not answered does not see the link');
select test.check(public.event_has_signal('53000000-0000-0000-0000-000000000001'), 'but can tell the event has a Signal group');
select test.check(not public.event_has_signal('53000000-0000-0000-0000-000000000002'), 'not for leader-only events they cannot see');
select public.set_rsvp('53000000-0000-0000-0000-000000000001', 'maybe', 1, 1, null);
select test.check(test.count('select * from public.event_signal') = 0, 'nor does a "maybe"');
select public.set_rsvp('53000000-0000-0000-0000-000000000001', 'yes', 1, 1, null);
select test.check(test.count('select * from public.event_signal') = 1, 'a family going sees the link');
select test.expect_rows($$update public.event_signal set url = 'https://signal.group/#Hijacked123'$$, 0, 'families cannot change the link');
select test.expect_rows($$delete from public.event_signal$$, 0, 'or remove it');
select test.expect_error($$insert into public.event_signal (event_id, url)
                           values ('53000000-0000-0000-0000-000000000002', 'https://signal.group/#Mine12345')$$, '42501',
                         'or add one');
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","aal":"aal2"}', true);
select test.check(test.count('select * from public.event_signal') = 0, 'another family''s "yes" does not show it to others');
select public.set_rsvp('53000000-0000-0000-0000-000000000001', 'no', 0, 0, null);
select test.check(test.count('select * from public.event_signal') = 0, 'a "no" does not see it');
rollback;

begin;
set local role anon;
select test.expect_error($$select * from public.event_signal$$, '42501', 'signed-out visitors cannot read links');
rollback;

\echo '== Signal group: removing the event removes the link'
delete from public.events where id in ('53000000-0000-0000-0000-000000000001', '53000000-0000-0000-0000-000000000002');
select test.check(test.count('select * from public.event_signal') = 0, 'links go with their event');

\echo '== EVENT SIGNAL TESTS PASSED'
