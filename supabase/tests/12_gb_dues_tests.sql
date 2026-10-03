-- Pack dues paid on Givebutter: settings, the dues setup shortcut, matching orders to families and
-- scouts, "not dues", reopening, and who can read dues orders.
-- New fixtures (all made up): K = Casey Committee (committee, no family), P = Pat Parker (Parker
-- family: Ana, then Ben), Q = Quin Quill (Quill family: Cal), R = Rae Rowe (Rowe family: Dee, then
-- Eve). From 01_rls_tests: C = Lee Leader (den leader, not committee).
-- Uses season 2030-31 so earlier files' dues don't get in the way.
\set QUIET on
set client_min_messages = notice;

insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-0000000000e1', 'casey.committee@example.com'),
 ('00000000-0000-0000-0000-0000000000e2', 'pat.parker@example.com'),
 ('00000000-0000-0000-0000-0000000000e3', 'quin.quill@example.com');

insert into public.families (id, family_name) values
 ('20000000-0000-0000-0000-0000000000e1', 'Parker'),
 ('20000000-0000-0000-0000-0000000000e2', 'Quill'),
 ('20000000-0000-0000-0000-0000000000e3', 'Rowe');

insert into public.adults (id, family_id, first_name, last_name, email, role) values
 ('30000000-0000-0000-0000-0000000000e1', null, 'Casey', 'Committee', 'casey.committee@example.com', 'committee'),
 ('30000000-0000-0000-0000-0000000000e2', '20000000-0000-0000-0000-0000000000e1', 'Pat', 'Parker', 'pat.parker@example.com', 'parent'),
 ('30000000-0000-0000-0000-0000000000e3', '20000000-0000-0000-0000-0000000000e2', 'Quin', 'Quill', 'quin.quill@example.com', 'parent'),
 ('30000000-0000-0000-0000-0000000000e4', '20000000-0000-0000-0000-0000000000e3', 'Rae', 'Rowe', 'rae.rowe@example.com', 'parent');

insert into public.scouts (id, family_id, first_name, last_name, created_at) values
 ('40000000-0000-0000-0000-0000000000e1', '20000000-0000-0000-0000-0000000000e1', 'Ana', 'Parker', '2026-01-01'),
 ('40000000-0000-0000-0000-0000000000e2', '20000000-0000-0000-0000-0000000000e1', 'Ben', 'Parker', '2026-01-02'),
 ('40000000-0000-0000-0000-0000000000e3', '20000000-0000-0000-0000-0000000000e2', 'Cal', 'Quill', '2026-01-01'),
 ('40000000-0000-0000-0000-0000000000e4', '20000000-0000-0000-0000-0000000000e3', 'Dee', 'Rowe', '2026-01-01'),
 ('40000000-0000-0000-0000-0000000000e5', '20000000-0000-0000-0000-0000000000e3', 'Eve', 'Rowe', '2026-01-02');

insert into public.givebutter_campaigns (id, title, url, type) values
 (900001, 'Pack Dues for 2026', 'https://givebutter.com/example-dues', 'donation'),
 (900002, 'Fall Campout 2026', null, 'event');

insert into public.givebutter_orders (id, campaign_id, family_id, name, email, amount, status, created_at) values
 (9001, 900001, '20000000-0000-0000-0000-0000000000e1', 'Pat Parker', 'pat.parker@example.com', 510, 'succeeded', '2026-09-15 12:00-04'),
 (9002, 900001, null, 'Grandparent', 'someone@example.com', 255, 'succeeded', '2026-09-16 12:00-04'),
 (9003, 900001, null, 'Kind Donor', 'donor@example.com', 50, 'succeeded', '2026-09-17 12:00-04'),
 (9004, 900002, '20000000-0000-0000-0000-0000000000e2', 'Quin Quill', 'quin.quill@example.com', 35, 'succeeded', '2026-09-18 12:00-04'),
 (9006, 900001, '20000000-0000-0000-0000-0000000000e3', 'Rae Rowe', 'rae.rowe@example.com', 510, 'succeeded', '2026-09-19 12:00-04');

insert into public.pack_settings (key, value) values ('dues_season', '2030-31'), ('dues_amount_cents', '25500'),
                                                     ('dues_sibling_discount_cents', '1000')
on conflict (key) do update set value = excluded.value;

-- The Quill family already has one dues charge for the whole family this season.
insert into public.charges (id, family_id, kind, title, season, amount_cents) values
 ('8c000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-0000000000e2', 'dues', 'Pack dues 2030-31', '2030-31', 25500);

-- ---------------------------------------------------------------------------
\echo '== Givebutter dues: paid_via'
select test.check((select pg_get_constraintdef(oid) from pg_constraint where conname = 'charges_paid_via_check') like '%givebutter%',
                  'paid_via allows givebutter');
begin;
select test.expect_rows($$insert into public.charges (family_id, kind, title, amount_cents, status, paid_via)
                          values ('20000000-0000-0000-0000-0000000000e1', 'other', 'x', 100, 'paid', 'givebutter')$$, 1,
                        'a charge can be paid via givebutter');
select test.expect_error($$insert into public.charges (family_id, kind, title, amount_cents, status, paid_via)
                           values ('20000000-0000-0000-0000-0000000000e1', 'other', 'x', 100, 'paid', 'venmo')$$, '23514',
                         'paid_via still rejects anything else');
rollback;

-- ---------------------------------------------------------------------------
\echo '== Givebutter dues: settings'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e2","aal":"aal2"}', true);
select test.expect_error($$select public.save_pay_settings('{"dues_givebutter_campaign_id": "900001"}')$$, '42501',
                         'parents cannot pick the dues campaign');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);
select test.expect_error($$select public.save_pay_settings('{"dues_sibling_discount_cents": "0"}')$$, '42501',
                         'den leaders off the committee cannot change the sibling discount');
rollback;

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1","aal":"aal2"}', false);
select public.save_pay_settings('{"dues_givebutter_campaign_id": "900001", "dues_sibling_discount_cents": "1000"}');
select test.check((select value from public.pack_settings where key = 'dues_givebutter_campaign_id') = '900001',
                  'committee picks the dues campaign');
select test.check((select value from public.pack_settings where key = 'dues_sibling_discount_cents') = '1000',
                  'committee saves the sibling discount');
select test.expect_error($$select public.save_pay_settings('{"dues_givebutter_campaign_id": "123"}')$$, '22023',
                         'only a synced campaign can be the dues campaign');
select test.expect_error($$select public.save_pay_settings('{"dues_givebutter_campaign_id": "abc"}')$$, '22023',
                         'campaign id must be a number');
select test.expect_error($$select public.save_pay_settings('{"dues_sibling_discount_cents": "-5"}')$$, '22023',
                         'sibling discount must be an amount');
select test.expect_error($$select public.save_pay_settings('{"awards_tracked_from": "2020-01-01"}')$$, '22023',
                         'whitelist still refuses other settings');
reset role;
select set_config('request.jwt.claims', '', false);

-- ---------------------------------------------------------------------------
\echo '== Givebutter dues: who reads dues orders'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e2","aal":"aal2"}', true);
select test.check(test.count('select * from public.givebutter_orders where id >= 9001') = 1, 'a family reads only its own orders');
select test.expect_error($$update public.givebutter_orders set dues_match = 'matched'$$, '42501', 'families cannot change orders');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e3","aal":"aal2"}', true);
select test.check(test.count('select * from public.givebutter_orders where id >= 9001') = 1
                  and test.count('select * from public.givebutter_orders where id = 9004') = 1, 'other family reads only its own order');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);
select test.check(test.count('select * from public.givebutter_orders where campaign_id = 900001') = 0,
                  'den leaders off the committee don''t see who paid dues');
select test.check(test.count('select * from public.givebutter_orders where campaign_id = 900002') = 1,
                  'den leaders still see event sign-ups');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1","aal":"aal2"}', true);
select test.check(test.count('select * from public.givebutter_orders where id >= 9001') = 5, 'committee reads every order');
rollback;

-- ---------------------------------------------------------------------------
\echo '== Givebutter dues: dues setup shortcut'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e2","aal":"aal2"}', true);
select test.expect_error('select * from public.add_dues_charges(null)', '42501', 'parents cannot set up dues');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);
select test.expect_error('select * from public.add_dues_charges(null)', '42501', 'den leaders off the committee cannot set up dues');
rollback;

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1","aal":"aal2"}', false);
select test.check((select added from public.add_dues_charges('2030-10-31')) >= 4, 'committee sets up dues');
select test.check((select amount_cents from public.charges where scout_id = '40000000-0000-0000-0000-0000000000e1' and season = '2030-31') = 25500,
                  'first scout in a family pays full dues');
select test.check((select amount_cents from public.charges where scout_id = '40000000-0000-0000-0000-0000000000e2' and season = '2030-31') = 24500,
                  'second scout gets the sibling discount');
select test.check((select title from public.charges where scout_id = '40000000-0000-0000-0000-0000000000e2' and season = '2030-31') = 'Pack dues 2030-31 – Ben',
                  'dues are titled per scout');
select test.check((select due_on from public.charges where scout_id = '40000000-0000-0000-0000-0000000000e4' and season = '2030-31') = '2030-10-31',
                  'due date is set');
select test.check(not exists (select 1 from public.charges where scout_id = '40000000-0000-0000-0000-0000000000e3' and season = '2030-31'),
                  'a family with one dues charge for the whole family is skipped');
select test.check((select added from public.add_dues_charges(null)) = 0, 'running it again adds nothing');
reset role;
select set_config('request.jwt.claims', '', false);

-- ---------------------------------------------------------------------------
\echo '== Givebutter dues: the sync applies a matched order'
-- Ben's dues were waived before the payment came in: it must stay waived.
update public.charges set status = 'waived' where scout_id = '40000000-0000-0000-0000-0000000000e2' and season = '2030-31';
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1","aal":"aal2"}', true);
select test.expect_error($$select public.apply_givebutter_dues(9001, '20000000-0000-0000-0000-0000000000e1', '{}', 'matched', 'x')$$, '42501',
                         'only the server applies orders');
rollback;

set role service_role;
select test.check(public.apply_givebutter_dues(9006, '20000000-0000-0000-0000-0000000000e3',
                    array['40000000-0000-0000-0000-0000000000e5', '40000000-0000-0000-0000-0000000000e4']::uuid[], 'matched', '2 of 2 scouts matched') = 'matched',
                  'sync applies a two-scout order at full price ($510; the $10 sibling discount is optional)');
select test.check((select paid_amount_cents from public.charges where scout_id = '40000000-0000-0000-0000-0000000000e4' and season = '2030-31') = 25500
                  and (select paid_amount_cents from public.charges where scout_id = '40000000-0000-0000-0000-0000000000e5' and season = '2030-31') = 25500,
                  'skipping the discount puts the extra on the second scout''s dues');
select test.check((select sum(paid_amount_cents) from public.charges where givebutter_order_id = 9006) = 51000, 'paid totals match what came in');
select test.check((select bool_and(status = 'paid' and paid_via = 'givebutter' and paid_at = '2026-09-19 12:00-04')
                     from public.charges where givebutter_order_id = 9006), 'charges are paid on Givebutter on the order date');
select test.check((select dues_match = 'matched' and dues_note = '2 of 2 scouts matched; full price, no sibling discount' and dues_applied_at is not null
                          and cardinality(matched_scout_ids) = 2 from public.givebutter_orders where id = 9006), 'order records the match at full price');

select test.check(public.apply_givebutter_dues(9001, '20000000-0000-0000-0000-0000000000e1',
                    array['40000000-0000-0000-0000-0000000000e1', '40000000-0000-0000-0000-0000000000e2']::uuid[], 'matched', '2 of 2 scouts matched') = 'partial',
                  'sync applies an order with a waived scout');
select test.check((select status from public.charges where scout_id = '40000000-0000-0000-0000-0000000000e2' and season = '2030-31') = 'waived',
                  'waived dues are never touched');
select test.check((select paid_amount_cents from public.charges where scout_id = '40000000-0000-0000-0000-0000000000e1' and season = '2030-31') = 25500,
                  'the scout still due is paid at their own amount, not the whole order');
select test.check((select dues_note from public.givebutter_orders where id = 9001) like 'Paid $255 more than was due%',
                  'the extra $255 is flagged');
select test.check(public.apply_givebutter_dues(9001, '20000000-0000-0000-0000-0000000000e1',
                    array['40000000-0000-0000-0000-0000000000e1']::uuid[], 'matched', 'again') = 'already', 'an order is applied once');
select test.expect_error($$select public.apply_givebutter_dues(9004, '20000000-0000-0000-0000-0000000000e2',
                           array['40000000-0000-0000-0000-0000000000e3']::uuid[], 'matched', 'x')$$, '22023', 'only dues orders are applied');

select test.check(public.apply_givebutter_dues(9003, null, '{}', 'needs_review', 'No email matched a pack family') = 'needs_review',
                  'an order with no family is left for review');
select test.check((select dues_match = 'needs_review' and dues_applied_at is null from public.givebutter_orders where id = 9003),
                  'needs review stays open for the next sync');
select test.check(public.apply_givebutter_dues(9002, '20000000-0000-0000-0000-0000000000e2',
                    array['40000000-0000-0000-0000-0000000000e1']::uuid[], 'matched', 'x') = 'needs_review',
                  'a scout from another family doesn''t count');
reset role;

-- ---------------------------------------------------------------------------
\echo '== Givebutter dues: reopen'
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1","aal":"aal2"}', false);
select test.check(public.update_charges(array(select id from public.charges where scout_id = '40000000-0000-0000-0000-0000000000e1' and season = '2030-31'),
                                        'reopen', null, null) = 1, 'committee reopens a Givebutter payment');
select test.check((select status = 'open' and paid_via is null and givebutter_order_id is null from public.charges
                    where scout_id = '40000000-0000-0000-0000-0000000000e1' and season = '2030-31'), 'reopened charge is due again');
reset role;
select set_config('request.jwt.claims', '', false);
set role service_role;
select test.check(public.apply_givebutter_dues(9001, '20000000-0000-0000-0000-0000000000e1',
                    array['40000000-0000-0000-0000-0000000000e1']::uuid[], 'matched', 'x') = 'already', 'the sync doesn''t mark it paid again');
select test.check((select status from public.charges where scout_id = '40000000-0000-0000-0000-0000000000e1' and season = '2030-31') = 'open',
                  'reopened charge stays open');
reset role;
insert into public.charges (id, family_id, kind, title, amount_cents, status, paid_via, paid_at, paid_amount_cents)
values ('8c000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-0000000000e1', 'other', 'Paid by PayPal', 1000, 'paid', 'paypal', now(), 1000);
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1","aal":"aal2"}', false);
select test.check(public.update_charges(array['8c000000-0000-0000-0000-000000000002']::uuid[], 'reopen', null, null) = 0,
                  'PayPal payments still can''t be reopened');
reset role;
select set_config('request.jwt.claims', '', false);

-- ---------------------------------------------------------------------------
\echo '== Givebutter dues: committee matches by hand'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e3","aal":"aal2"}', true);
select test.expect_error($$select public.match_givebutter_dues(9002, '20000000-0000-0000-0000-0000000000e2',
                           array['40000000-0000-0000-0000-0000000000e3']::uuid[])$$, '42501', 'parents cannot match orders');
select test.expect_error($$select public.set_givebutter_not_dues(9003, true)$$, '42501', 'parents cannot mark orders not dues');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);
select test.expect_error($$select public.match_givebutter_dues(9002, '20000000-0000-0000-0000-0000000000e2',
                           array['40000000-0000-0000-0000-0000000000e3']::uuid[])$$, '42501', 'den leaders off the committee cannot match orders');
rollback;

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1","aal":"aal2"}', false);
select test.expect_error($$select public.match_givebutter_dues(9002, '20000000-0000-0000-0000-0000000000e2',
                           array['40000000-0000-0000-0000-0000000000e1']::uuid[])$$, '22023', 'scouts must be in the picked family');
select test.expect_error($$select public.match_givebutter_dues(9004, '20000000-0000-0000-0000-0000000000e2',
                           array['40000000-0000-0000-0000-0000000000e3']::uuid[])$$, '22023', 'only dues orders can be matched');
select test.check(public.match_givebutter_dues(9002, '20000000-0000-0000-0000-0000000000e2',
                    array['40000000-0000-0000-0000-0000000000e3']::uuid[]) = 'matched', 'committee matches an order by hand');
select test.check((select amount_cents = 25500 and paid_amount_cents = 25500 and status = 'paid' and paid_via = 'givebutter'
                     from public.charges where scout_id = '40000000-0000-0000-0000-0000000000e3' and season = '2030-31'),
                  'the scout''s dues are added and marked paid');
select test.check((select status = 'paid' and paid_amount_cents = 0 and givebutter_order_id = 9002
                     from public.charges where id = '8c000000-0000-0000-0000-000000000001'), 'the family''s whole-family dues are marked paid too');
select test.check((select family_id = '20000000-0000-0000-0000-0000000000e2' and dues_match = 'matched'
                     from public.givebutter_orders where id = 9002), 'order is placed with the family');
select test.expect_error($$select public.match_givebutter_dues(9002, '20000000-0000-0000-0000-0000000000e2',
                           array['40000000-0000-0000-0000-0000000000e3']::uuid[])$$, '22023', 'an order can''t be matched twice');

select test.check(public.set_givebutter_not_dues(9003, true) = 1, 'committee marks a donation as not dues');
select test.check((select dues_match = 'not_dues' and dues_applied_at is not null from public.givebutter_orders where id = 9003),
                  'not dues is done');
select test.check(public.set_givebutter_not_dues(9002, true) = 0, 'a matched order can''t be marked not dues');
reset role;
select set_config('request.jwt.claims', '', false);
set role service_role;
select test.check(public.apply_givebutter_dues(9003, null, '{}', 'needs_review', 'x') = 'already', 'the sync leaves not-dues orders alone');
reset role;
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1","aal":"aal2"}', false);
select test.check(public.set_givebutter_not_dues(9003, false) = 1, 'committee can undo not dues');
select test.check((select dues_applied_at is null and dues_match is null from public.givebutter_orders where id = 9003),
                  'undone, the next sync looks at it again');
reset role;
select set_config('request.jwt.claims', '', false);

-- Families see their own dues order once it's placed with them.
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e3","aal":"aal2"}', true);
select test.check(test.count('select * from public.givebutter_orders where id = 9002') = 1, 'a family sees the dues order matched to it');
rollback;

\echo '== GIVEBUTTER DUES TESTS PASSED'
