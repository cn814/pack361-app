-- Gear closet and Help wanted board.
-- P1 = Gale Gear (family Gear1), P2 = Hal Hike (family Gear2), Q = Quinn Quarter (committee),
-- D = Dana Den (den leader, no family).
\set QUIET on
set client_min_messages = notice;

insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-000000003601', 'gale.gear@example.com'),
 ('00000000-0000-0000-0000-000000003602', 'hal.hike@example.com'),
 ('00000000-0000-0000-0000-000000003603', 'quinn.quarter@example.com'),
 ('00000000-0000-0000-0000-000000003604', 'dana.den@example.com');
insert into public.families (id, family_name) values
 ('20000000-0000-0000-0000-000000003601', 'Gear1'),
 ('20000000-0000-0000-0000-000000003602', 'Gear2');
insert into public.adults (id, family_id, first_name, last_name, email, role, position_title) values
 ('30000000-0000-0000-0000-000000003601', '20000000-0000-0000-0000-000000003601', 'Gale', 'Gear', 'gale.gear@example.com', 'parent', null),
 ('30000000-0000-0000-0000-000000003602', '20000000-0000-0000-0000-000000003602', 'Hal', 'Hike', 'hal.hike@example.com', 'parent', null),
 ('30000000-0000-0000-0000-000000003603', null, 'Quinn', 'Quarter', 'quinn.quarter@example.com', 'committee', 'Quartermaster'),
 ('30000000-0000-0000-0000-000000003604', null, 'Dana', 'Den', 'dana.den@example.com', 'den_leader', null);
insert into public.events (id, title, category, starts_at) values
 ('36000000-0000-0000-0000-0000000000e1', 'Gear Campout', 'Campout', now() + interval '10 days');

create function test.as_user(p_sub text, p_aal text default 'aal2') returns void language sql as $$
    select set_config('request.jwt.claims', json_build_object('sub', p_sub, 'aal', p_aal)::text, true)
$$;
grant execute on function test.as_user(text, text) to authenticated, anon;

-- ---------------------------------------------------------------------------
\echo '== Gear closet: items'
begin;
set local role authenticated;
select test.as_user('00000000-0000-0000-0000-000000003601');
select test.expect_error($$insert into public.gear_items (name, category) values ('My tent', 'Tents')$$, '42501',
                         'families cannot add gear');
commit;

begin;
set local role authenticated;
select test.as_user('00000000-0000-0000-0000-000000003604');
select test.expect_rows($$insert into public.gear_items (id, name, category, quantity, description)
                          values ('36000000-0000-0000-0000-0000000000a1', '  Six-person tent ', 'Tents', 2, 'Dome tent with rain fly'),
                                 ('36000000-0000-0000-0000-0000000000a2', 'Camp stove', 'Cooking', 1, null)$$, 2,
                        'a leader adds gear');
select test.expect_error($$insert into public.gear_items (name, category) values ('Canoe', 'Boats')$$, '23514',
                         'categories are a fixed list');
insert into public.gear_items (id, name, category, quantity, active)
values ('36000000-0000-0000-0000-0000000000a3', 'Old tarp', 'Other', 1, false);
select test.check((select name from public.gear_items where id = '36000000-0000-0000-0000-0000000000a1') = 'Six-person tent',
                  'names are trimmed');
select test.check((select created_by from public.gear_items where id = '36000000-0000-0000-0000-0000000000a1')
                  = '30000000-0000-0000-0000-000000003604', 'who added it is recorded');
select test.check(test.count($$select * from public.gear_items where id::text like '36000000%'$$) = 3,
                  'leaders see put-away items too');
commit;

begin;
set local role authenticated;
select test.as_user('00000000-0000-0000-0000-000000003601');
select test.check(test.count($$select * from public.gear_items where id::text like '36000000%'$$) = 2,
                  'families see only the active items');
select test.expect_rows($$update public.gear_items set quantity = 50$$, 0, 'families cannot change items');
commit;

begin;
set local role anon;
select test.expect_error($$select * from public.gear_items$$, '42501', 'signed-out visitors cannot see the closet');
select test.expect_error($$select * from public.gear_in_use()$$, '42501', 'or what is in use');
rollback;

-- ---------------------------------------------------------------------------
\echo '== Gear closet: asking to borrow'
begin;
set local role authenticated;
select test.as_user('00000000-0000-0000-0000-000000003601');
select test.expect_rows($$insert into public.gear_loans (id, item_id, family_id, adult_id, quantity, event_id, due_on, note, status, out_at)
                          values ('36000000-0000-0000-0000-0000000000b1', '36000000-0000-0000-0000-0000000000a1',
                                  '20000000-0000-0000-0000-000000003601', '30000000-0000-0000-0000-000000003601', 1,
                                  '36000000-0000-0000-0000-0000000000e1', current_date + 12, '  For the campout ', 'out', now())$$, 1,
                        'a family asks to borrow a tent');
select test.check((select status = 'requested' and out_at is null and note = 'For the campout'
                     from public.gear_loans where id = '36000000-0000-0000-0000-0000000000b1'),
                  'a new request always starts as requested');
select test.expect_error($$insert into public.gear_loans (item_id, family_id, adult_id, quantity, due_on)
                           values ('36000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000003601',
                                   '30000000-0000-0000-0000-000000003601', 3, current_date + 5)$$, '22023',
                         'cannot ask for more than the pack has');
select test.expect_error($$insert into public.gear_loans (item_id, family_id, adult_id, due_on)
                           values ('36000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000003602',
                                   '30000000-0000-0000-0000-000000003601', current_date + 5)$$, '42501',
                         'cannot ask for another family');
select test.expect_error($$insert into public.gear_loans (item_id, family_id, adult_id, due_on)
                           values ('36000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000003601',
                                   '30000000-0000-0000-0000-000000003602', current_date + 5)$$, '42501',
                         'or as another adult');
select test.expect_error($$insert into public.gear_loans (item_id, family_id, adult_id, due_on)
                           values ('36000000-0000-0000-0000-0000000000a3', '20000000-0000-0000-0000-000000003601',
                                   '30000000-0000-0000-0000-000000003601', current_date + 5)$$, '22023',
                         'put-away items cannot be borrowed');
select test.expect_error($$insert into public.gear_loans (item_id, family_id, adult_id, needed_on, due_on)
                           values ('36000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-000000003601',
                                   '30000000-0000-0000-0000-000000003601', current_date + 5, current_date + 1)$$, '23514',
                         'the return date cannot be before the pick-up date');
insert into public.gear_loans (id, item_id, family_id, adult_id, due_on)
values ('36000000-0000-0000-0000-0000000000b3', '36000000-0000-0000-0000-0000000000a2',
        '20000000-0000-0000-0000-000000003601', '30000000-0000-0000-0000-000000003601', current_date + 3);
select test.expect_rows($$update public.gear_loans set status = 'approved'$$, 0, 'families cannot approve their own requests');
commit;

begin;
set local role authenticated;
select test.as_user('00000000-0000-0000-0000-000000003602');
insert into public.gear_loans (id, item_id, family_id, adult_id, quantity, due_on)
values ('36000000-0000-0000-0000-0000000000b2', '36000000-0000-0000-0000-0000000000a1',
        '20000000-0000-0000-0000-000000003602', '30000000-0000-0000-0000-000000003602', 2, current_date + 12);
select test.check(test.count($$select * from public.gear_loans$$) = 1, 'a family sees only its own requests');
select test.expect_rows($$delete from public.gear_loans where id = '36000000-0000-0000-0000-0000000000b1'$$, 0,
                        'and cannot cancel another family''s');
select test.check(test.count($$select * from public.gear_in_use()$$) = 0, 'requests do not hold gear yet');
commit;

-- ---------------------------------------------------------------------------
\echo '== Gear closet: leaders approve, hand out, check in'
begin;
set local role authenticated;
select test.as_user('00000000-0000-0000-0000-000000003604');
select test.check(test.count($$select * from public.gear_loans where id::text like '36000000%'$$) = 3, 'leaders see every request');
select test.expect_rows($$update public.gear_loans set status = 'approved', family_id = '20000000-0000-0000-0000-000000003602'
                          where id = '36000000-0000-0000-0000-0000000000b1'$$, 1, 'a leader approves a request');
select test.check((select family_id = '20000000-0000-0000-0000-000000003601'
                          and decided_by = '30000000-0000-0000-0000-000000003604' and decided_at is not null
                     from public.gear_loans where id = '36000000-0000-0000-0000-0000000000b1'),
                  'who decided is recorded, and the family cannot be changed');
select test.check((select in_use from public.gear_in_use() where item_id = '36000000-0000-0000-0000-0000000000a1') = 1,
                  'an approved loan holds the gear');
select test.expect_error($$update public.gear_loans set status = 'approved' where id = '36000000-0000-0000-0000-0000000000b2'$$, '22023',
                         'cannot approve more than is left');
select test.expect_rows($$update public.gear_loans set status = 'declined', leader_note = 'Both tents are taken that weekend'
                          where id = '36000000-0000-0000-0000-0000000000b2'$$, 1, 'a leader declines a request');
select test.expect_rows($$update public.gear_loans set status = 'out' where id = '36000000-0000-0000-0000-0000000000b1'$$, 1,
                        'a leader hands the gear out');
select test.check((select out_at is not null from public.gear_loans where id = '36000000-0000-0000-0000-0000000000b1'),
                  'when it went out is recorded');
update public.gear_items set quantity = 0 where id = '36000000-0000-0000-0000-0000000000a1';
select test.expect_rows($$update public.gear_loans set reminded_at = now() where id = '36000000-0000-0000-0000-0000000000b1'$$, 1,
                        'a loan can still be updated after the closet count goes down');
update public.gear_items set quantity = 2 where id = '36000000-0000-0000-0000-0000000000a1';
update public.gear_loans set due_on = current_date + 20 where id = '36000000-0000-0000-0000-0000000000b1';
select test.check((select reminded_at is null from public.gear_loans where id = '36000000-0000-0000-0000-0000000000b1'),
                  'a new return date starts the reminders over');
commit;

begin;
set local role authenticated;
select test.as_user('00000000-0000-0000-0000-000000003601');
select test.expect_rows($$delete from public.gear_loans where id = '36000000-0000-0000-0000-0000000000b1'$$, 0,
                        'a family cannot cancel gear already picked up');
select test.expect_rows($$delete from public.gear_loans where id = '36000000-0000-0000-0000-0000000000b3'$$, 1,
                        'a family cancels a request that is still waiting');
commit;

begin;
set local role authenticated;
select test.as_user('00000000-0000-0000-0000-000000003604');
select test.expect_rows($$update public.gear_loans set status = 'returned' where id = '36000000-0000-0000-0000-0000000000b1'$$, 1,
                        'a leader checks the gear back in');
select test.check((select returned_at is not null from public.gear_loans where id = '36000000-0000-0000-0000-0000000000b1'),
                  'when it came back is recorded');
select test.check(test.count($$select * from public.gear_in_use() where item_id = '36000000-0000-0000-0000-0000000000a1'$$) = 0,
                  'returned gear is free again');
select test.expect_rows($$delete from public.gear_loans where id = '36000000-0000-0000-0000-0000000000b2'$$, 0,
                        'den leaders cannot delete loan history');
commit;

-- ---------------------------------------------------------------------------
\echo '== Help wanted: roles'
begin;
set local role authenticated;
select test.as_user('00000000-0000-0000-0000-000000003601');
select test.expect_error($$insert into public.pack_roles (title) values ('Me')$$, '42501', 'families cannot add roles');
commit;

begin;
set local role authenticated;
select test.as_user('00000000-0000-0000-0000-000000003604');
select test.expect_error($$insert into public.pack_roles (title) values ('Popcorn kernel')$$, '42501',
                         'den leaders cannot add roles');
commit;

begin;
set local role authenticated;
select test.as_user('00000000-0000-0000-0000-000000003603', 'aal1');
select test.expect_error($$insert into public.pack_roles (title) values ('Popcorn kernel')$$, '42501',
                         'committee needs the two-step code to add roles');
commit;

begin;
set local role authenticated;
select test.as_user('00000000-0000-0000-0000-000000003603');
select test.expect_rows($$insert into public.pack_roles (id, title, description, contact_adult_id, sort_order)
                          values ('36000000-0000-0000-0000-0000000000c1', ' Popcorn kernel ', 'Runs the fall popcorn sale',
                                  '30000000-0000-0000-0000-000000003603', 1),
                                 ('36000000-0000-0000-0000-0000000000c2', 'Blue and Gold chair', null, null, 2)$$, 2,
                        'committee adds roles');
insert into public.pack_roles (id, title, open) values ('36000000-0000-0000-0000-0000000000c3', 'Old job', false);
select test.check((select title = 'Popcorn kernel' and created_by = '30000000-0000-0000-0000-000000003603'
                     from public.pack_roles where id = '36000000-0000-0000-0000-0000000000c1'),
                  'titles are trimmed and the author recorded');
select test.check((select closed_at is not null from public.pack_roles where id = '36000000-0000-0000-0000-0000000000c3'),
                  'a closed role has a closed date');
commit;

begin;
set local role authenticated;
select test.as_user('00000000-0000-0000-0000-000000003601');
select test.check(test.count($$select * from public.pack_roles where id::text like '36000000%'$$) = 2,
                  'families see only open roles');
select test.check((select contact_name = 'Quinn Quarter' and contact_title = 'Quartermaster' and not offered
                     from public.help_wanted_roles() where id = '36000000-0000-0000-0000-0000000000c1'),
                  'the open list shows the contact''s name and position');
select test.expect_rows($$update public.pack_roles set open = false$$, 0, 'families cannot close roles');
select test.expect_rows($$insert into public.role_interest (role_id, adult_id, note)
                          values ('36000000-0000-0000-0000-0000000000c1', '30000000-0000-0000-0000-000000003601', 'Did it last year')$$, 1,
                        'a parent offers to help');
select test.check((select offered from public.help_wanted_roles() where id = '36000000-0000-0000-0000-0000000000c1'),
                  'and the list shows they offered');
select test.expect_error($$insert into public.role_interest (role_id, adult_id)
                           values ('36000000-0000-0000-0000-0000000000c1', '30000000-0000-0000-0000-000000003601')$$, '23505',
                         'one offer per role');
select test.expect_error($$insert into public.role_interest (role_id, adult_id)
                           values ('36000000-0000-0000-0000-0000000000c3', '30000000-0000-0000-0000-000000003601')$$, '42501',
                         'not for a closed role');
select test.expect_error($$insert into public.role_interest (role_id, adult_id)
                           values ('36000000-0000-0000-0000-0000000000c2', '30000000-0000-0000-0000-000000003602')$$, '42501',
                         'not on someone else''s behalf');
commit;

begin;
set local role authenticated;
select test.as_user('00000000-0000-0000-0000-000000003602');
select test.check(test.count($$select * from public.role_interest$$) = 0, 'families cannot see who else offered');
select test.check(test.count($$select * from public.volunteer_load('2026-07-01', '2027-06-30')$$) = 0,
                  'families cannot see the volunteer summary');
commit;

begin;
set local role anon;
select test.expect_error($$select * from public.help_wanted_roles()$$, '42501', 'signed-out visitors cannot see roles');
rollback;

-- ---------------------------------------------------------------------------
\echo '== Help wanted: committee'
insert into public.volunteer_slots (id, event_id, role_title, capacity)
values ('36000000-0000-0000-0000-0000000000d1', '36000000-0000-0000-0000-0000000000e1', 'Cook', 5);
insert into public.volunteer_signups (slot_id, adult_id) values
 ('36000000-0000-0000-0000-0000000000d1', '30000000-0000-0000-0000-000000003601'),
 ('36000000-0000-0000-0000-0000000000d1', '30000000-0000-0000-0000-000000003604');

begin;
set local role authenticated;
select test.as_user('00000000-0000-0000-0000-000000003603');
select test.check(test.count($$select * from public.role_interest where role_id = '36000000-0000-0000-0000-0000000000c1'$$) = 1,
                  'committee sees who offered');
select test.expect_rows($$update public.pack_roles set open = false, filled_by = '30000000-0000-0000-0000-000000003601'
                          where id = '36000000-0000-0000-0000-0000000000c1'$$, 1, 'committee closes a filled role');
select test.check((select closed_at is not null from public.pack_roles where id = '36000000-0000-0000-0000-0000000000c1'),
                  'closing stamps the date');
select test.check((select signups from public.volunteer_load(current_date - 30, current_date + 300)
                    where family_id = '20000000-0000-0000-0000-000000003601') = 1,
                  'the volunteer summary counts a family''s sign-ups');
select test.check((select signups from public.volunteer_load(current_date - 30, current_date + 300)
                    where family_id = '20000000-0000-0000-0000-000000003602') = 0,
                  'and lists families with none');
select test.check((select signups from public.volunteer_load(current_date - 30, current_date + 300)
                    where family_name = 'Dana Den' and family_id is null) = 1,
                  'leaders with no family are listed by name');
select test.check((select signups from public.volunteer_load(current_date + 30, current_date + 300)
                    where family_id = '20000000-0000-0000-0000-000000003601') = 0,
                  'sign-ups outside the season do not count');
commit;

begin;
set local role authenticated;
select test.as_user('00000000-0000-0000-0000-000000003604');
select test.check(test.count($$select * from public.volunteer_load(current_date - 30, current_date + 300)$$) = 0,
                  'den leaders do not see the volunteer summary');
commit;

begin;
set local role authenticated;
select test.as_user('00000000-0000-0000-0000-000000003601');
select test.check(test.count($$select * from public.help_wanted_roles() where id = '36000000-0000-0000-0000-0000000000c1'$$) = 0,
                  'a closed role leaves the open list');
select test.check(test.count($$select * from public.role_interest$$) = 1, 'a parent still sees their own offer');
commit;

-- Tidy up so later test files start clean.
delete from public.volunteer_signups where slot_id = '36000000-0000-0000-0000-0000000000d1';
delete from public.volunteer_slots where id = '36000000-0000-0000-0000-0000000000d1';
delete from public.pack_roles where id::text like '36000000%';
delete from public.gear_loans where id::text like '36000000%';
delete from public.gear_items where id::text like '36000000%';
delete from public.events where id = '36000000-0000-0000-0000-0000000000e1';
drop function test.as_user(text, text);

\echo '== GEAR AND HELP WANTED TESTS PASSED'
