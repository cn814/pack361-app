-- Council events picker: the staged copy of the council calendar and its link setting.
-- A = Alex Smith (parent), C = Lee Leader (den leader), D = Morgan Admin,
-- K = Kim Committee (committee member, added here), E = signed in but not on the roster.
\set QUIET on
set client_min_messages = notice;

-- The sync runs with the secret key (service_role); let it use the test helpers.
grant usage on schema test to service_role;
grant execute on all functions in schema test to service_role;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c1', 'kim.committee@example.com');
insert into public.adults (id, first_name, last_name, email, role, position_title) values
 ('30000000-0000-0000-0000-0000000000c1', 'Kim', 'Committee', 'kim.committee@example.com', 'committee', 'Committee Chair');

insert into public.council_events (uid, title, starts_at, all_day, location, url, description) values
 ('c-1@scoutingevent.com', 'National Pike District Cub Scout Fall Fun Day', now() + interval '20 days', false,
  'Centennial Park', 'https://scoutingevent.com/220-NPFallFun', 'Games and crafts for all Cub Scouts.'),
 ('c-2@scoutingevent.com', 'Columbus Day - Service Center Closed', now() + interval '12 days', true, null, null, null);

select test.check((select status from public.council_events where uid = 'c-1@scoutingevent.com') = 'new'
                  and (select first_seen_at from public.council_events where uid = 'c-1@scoutingevent.com') is not null,
                  'council events start as new');
select test.check((select value from public.pack_settings where key = 'council_calendar_url') = '',
                  'the council calendar link starts empty');
select test.expect_error($$insert into public.council_events (uid, title, starts_at, status) values ('bad', 'x', now(), 'maybe')$$,
                         '23514', 'status must be new, added or skipped');
select test.expect_error($$insert into public.council_events (uid, title, starts_at, description) values ('long', 'x', now(), repeat('x', 1501))$$,
                         '23514', 'descriptions are capped at 1500 characters');

\echo '== Council events: anonymous visitor'
begin;
set local role anon;
select test.expect_error('select * from public.council_events', '42501', 'the public cannot read council events');
select test.expect_error($$update public.council_events set status = 'skipped'$$, '42501', 'the public cannot change council events');
commit;

\echo '== Council events: signed in, not on the roster (E)'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000e"}', true);
select test.check(test.count('select * from public.council_events') = 0, 'strangers see no council events');
select test.expect_rows($$update public.council_events set status = 'skipped'$$, 0, 'strangers cannot change council events');
commit;

\echo '== Council events: parent (A)'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', true);
select test.check(test.count('select * from public.council_events') = 0, 'parents cannot read council events');
select test.expect_rows($$update public.council_events set status = 'skipped'$$, 0, 'parents cannot change council events');
select test.expect_rows($$update public.pack_settings set value = 'https://example.com/x.ics' where key = 'council_calendar_url'$$, 0,
                        'parents cannot change the council calendar link');
commit;

\echo '== Council events: den leader (C)'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', true);
select test.check(test.count('select * from public.council_events') = 2, 'den leaders read council events');
select test.expect_rows($$update public.council_events set status = 'skipped'$$, 0, 'den leaders cannot change council events');
select test.expect_error($$insert into public.council_events (uid, title, starts_at) values ('c-9', 'x', now())$$, '42501',
                         'den leaders cannot add council events');
select test.expect_rows($$update public.pack_settings set value = 'https://example.com/x.ics' where key = 'council_calendar_url'$$, 0,
                        'den leaders cannot change the council calendar link');
commit;

\echo '== Council events: committee member (K)'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1"}', true);
select test.check(test.count('select * from public.council_events') = 2, 'committee reads council events');
select test.expect_rows($$update public.council_events set status = 'skipped' where uid = 'c-2@scoutingevent.com'$$, 1,
                        'committee skips a council event');
select test.check((select decided_by from public.council_events where uid = 'c-2@scoutingevent.com') = '30000000-0000-0000-0000-0000000000c1'
                  and (select decided_at from public.council_events where uid = 'c-2@scoutingevent.com') is not null,
                  'the decision is stamped with who and when');
select test.expect_rows($$update public.council_events set status = 'new' where uid = 'c-2@scoutingevent.com'$$, 1,
                        'committee undoes a skip');
-- Add: make the pack event (committee members are leaders), then link it.
select test.expect_rows($$insert into public.events (id, title, category, starts_at, source, signup_url)
                          values ('52000000-0000-0000-0000-000000000001', 'Fall Fun Day', 'District', now() + interval '20 days',
                                  'council', 'https://scoutingevent.com/220-NPFallFun')$$, 1,
                        'committee puts a council event on the pack calendar');
select test.expect_rows($$update public.council_events set status = 'added', event_id = '52000000-0000-0000-0000-000000000001'
                          where uid = 'c-1@scoutingevent.com'$$, 1, 'committee marks it added');
select test.expect_error($$update public.council_events set title = 'Changed' where uid = 'c-1@scoutingevent.com'$$, '42501',
                         'committee cannot rewrite what the council calendar says');
select test.expect_error($$update public.council_events set removed_at = now() where uid = 'c-1@scoutingevent.com'$$, '42501',
                         'committee cannot mark events removed');
select test.expect_error($$insert into public.council_events (uid, title, starts_at) values ('c-9', 'x', now())$$, '42501',
                         'committee cannot add council events (only the sync does)');
select test.expect_error($$delete from public.council_events$$, '42501', 'nobody deletes council events');
select test.expect_rows($$insert into public.pack_settings (key, value) values ('council_calendar_url', 'webcal://scoutingevent.com/feed.ics')
                          on conflict (key) do update set value = excluded.value, updated_at = now()$$, 1,
                        'committee saves the council calendar link');
select test.expect_rows($$update public.pack_settings set value = '$5' where key = 'dues_amount'$$, 0,
                        'committee cannot change other pack settings');
select test.expect_error($$insert into public.pack_settings (key, value) values ('council_last_sync', '{}')$$, '42501',
                         'committee cannot write the sync status');
select test.expect_rows($$delete from public.pack_settings where key = 'council_calendar_url'$$, 0,
                        'committee cannot delete the link setting');
commit;

\echo '== Council events: admin (D)'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d"}', true);
select test.check(test.count('select * from public.council_events') = 2, 'admins read council events');
select test.expect_rows($$update public.council_events set status = 'skipped' where uid = 'c-2@scoutingevent.com'$$, 1,
                        'admins decide too');
select test.check((select decided_by from public.council_events where uid = 'c-2@scoutingevent.com') = '30000000-0000-0000-0000-00000000000d',
                  'admin''s decision is stamped with the admin');
-- Undo an add and take it off the calendar: the pack event moves to the archive.
select test.expect_rows($$update public.events set archived_at = now(), archived_reason = 'hidden'
                          where id = '52000000-0000-0000-0000-000000000001'$$, 1, 'the added event can be taken off the calendar');
select test.expect_rows($$update public.council_events set status = 'new' where uid = 'c-1@scoutingevent.com'$$, 1,
                        'the add is undone');
commit;

\echo '== Council events: the sync (secret key)'
begin;
set local role service_role;
select test.expect_rows($$insert into public.council_events (uid, title, starts_at, last_seen_at)
                          values ('c-1@scoutingevent.com', 'Fall Fun Day (moved)', now() + interval '21 days', now()),
                                 ('c-3@scoutingevent.com', 'Webelos Woods', now() + interval '40 days', now())
                          on conflict (uid) do update set title = excluded.title, starts_at = excluded.starts_at,
                                                          last_seen_at = excluded.last_seen_at, removed_at = null$$, 2,
                        'the sync adds and refreshes council events');
select test.check((select status from public.council_events where uid = 'c-1@scoutingevent.com') = 'new'
                  and (select event_id from public.council_events where uid = 'c-1@scoutingevent.com') = '52000000-0000-0000-0000-000000000001'
                  and (select decided_by from public.council_events where uid = 'c-1@scoutingevent.com') = '30000000-0000-0000-0000-00000000000d',
                  'refreshing keeps the decision and the link to the pack event');
select test.expect_rows($$update public.council_events set removed_at = now() where uid = 'c-2@scoutingevent.com'$$, 1,
                        'the sync marks events that left the feed');
select test.expect_rows($$insert into public.pack_settings (key, value) values ('council_last_sync', '{"ok":true}')
                          on conflict (key) do update set value = excluded.value$$, 1, 'the sync saves its status');
commit;

\echo '== Council events: status is visible to leaders'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', true);
select test.check((select value from public.pack_settings where key = 'council_last_sync') = '{"ok":true}',
                  'leaders see the last check''s status');
commit;

-- A pack event is never deleted by the app, but if one were, the link clears instead of blocking it.
delete from public.events where id = '52000000-0000-0000-0000-000000000001';
select test.check((select event_id from public.council_events where uid = 'c-1@scoutingevent.com') is null,
                  'deleting a pack event clears the link');
