-- Automatic reminders: event_auto_reminders and meeting_family_alerts are written by the server only,
-- record each reminder once, readable by leaders, not by families or signed-out visitors.
-- A = Alex Smith (parent), C = Lee Leader (den leader).
\set QUIET on
set client_min_messages = notice;

insert into public.events (id, title, category, starts_at, rsvp_enabled, rsvp_by) values
 ('54000000-0000-0000-0000-000000000001', 'Reminder Campout', 'Campout', now() + interval '2 days', true, (now() + interval '1 day')::date);
insert into public.den_meetings (id, den_id, meets_on, title) values
 ('54000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', current_date, 'Reminder test meeting');

\echo '== Reminders: the server records each one once'
begin;
set local role service_role;
select test.expect_rows($$insert into public.event_auto_reminders (event_id, kind, sent_on, recipients)
                          values ('54000000-0000-0000-0000-000000000001', 'day_before', current_date, 4)$$, 1,
                        'the daily job records a day-before reminder');
select test.expect_rows($$insert into public.event_auto_reminders (event_id, kind, sent_on)
                          values ('54000000-0000-0000-0000-000000000001', 'day_before', current_date)
                          on conflict do nothing$$, 0,
                        'claiming the same reminder again on the same day inserts nothing (no double send)');
select test.expect_rows($$insert into public.event_auto_reminders (event_id, kind, sent_on)
                          values ('54000000-0000-0000-0000-000000000001', 'rsvp_nudge', current_date)$$, 1,
                        'the RSVP nudge is its own reminder');
select test.expect_rows($$insert into public.event_auto_reminders (event_id, kind, sent_on)
                          values ('54000000-0000-0000-0000-000000000001', 'day_before', current_date + 1)$$, 1,
                        'an event moved to a later day can be reminded again');
select test.expect_error($$insert into public.event_auto_reminders (event_id, kind, sent_on)
                           values ('54000000-0000-0000-0000-000000000001', 'whatever', current_date)$$, '23514',
                         'only known reminder kinds');
select test.expect_rows($$insert into public.meeting_family_alerts (meeting_id, scout_id, kind)
                          select '54000000-0000-0000-0000-000000000002', s.id, 'missed'
                            from public.scouts s where s.den_id = '10000000-0000-0000-0000-000000000002' limit 1$$, 1,
                        'the server records a den meeting alert');
select test.expect_rows($$insert into public.meeting_family_alerts (meeting_id, scout_id, kind)
                          select '54000000-0000-0000-0000-000000000002', s.id, 'missed'
                            from public.scouts s where s.den_id = '10000000-0000-0000-0000-000000000002' limit 1
                          on conflict do nothing$$, 0,
                        'saving the meeting again does not repeat the alert');
select test.expect_error($$insert into public.meeting_family_alerts (meeting_id, scout_id, kind)
                           select '54000000-0000-0000-0000-000000000002', s.id, 'nope'
                             from public.scouts s limit 1$$, '23514',
                         'only worked or missed');
commit;

\echo '== Reminders: who can see the log'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal2"}', true);
select test.check(test.count('select * from public.event_auto_reminders') = 0, 'a parent cannot see the reminder log');
select test.check(test.count('select * from public.meeting_family_alerts') = 0, 'or the den meeting alert log');
select test.expect_error($$insert into public.event_auto_reminders (event_id, kind, sent_on)
                           values ('54000000-0000-0000-0000-000000000001', 'rsvp_nudge', current_date + 5)$$, '42501',
                         'a parent cannot write the reminder log');
select test.expect_error($$delete from public.event_auto_reminders$$, '42501', 'or clear it (which would resend reminders)');
select test.expect_error($$insert into public.meeting_family_alerts (meeting_id, scout_id, kind)
                           select '54000000-0000-0000-0000-000000000002', s.id, 'worked' from public.scouts s limit 1$$, '42501',
                         'a parent cannot write the meeting alert log');
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);
select test.check(test.count('select * from public.event_auto_reminders') = 3, 'a leader sees what reminders went out');
select test.check(test.count('select * from public.meeting_family_alerts') = 1, 'and which families were told about a meeting');
select test.expect_error($$delete from public.event_auto_reminders$$, '42501', 'but cannot change the log');
rollback;

begin;
set local role anon;
select test.expect_error($$select * from public.event_auto_reminders$$, '42501', 'signed-out visitors cannot read the reminder log');
select test.expect_error($$select * from public.meeting_family_alerts$$, '42501', 'or the meeting alert log');
rollback;

\echo '== Reminders: removing the event or meeting removes its log'
delete from public.events where id = '54000000-0000-0000-0000-000000000001';
delete from public.den_meetings where id = '54000000-0000-0000-0000-000000000002';
select test.check(test.count('select * from public.event_auto_reminders') = 0, 'reminders go with their event');
select test.check(test.count('select * from public.meeting_family_alerts') = 0, 'alerts go with their meeting');

\echo '== REMINDER TESTS PASSED'
