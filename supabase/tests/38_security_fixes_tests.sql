-- Security fixes (20261013000000_security_fixes.sql).
-- P = Pat Parent (family Sec1), R = Robin Other (family Sec2), L = Lou Leader (den leader, no
-- family), K = Cora Committee (committee), C = Lee Leader (den leader, from 01_rls_tests).
\set QUIET on
set client_min_messages = notice;

insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-000000003801', 'pat.parent@example.com'),
 ('00000000-0000-0000-0000-000000003802', 'robin.other@example.com'),
 ('00000000-0000-0000-0000-000000003803', 'lou.leader@example.com'),
 ('00000000-0000-0000-0000-000000003804', 'cora.committee@example.com');
insert into public.families (id, family_name) values
 ('20000000-0000-0000-0000-000000003801', 'Sec1'),
 ('20000000-0000-0000-0000-000000003802', 'Sec2');
insert into public.adults (id, family_id, first_name, last_name, email, role, position_title) values
 ('30000000-0000-0000-0000-000000003801', '20000000-0000-0000-0000-000000003801', 'Pat', 'Parent', 'pat.parent@example.com', 'parent', null),
 ('30000000-0000-0000-0000-000000003802', '20000000-0000-0000-0000-000000003802', 'Robin', 'Other', 'robin.other@example.com', 'parent', null),
 ('30000000-0000-0000-0000-000000003803', null, 'Lou', 'Leader', 'lou.leader@example.com', 'den_leader', null),
 ('30000000-0000-0000-0000-000000003804', null, 'Cora', 'Committee', 'cora.committee@example.com', 'committee', 'Secretary');

-- A pack campout and a leaders-only planning meeting, each with a schedule, packing list and job.
insert into public.events (id, title, category, starts_at, leaders_only) values
 ('38000000-0000-0000-0000-0000000000e1', 'Spring Campout', 'Campout', now() + interval '30 days', false),
 ('38000000-0000-0000-0000-0000000000e2', 'Leader Planning', 'Committee', now() + interval '30 days', true);
insert into public.itinerary_items (id, event_id, starts_at, title) values
 ('38000000-0000-0000-0000-0000000001a1', '38000000-0000-0000-0000-0000000000e1', now() + interval '30 days', 'Arrive and set up'),
 ('38000000-0000-0000-0000-0000000001a2', '38000000-0000-0000-0000-0000000000e2', now() + interval '30 days', 'Budget talk');
insert into public.packing_items (id, event_id, category, label) values
 ('38000000-0000-0000-0000-0000000002a1', '38000000-0000-0000-0000-0000000000e1', 'Sleeping', 'Sleeping bag'),
 ('38000000-0000-0000-0000-0000000002a2', '38000000-0000-0000-0000-0000000000e2', 'Other', 'Draft budget'),
 ('38000000-0000-0000-0000-0000000002a3', null, 'Other', 'Sec default list item');
insert into public.volunteer_slots (id, event_id, role_title, capacity) values
 ('38000000-0000-0000-0000-0000000003a1', '38000000-0000-0000-0000-0000000000e1', 'Campfire lead', 5),
 ('38000000-0000-0000-0000-0000000003a2', '38000000-0000-0000-0000-0000000000e2', 'Note taker', 5),
 ('38000000-0000-0000-0000-0000000003a3', null, 'Sec standing job', 5);
insert into public.volunteer_signups (slot_id, adult_id) values
 ('38000000-0000-0000-0000-0000000003a1', '30000000-0000-0000-0000-000000003802'),
 ('38000000-0000-0000-0000-0000000003a2', '30000000-0000-0000-0000-000000003804');

create function test.as38(p_sub text) returns void language sql as $$
    select set_config('request.jwt.claims', json_build_object('sub', p_sub, 'aal', 'aal2')::text, true)
$$;
grant execute on function test.as38(text) to authenticated, anon;

-- ---------------------------------------------------------------------------
\echo '== Security fixes: leaders-only events hide their schedule, packing list and jobs'
begin;
set local role authenticated;
select test.as38('00000000-0000-0000-0000-000000003801');
select test.check(test.count($$select * from public.itinerary_items where event_id = '38000000-0000-0000-0000-0000000000e1'$$) = 1,
                  'a parent sees a pack event''s schedule');
select test.check(test.count($$select * from public.itinerary_items where id = '38000000-0000-0000-0000-0000000001a2'$$) = 0,
                  'but not a leaders-only event''s schedule');
select test.check(test.count($$select * from public.packing_items where id = '38000000-0000-0000-0000-0000000002a1'$$) = 1,
                  'a parent sees a pack event''s packing list');
select test.check(test.count($$select * from public.packing_items where id = '38000000-0000-0000-0000-0000000002a3'$$) = 1,
                  'and the default packing list (no event)');
select test.check(test.count($$select * from public.packing_items where id = '38000000-0000-0000-0000-0000000002a2'$$) = 0,
                  'but not a leaders-only event''s packing list');
select test.check(test.count($$select * from public.volunteer_slots where id in ('38000000-0000-0000-0000-0000000003a1', '38000000-0000-0000-0000-0000000003a3')$$) = 2,
                  'a parent sees pack event jobs and standing jobs');
select test.check(test.count($$select * from public.volunteer_slots where id = '38000000-0000-0000-0000-0000000003a2'$$) = 0,
                  'but not a leaders-only event''s jobs');
select test.check(test.count($$select * from public.volunteer_signups where slot_id = '38000000-0000-0000-0000-0000000003a1'$$) = 1,
                  'a parent sees who signed up for a pack event job');
select test.check(test.count($$select * from public.volunteer_signups where slot_id = '38000000-0000-0000-0000-0000000003a2'$$) = 0,
                  'but not for a leaders-only event''s job');
select test.expect_error($$insert into public.volunteer_signups (slot_id, adult_id)
                           values ('38000000-0000-0000-0000-0000000003a2', '30000000-0000-0000-0000-000000003801')$$, '42501',
                         'a parent cannot sign up for a leaders-only event''s job');
select test.expect_rows($$insert into public.volunteer_signups (slot_id, adult_id)
                          values ('38000000-0000-0000-0000-0000000003a1', '30000000-0000-0000-0000-000000003801')$$, 1,
                        'a parent can still sign up for a pack event job');
select test.expect_rows($$insert into public.volunteer_signups (slot_id, adult_id)
                          values ('38000000-0000-0000-0000-0000000003a3', '30000000-0000-0000-0000-000000003801')$$, 1,
                        'and for a standing job');
rollback;

begin;
set local role authenticated;
select test.as38('00000000-0000-0000-0000-000000003803');
select test.check(test.count($$select * from public.itinerary_items where id in ('38000000-0000-0000-0000-0000000001a1', '38000000-0000-0000-0000-0000000001a2')$$) = 2,
                  'a leader sees both schedules');
select test.check(test.count($$select * from public.packing_items where id in ('38000000-0000-0000-0000-0000000002a1', '38000000-0000-0000-0000-0000000002a2', '38000000-0000-0000-0000-0000000002a3')$$) = 3,
                  'a leader sees every packing list');
select test.check(test.count($$select * from public.volunteer_slots where id in ('38000000-0000-0000-0000-0000000003a1', '38000000-0000-0000-0000-0000000003a2', '38000000-0000-0000-0000-0000000003a3')$$) = 3,
                  'a leader sees every job');
select test.check(test.count($$select * from public.volunteer_signups where slot_id = '38000000-0000-0000-0000-0000000003a2'$$) = 1,
                  'a leader sees who signed up for a leaders-only job');
select test.expect_rows($$insert into public.volunteer_signups (slot_id, adult_id)
                          values ('38000000-0000-0000-0000-0000000003a2', '30000000-0000-0000-0000-000000003803')$$, 1,
                        'a leader can sign up for a leaders-only event''s job');
select test.expect_rows($$insert into public.itinerary_items (event_id, starts_at, title)
                          values ('38000000-0000-0000-0000-0000000000e2', now(), 'Wrap up')$$, 1,
                        'leaders still add to a leaders-only schedule');
rollback;

-- ---------------------------------------------------------------------------
\echo '== Security fixes: a saved device moves only with the same keys'
begin;
set local role authenticated;
select test.as38('00000000-0000-0000-0000-000000003801');
select public.register_push_subscription('https://fcm.googleapis.com/fcm/send/sec-device', 'pat-key', 'pat-auth', 'Phone');
select test.check(test.count($$select * from public.push_subscriptions where endpoint like '%/sec-device'$$) = 1, 'a parent saves a device');
select test.as38('00000000-0000-0000-0000-000000003802');
select test.expect_error($$select public.register_push_subscription('https://fcm.googleapis.com/fcm/send/sec-device', 'robin-key', 'robin-auth', 'Phone')$$,
                         '42501', 'someone else cannot take a device by knowing its address');
select test.expect_error($$select public.register_push_subscription('https://fcm.googleapis.com/fcm/send/sec-device', 'pat-key', 'robin-auth', 'Phone')$$,
                         '42501', 'both keys must match');
select test.check(test.count($$select * from public.push_subscriptions where endpoint like '%/sec-device'$$) = 0, 'the device is not theirs');
select test.as38('00000000-0000-0000-0000-000000003801');
select test.check((select adult_id from public.push_subscriptions where endpoint like '%/sec-device') = '30000000-0000-0000-0000-000000003801'
                  and (select p256dh from public.push_subscriptions where endpoint like '%/sec-device') = 'pat-key',
                  'and stays with its owner, keys unchanged');
select test.as38('00000000-0000-0000-0000-000000003802');
select public.register_push_subscription('https://fcm.googleapis.com/fcm/send/sec-device', 'pat-key', 'pat-auth', 'Tablet');
select test.check((select adult_id from public.push_subscriptions where endpoint like '%/sec-device') = '30000000-0000-0000-0000-000000003802',
                  'the same browser (same keys) signing in as someone else moves to them');
rollback;

-- ---------------------------------------------------------------------------
\echo '== Security fixes: help offers stay on open roles'
insert into public.pack_roles (id, title, open) values
 ('38000000-0000-0000-0000-0000000004a1', 'Sec open role', true),
 ('38000000-0000-0000-0000-0000000004a2', 'Sec closed role', false);
insert into public.role_interest (role_id, adult_id, note) values
 ('38000000-0000-0000-0000-0000000004a1', '30000000-0000-0000-0000-000000003801', 'Happy to help');
begin;
set local role authenticated;
select test.as38('00000000-0000-0000-0000-000000003801');
select test.expect_rows($$update public.role_interest set note = 'Weekends only' where role_id = '38000000-0000-0000-0000-0000000004a1'$$, 1,
                        'a parent can edit their offer on an open role');
select test.expect_error($$update public.role_interest set role_id = '38000000-0000-0000-0000-0000000004a2' where role_id = '38000000-0000-0000-0000-0000000004a1'$$,
                         '42501', 'but cannot move it to a closed role');
rollback;

-- ---------------------------------------------------------------------------
\echo '== Security fixes: storage helpers only answer about your own files'
insert into storage.objects (bucket_id, name) values
 ('pack-photos', '30000000-0000-0000-0000-000000003801/p1.jpg'),
 ('pack-photos', '30000000-0000-0000-0000-000000003802/p1.jpg'),
 ('pack-photos', '30000000-0000-0000-0000-000000003802/p2.jpg'),
 ('receipts', 'r/30000000-0000-0000-0000-000000003802/38000000-0000-0000-0000-0000000005a1.jpg'),
 ('pack-docs', 'docs/30000000-0000-0000-0000-000000003803/38000000-0000-0000-0000-0000000006a1.pdf'),
 ('pack-docs', 'docs/30000000-0000-0000-0000-000000003803/orphan.pdf');
insert into public.documents (id, title, storage_path, file_name, mime_type, size_bytes, uploaded_by) values
 ('38000000-0000-0000-0000-0000000006a1', 'Sec doc', 'docs/30000000-0000-0000-0000-000000003803/38000000-0000-0000-0000-0000000006a1.pdf',
  'sec.pdf', 'application/pdf', 100, '30000000-0000-0000-0000-000000003803');
insert into public.expenses (id, spent_on, amount_cents, description, adult_id, receipt_path, receipt_name, receipt_mime, receipt_bytes)
values ('38000000-0000-0000-0000-0000000005a1', current_date, 1200, 'Sec firewood', '30000000-0000-0000-0000-000000003802',
        'r/30000000-0000-0000-0000-000000003802/38000000-0000-0000-0000-0000000005a1.jpg', 'wood.jpg', 'image/jpeg', 1000);
update public.expenses set status = 'declined' where id = '38000000-0000-0000-0000-0000000005a1';

begin;
set local role authenticated;
select test.as38('00000000-0000-0000-0000-000000003801');
select test.check(private.uploads_today('pack-photos', '30000000-0000-0000-0000-000000003801') = 1, 'a parent''s own upload count is right');
select test.check(private.uploads_today('pack-photos', '30000000-0000-0000-0000-000000003802') = 0, 'another person''s upload count reads 0');
select test.check(private.uploads_today('receipts', 'r/30000000-0000-0000-0000-000000003802') = 0, 'another person''s receipt count reads 0');
select test.check(private.uploads_today('pack-photos', '%') = 0, 'wildcards don''t count everyone''s uploads');
select test.check(not private.receipt_locked('r/30000000-0000-0000-0000-000000003802/38000000-0000-0000-0000-0000000005a1.jpg'),
                  'another person''s receipt does not show as locked');
select test.check(not private.document_file_in_use('docs/30000000-0000-0000-0000-000000003803/38000000-0000-0000-0000-0000000006a1.pdf'),
                  'a parent learns nothing about document files');
select test.expect_rows($$insert into storage.objects (bucket_id, name) values ('pack-photos', '30000000-0000-0000-0000-000000003801/p2.jpg')$$, 1,
                        'a parent can still upload photos to their folder');

select test.as38('00000000-0000-0000-0000-000000003802');
select test.check(private.uploads_today('pack-photos', '30000000-0000-0000-0000-000000003802') = 2, 'own photo count');
select test.check(private.uploads_today('receipts', 'r/30000000-0000-0000-0000-000000003802') = 1, 'own receipt count');
select test.check(private.receipt_locked('r/30000000-0000-0000-0000-000000003802/38000000-0000-0000-0000-0000000005a1.jpg'),
                  'my own receipt on a request leadership acted on is locked');
select test.expect_rows($$delete from storage.objects where name = 'r/30000000-0000-0000-0000-000000003802/38000000-0000-0000-0000-0000000005a1.jpg'$$, 0,
                        'so I still cannot delete it');

select test.as38('00000000-0000-0000-0000-00000000000c');
select test.check(not private.document_file_in_use('docs/30000000-0000-0000-0000-000000003803/38000000-0000-0000-0000-0000000006a1.pdf'),
                  'another leader learns nothing about someone else''s document files');

select test.as38('00000000-0000-0000-0000-000000003803');
select test.check(private.document_file_in_use('docs/30000000-0000-0000-0000-000000003803/38000000-0000-0000-0000-0000000006a1.pdf'),
                  'a leader sees their own file is in use');
select test.expect_rows($$delete from storage.objects where name = 'docs/30000000-0000-0000-0000-000000003803/38000000-0000-0000-0000-0000000006a1.pdf'$$, 0,
                        'so they cannot delete it');
select test.expect_rows($$delete from storage.objects where name = 'docs/30000000-0000-0000-0000-000000003803/orphan.pdf'$$, 1,
                        'but can delete their own unused file');

select test.as38('00000000-0000-0000-0000-000000003804');
select test.check(private.document_file_in_use('docs/30000000-0000-0000-0000-000000003803/38000000-0000-0000-0000-0000000006a1.pdf'),
                  'committee sees any document file in use');
select test.check(private.receipt_locked('r/30000000-0000-0000-0000-000000003802/38000000-0000-0000-0000-0000000005a1.jpg'),
                  'committee sees any receipt is locked');
rollback;

-- ---------------------------------------------------------------------------
\echo '== Security fixes: event messages follow the event'
insert into public.announcements (id, author_id, title, body, event_id) values
 ('38000000-0000-0000-0000-0000000007a1', '30000000-0000-0000-0000-000000003803', 'Campout update', 'Bring rain gear', '38000000-0000-0000-0000-0000000000e1'),
 ('38000000-0000-0000-0000-0000000007a2', '30000000-0000-0000-0000-000000003803', 'Planning update', 'Budget draft attached', '38000000-0000-0000-0000-0000000000e2');
begin;
set local role authenticated;
select test.as38('00000000-0000-0000-0000-000000003801');
select test.check(test.count($$select * from public.announcements where id = '38000000-0000-0000-0000-0000000007a1'$$) = 1,
                  'a parent reads a pack event''s message');
select test.check(test.count($$select * from public.announcements where id = '38000000-0000-0000-0000-0000000007a2'$$) = 0,
                  'but not a leaders-only event''s message');
select test.as38('00000000-0000-0000-0000-000000003803');
select test.check(test.count($$select * from public.announcements where id in ('38000000-0000-0000-0000-0000000007a1', '38000000-0000-0000-0000-0000000007a2')$$) = 2,
                  'a leader reads both');
rollback;
delete from public.announcements where id in ('38000000-0000-0000-0000-0000000007a1', '38000000-0000-0000-0000-0000000007a2');

-- ---------------------------------------------------------------------------
\echo '== Security fixes: a copied event is not on the join page'
update public.events set public_on_join = true, public_blurb = 'Come camp with us'
 where id = '38000000-0000-0000-0000-0000000000e1';
begin;
set local role authenticated;
select test.as38('00000000-0000-0000-0000-000000003803');
create temp table sec_copy on commit drop as
  select public.copy_event('38000000-0000-0000-0000-0000000000e1', (current_date + 60)) as id;
select test.check((select not e.public_on_join and e.public_blurb is null and e.title = 'Spring Campout'
                     from public.events e join sec_copy c on c.id = e.id),
                  'the copy keeps the details but is not shown on the join page');
select test.check(test.count($$select * from public.itinerary_items i join sec_copy c on c.id = i.event_id$$) = 1,
                  'and still copies the schedule');
rollback;
update public.events set public_on_join = false, public_blurb = null
 where id = '38000000-0000-0000-0000-0000000000e1';

-- ---------------------------------------------------------------------------
\echo '== Security fixes: at most 10 open gear requests per family'
insert into public.gear_items (id, name, quantity) values ('38000000-0000-0000-0000-0000000008a1', 'Sec lantern', 50);
insert into public.gear_loans (id, item_id, family_id, adult_id, due_on)
select ('38000000-0000-0000-0000-0000000009' || lpad(g::text, 2, '0'))::uuid, '38000000-0000-0000-0000-0000000008a1',
       '20000000-0000-0000-0000-000000003801', '30000000-0000-0000-0000-000000003801', current_date + 14
  from generate_series(1, 10) g;
update public.gear_loans set status = 'approved' where id = '38000000-0000-0000-0000-000000000901';
update public.gear_loans set status = 'out' where id = '38000000-0000-0000-0000-000000000902';
begin;
set local role authenticated;
select test.as38('00000000-0000-0000-0000-000000003801');
select test.expect_error($$insert into public.gear_loans (item_id, family_id, adult_id, due_on)
                           values ('38000000-0000-0000-0000-0000000008a1', '20000000-0000-0000-0000-000000003801',
                                   '30000000-0000-0000-0000-000000003801', current_date + 14)$$, '22023',
                         'an 11th open request is refused');
select test.as38('00000000-0000-0000-0000-000000003802');
select test.expect_rows($$insert into public.gear_loans (item_id, family_id, adult_id, due_on)
                          values ('38000000-0000-0000-0000-0000000008a1', '20000000-0000-0000-0000-000000003802',
                                  '30000000-0000-0000-0000-000000003802', current_date + 14)$$, 1,
                        'another family is not affected');
rollback;
update public.gear_loans set status = 'declined' where id = '38000000-0000-0000-0000-000000000903';
update public.gear_loans set status = 'returned' where id = '38000000-0000-0000-0000-000000000902';
begin;
set local role authenticated;
select test.as38('00000000-0000-0000-0000-000000003801');
select test.expect_rows($$insert into public.gear_loans (item_id, family_id, adult_id, due_on)
                          values ('38000000-0000-0000-0000-0000000008a1', '20000000-0000-0000-0000-000000003801',
                                  '30000000-0000-0000-0000-000000003801', current_date + 14)$$, 1,
                        'declined and returned loans don''t count');
select test.expect_rows($$insert into public.gear_loans (item_id, family_id, adult_id, due_on)
                          values ('38000000-0000-0000-0000-0000000008a1', '20000000-0000-0000-0000-000000003801',
                                  '30000000-0000-0000-0000-000000003801', current_date + 14)$$, 1,
                        'so the family can ask for two more');
select test.expect_error($$insert into public.gear_loans (item_id, family_id, adult_id, due_on)
                           values ('38000000-0000-0000-0000-0000000008a1', '20000000-0000-0000-0000-000000003801',
                                   '30000000-0000-0000-0000-000000003801', current_date + 14)$$, '22023',
                         'back at 10 open, the next is refused');
rollback;
delete from public.gear_loans where item_id = '38000000-0000-0000-0000-0000000008a1';
delete from public.gear_items where id = '38000000-0000-0000-0000-0000000008a1';

-- ---------------------------------------------------------------------------
\echo '== Security fixes: help offer alerts at most once a day'
select test.check(not has_function_privilege('anon', 'public.claim_role_interest_alert(uuid)', 'execute')
                  and has_function_privilege('authenticated', 'public.claim_role_interest_alert(uuid)', 'execute'),
                  'only signed-in people can claim an alert');
select test.check(not has_table_privilege('authenticated', 'public.role_interest_alerts', 'select')
                  and not has_table_privilege('authenticated', 'public.role_interest_alerts', 'insert')
                  and not has_table_privilege('anon', 'public.role_interest_alerts', 'select'),
                  'nobody reads or writes the alert log directly');
begin;
set local role authenticated;
select test.as38('00000000-0000-0000-0000-000000003801');
select test.check(public.claim_role_interest_alert('38000000-0000-0000-0000-0000000004a1'), 'the first offer sends an alert');
select test.check(not public.claim_role_interest_alert('38000000-0000-0000-0000-0000000004a1'), 'offering again the same day does not');
select test.check(not public.claim_role_interest_alert('38000000-0000-0000-0000-0000000004a2'), 'no alert for a closed role');
select test.as38('00000000-0000-0000-0000-000000003802');
select test.check(public.claim_role_interest_alert('38000000-0000-0000-0000-0000000004a1'), 'another person''s offer sends its own alert');
select test.as38('00000000-0000-0000-0000-00000000000e');
select test.expect_error($$select public.claim_role_interest_alert('38000000-0000-0000-0000-0000000004a1')$$, '42501',
                         'someone not on the roster cannot claim one');
reset role;
update public.role_interest_alerts set sent_at = now() - interval '25 hours'
 where adult_id = '30000000-0000-0000-0000-000000003801';
set local role authenticated;
select test.as38('00000000-0000-0000-0000-000000003801');
select test.check(public.claim_role_interest_alert('38000000-0000-0000-0000-0000000004a1'), 'a day later it alerts again');
rollback;
delete from public.role_interest where role_id in ('38000000-0000-0000-0000-0000000004a1', '38000000-0000-0000-0000-0000000004a2');
delete from public.pack_roles where id in ('38000000-0000-0000-0000-0000000004a1', '38000000-0000-0000-0000-0000000004a2');

-- ---------------------------------------------------------------------------
\echo '== Security fixes: old decided join requests are purged'
select test.check(not has_function_privilege('authenticated', 'public.purge_join_requests()', 'execute')
                  and not has_function_privilege('anon', 'public.purge_join_requests()', 'execute')
                  and has_function_privilege('service_role', 'public.purge_join_requests()', 'execute'),
                  'only the daily job (secret key) can purge join requests');
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-0000000038a1', 'old.declined@example.com'),
 ('00000000-0000-0000-0000-0000000038a2', 'old.approved@example.com'),
 ('00000000-0000-0000-0000-0000000038a3', 'old.pending@example.com'),
 ('00000000-0000-0000-0000-0000000038a4', 'recent.declined@example.com'),
 ('00000000-0000-0000-0000-0000000038a5', 'old.request.recent.decision@example.com');
begin;
alter table public.join_requests disable trigger join_requests_insert;
insert into public.join_requests (id, user_id, email, first_name, last_name, status, decided_at, created_at) values
 ('38000000-0000-0000-0000-00000000aa01', '00000000-0000-0000-0000-0000000038a1', 'old.declined@example.com', 'Old', 'Declined', 'declined', now() - interval '100 days', now() - interval '120 days'),
 ('38000000-0000-0000-0000-00000000aa02', '00000000-0000-0000-0000-0000000038a2', 'old.approved@example.com', 'Old', 'Approved', 'approved', null, now() - interval '200 days'),
 ('38000000-0000-0000-0000-00000000aa03', '00000000-0000-0000-0000-0000000038a3', 'old.pending@example.com', 'Old', 'Pending', 'pending', null, now() - interval '200 days'),
 ('38000000-0000-0000-0000-00000000aa04', '00000000-0000-0000-0000-0000000038a4', 'recent.declined@example.com', 'Recent', 'Declined', 'declined', now() - interval '10 days', now() - interval '20 days'),
 ('38000000-0000-0000-0000-00000000aa05', '00000000-0000-0000-0000-0000000038a5', 'old.request.recent.decision@example.com', 'Slow', 'Decision', 'approved', now() - interval '30 days', now() - interval '150 days');
alter table public.join_requests enable trigger join_requests_insert;
set local role authenticated;
select test.as38('00000000-0000-0000-0000-00000000000d');
select test.expect_error($$select public.purge_join_requests()$$, '42501', 'even an admin cannot call the purge from the app');
reset role;
set local role service_role;
select test.check(public.purge_join_requests() = 2, 'the purge deletes the two decided requests older than 90 days');
reset role;
select test.check(not exists (select 1 from public.join_requests where id in ('38000000-0000-0000-0000-00000000aa01', '38000000-0000-0000-0000-00000000aa02')),
                  'old declined and approved requests are gone');
select test.check((select count(*) from public.join_requests where id in ('38000000-0000-0000-0000-00000000aa03', '38000000-0000-0000-0000-00000000aa04', '38000000-0000-0000-0000-00000000aa05')) = 3,
                  'pending, recently decided, and old-but-recently-decided requests stay');
rollback;
delete from auth.users where id::text like '00000000-0000-0000-0000-0000000038a%';

\echo '== SECURITY FIX TESTS PASSED'
