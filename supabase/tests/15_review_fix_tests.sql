-- Review fixes (20261003000100_review_db_fixes.sql): RSVP charges vs committee fees, Givebutter
-- dues amounts, who sets event prices, deleted RSVPs, direct writes to charges, reopening next to
-- an open twin, malformed den meeting skips, returned requirements and multi-adventure edits.
-- From 01_rls_tests: A = Alex Smith (family 1), B = Blair Jones (family 2: Jo), C = Lee Leader
-- (Bear den leader, not committee), D = Morgan Admin (committee and up).
-- From 12_gb_dues_tests: dues campaign 900001, season 2030-31, $255 dues, $10 sibling discount.
\set QUIET on
set client_min_messages = notice;

insert into public.events (id, title, category, starts_at, rsvp_enabled, fee_family_cents, fee_scout_cents, fee_adult_cents) values
 ('5f000000-0000-0000-0000-000000000001', 'Ice Skating', 'Outing', now() + interval '30 days', true, 1000, null, null),
 ('5f000000-0000-0000-0000-000000000002', 'Pinewood Derby', 'Pack meeting', now() + interval '30 days', true, 800, null, null),
 ('5f000000-0000-0000-0000-000000000003', 'Bowling', 'Outing', now() + interval '30 days', true, 1200, null, null);

-- ---------------------------------------------------------------------------
\echo '== Review fixes 1: RSVP answers leave committee fees alone'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","aal":"aal2"}', true);   -- Morgan
select test.check((select added from public.add_fee('event', 'Skate rental', null, '5f000000-0000-0000-0000-000000000001', 500, null,
                                                    'family', '20000000-0000-0000-0000-000000000001')) = 1,
                  'committee adds a per-family fee for the event');
select test.check((select source from public.charges where event_id = '5f000000-0000-0000-0000-000000000001') = 'manual',
                  'a committee fee is marked manual');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal2"}', true);   -- Alex
select public.set_rsvp('5f000000-0000-0000-0000-000000000001', 'yes', 1, 1, null);
select test.check(test.count($$select * from public.charges where event_id = '5f000000-0000-0000-0000-000000000001' and status = 'open'$$) = 2,
                  'answering yes adds the RSVP charge next to the committee fee');
select test.check((select amount_cents || '/' || title from public.charges
                    where event_id = '5f000000-0000-0000-0000-000000000001' and source = 'manual') = '500/Skate rental',
                  'the committee fee is not repriced by the RSVP');
select test.check((select amount_cents from public.charges
                    where event_id = '5f000000-0000-0000-0000-000000000001' and source = 'rsvp' and status = 'open') = 1000,
                  'the RSVP charge is the event price');
select public.set_rsvp('5f000000-0000-0000-0000-000000000001', 'no', 0, 0, null);
select test.check((select status from public.charges where event_id = '5f000000-0000-0000-0000-000000000001' and source = 'manual') = 'open',
                  'answering no does not cancel the committee fee');
select test.check(test.count($$select * from public.charges where event_id = '5f000000-0000-0000-0000-000000000001'
                                and source = 'rsvp' and status = 'open'$$) = 0, 'answering no cancels only the RSVP charge');
select public.set_rsvp('5f000000-0000-0000-0000-000000000001', 'yes', 1, 1, null);
select test.check(test.count($$select * from public.charges where event_id = '5f000000-0000-0000-0000-000000000001' and status = 'open'$$) = 2,
                  'yes again: one RSVP charge and the committee fee');
-- A checkout on the committee fee ends: it is not treated as the RSVP charge.
reset role;
select set_config('request.jwt.claims', '', true);
insert into public.payments (id, family_id, charge_ids, charge_cents, amount_cents, provider_order_id)
select '8f000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', array[id], array[amount_cents], amount_cents, 'ORDER-REVIEW-1'
  from public.charges where event_id = '5f000000-0000-0000-0000-000000000001' and source = 'manual';
update public.charges set pending_payment_id = '8f000000-0000-0000-0000-000000000001', pending_since = now()
 where event_id = '5f000000-0000-0000-0000-000000000001' and source = 'manual';
update public.events set fee_family_cents = 1500 where id = '5f000000-0000-0000-0000-000000000001';
update public.payments set status = 'canceled' where id = '8f000000-0000-0000-0000-000000000001';
select test.check((select status || '/' || amount_cents from public.charges
                    where event_id = '5f000000-0000-0000-0000-000000000001' and source = 'manual') = 'open/500',
                  'releasing a checkout leaves the committee fee as it was');
select test.check((select pending_payment_id from public.charges
                    where event_id = '5f000000-0000-0000-0000-000000000001' and source = 'manual') is null,
                  'and lets go of it');
select test.check((select pg_get_indexdef('public.charges_event_key'::regclass)) like '%source%',
                  'the event key includes where the charge came from');
rollback;

-- ---------------------------------------------------------------------------
\echo '== Review fixes 2: Givebutter dues pay only what the order covers'
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f1', 'fran.fox@example.com');
insert into public.families (id, family_name) values ('20000000-0000-0000-0000-0000000000f1', 'Fox');
insert into public.adults (id, family_id, first_name, last_name, email, role) values
 ('30000000-0000-0000-0000-0000000000f1', '20000000-0000-0000-0000-0000000000f1', 'Fran', 'Fox', 'fran.fox@example.com', 'parent');
insert into public.scouts (id, family_id, first_name, last_name, created_at) values
 ('40000000-0000-0000-0000-0000000000f1', '20000000-0000-0000-0000-0000000000f1', 'Fin', 'Fox', '2026-01-01'),
 ('40000000-0000-0000-0000-0000000000f2', '20000000-0000-0000-0000-0000000000f1', 'Gus', 'Fox', '2026-01-02'),
 ('40000000-0000-0000-0000-0000000000f3', '20000000-0000-0000-0000-0000000000f1', 'Hal', 'Fox', '2026-01-03');
insert into public.charges (id, family_id, scout_id, kind, title, season, amount_cents) values
 ('8f000000-0000-0000-0000-0000000000f1', '20000000-0000-0000-0000-0000000000f1', '40000000-0000-0000-0000-0000000000f1', 'dues', 'Pack dues 2030-31 – Fin', '2030-31', 25500),
 ('8f000000-0000-0000-0000-0000000000f2', '20000000-0000-0000-0000-0000000000f1', '40000000-0000-0000-0000-0000000000f2', 'dues', 'Pack dues 2030-31 – Gus', '2030-31', 24500);
insert into public.givebutter_orders (id, campaign_id, family_id, name, email, amount, status, created_at) values
 (9101, 900001, '20000000-0000-0000-0000-0000000000f1', 'Fran Fox', 'fran.fox@example.com', 255, 'succeeded', '2026-09-20 12:00-04'),
 (9102, 900001, '20000000-0000-0000-0000-0000000000f1', 'Fran Fox', 'fran.fox@example.com', 510, 'succeeded', '2026-09-21 12:00-04'),
 (9103, 900001, '20000000-0000-0000-0000-0000000000f1', 'Fran Fox', 'fran.fox@example.com', 510, 'succeeded', '2026-09-22 12:00-04'),
 (9104, 900001, '20000000-0000-0000-0000-0000000000f1', 'Fran Fox', 'fran.fox@example.com', 300, 'succeeded', '2026-09-23 12:00-04');

set role service_role;
-- (a) $255 for two scouts who owe $500: nothing is marked paid.
select test.check(public.apply_givebutter_dues(9101, '20000000-0000-0000-0000-0000000000f1',
                    array['40000000-0000-0000-0000-0000000000f1', '40000000-0000-0000-0000-0000000000f2']::uuid[], 'matched', '2 of 2 scouts matched') = 'partial',
                  'a short order is flagged partial');
select test.check(test.count($$select * from public.charges where family_id = '20000000-0000-0000-0000-0000000000f1' and status = 'open'$$) = 2,
                  'a short order marks nothing paid');
select test.check((select dues_match = 'partial' and dues_note = 'Paid $255; $500 was due' and dues_applied_at is null
                     from public.givebutter_orders where id = 9101), 'it says what was paid and what was due, and waits for a leader');
reset role;

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","aal":"aal2"}', false);   -- Morgan
select test.expect_error($$select public.match_givebutter_dues(9101, '20000000-0000-0000-0000-0000000000f1',
                           array['40000000-0000-0000-0000-0000000000f1', '40000000-0000-0000-0000-0000000000f2']::uuid[])$$, '22023',
                         'matching a short order by hand to both scouts is refused');
select test.check(test.count($$select * from public.charges where family_id = '20000000-0000-0000-0000-0000000000f1' and status = 'open'$$) = 2,
                  'and changes nothing');
-- (b) Fin's dues are paid by check; a $510 order then covers only Gus's $245.
select test.check(public.update_charges(array['8f000000-0000-0000-0000-0000000000f1']::uuid[], 'paid', 'check', null) = 1, 'Fin paid by check');
reset role;
select set_config('request.jwt.claims', '', false);
set role service_role;
select test.check(public.apply_givebutter_dues(9102, '20000000-0000-0000-0000-0000000000f1',
                    array['40000000-0000-0000-0000-0000000000f1', '40000000-0000-0000-0000-0000000000f2']::uuid[], 'matched', '2 of 2 scouts matched') = 'partial',
                  'an order for more than is due is flagged partial');
select test.check((select status || '/' || paid_via || '/' || paid_amount_cents from public.charges where id = '8f000000-0000-0000-0000-0000000000f2')
                  = 'paid/givebutter/24500', 'the sibling''s charge is paid at its own amount, not the whole order');
select test.check((select paid_via from public.charges where id = '8f000000-0000-0000-0000-0000000000f1') = 'check',
                  'the scout paid by check is left alone');
select test.check((select dues_note from public.givebutter_orders where id = 9102) = 'Paid $265 more than was due; 2 of 2 scouts matched',
                  'the extra is flagged');
-- (c) The same $510 again: nothing left to pay.
select test.check(public.apply_givebutter_dues(9103, '20000000-0000-0000-0000-0000000000f1',
                    array['40000000-0000-0000-0000-0000000000f1', '40000000-0000-0000-0000-0000000000f2']::uuid[], 'matched', '2 of 2 scouts matched') = 'needs_review',
                  'a duplicate order is not called matched');
select test.check((select dues_match = 'needs_review' and dues_note = 'Nothing left to pay for these scouts (possible double payment)'
                          and dues_applied_at is not null from public.givebutter_orders where id = 9103),
                  'it is flagged as a possible double payment and not tried again');
select test.check(not exists (select 1 from public.charges where givebutter_order_id = 9103), 'it marks nothing paid');
select test.check(public.apply_givebutter_dues(9103, '20000000-0000-0000-0000-0000000000f1',
                    array['40000000-0000-0000-0000-0000000000f1']::uuid[], 'matched', 'x') = 'already', 'the sync leaves it alone after that');
reset role;

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","aal":"aal2"}', false);
select test.expect_error($$select public.match_givebutter_dues(9101, '20000000-0000-0000-0000-0000000000f1',
                           array['40000000-0000-0000-0000-0000000000f1', '40000000-0000-0000-0000-0000000000f2']::uuid[])$$, '22023',
                         'matching by hand to scouts with nothing left to pay is refused');
-- By hand, $300 for Hal (no dues charge yet, $255): paid at $255, the extra flagged.
select test.check(public.match_givebutter_dues(9104, '20000000-0000-0000-0000-0000000000f1',
                    array['40000000-0000-0000-0000-0000000000f3']::uuid[]) = 'partial', 'matching by hand flags an order for more than is due');
select test.check((select amount_cents || '/' || paid_amount_cents || '/' || status from public.charges
                    where scout_id = '40000000-0000-0000-0000-0000000000f3' and season = '2030-31') = '25500/25500/paid',
                  'the new dues charge is paid at its own amount');
select test.check((select dues_note from public.givebutter_orders where id = 9104) like 'Paid $45 more than was due%', 'the extra $45 is flagged');
reset role;
select set_config('request.jwt.claims', '', false);

-- ---------------------------------------------------------------------------
\echo '== Review fixes 3: only the committee sets event prices'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);   -- Lee, den leader
select test.expect_error($$update public.events set fee_family_cents = 1 where id = '5f000000-0000-0000-0000-000000000002'$$, '42501',
                         'a den leader cannot change an event''s price');
select test.expect_error($$update public.events set fee_scout_cents = null, fee_family_cents = null where id = '5f000000-0000-0000-0000-000000000002'$$, '42501',
                         'a den leader cannot remove an event''s price');
select test.expect_error($$insert into public.events (title, category, starts_at, fee_scout_cents) values ('Paid thing', 'Outing', now() + interval '9 days', 500)$$,
                         '42501', 'a den leader cannot add an event with a price');
select test.expect_rows($$insert into public.events (title, category, starts_at) values ('Free thing', 'Outing', now() + interval '9 days')$$, 1,
                        'a den leader still adds free events');
select test.expect_rows($$update public.events set title = 'Pinewood Derby!', fee_family_cents = 800 where id = '5f000000-0000-0000-0000-000000000002'$$, 1,
                        'a den leader still edits an event when the price stays the same');
select test.expect_error($$select public.refresh_event_charges('5f000000-0000-0000-0000-000000000002')$$, '42501',
                         'a den leader cannot reprice the RSVP charges');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","aal":"aal2"}', true);   -- Morgan
select test.expect_rows($$update public.events set fee_family_cents = 900 where id = '5f000000-0000-0000-0000-000000000002'$$, 1,
                        'the committee changes the price');
select public.refresh_event_charges('5f000000-0000-0000-0000-000000000002');
select test.check(true, 'the committee reprices the RSVP charges');
set local role service_role;
select set_config('request.jwt.claims', '', true);
select test.expect_rows($$update public.events set fee_family_cents = 950 where id = '5f000000-0000-0000-0000-000000000002'$$, 1,
                        'the server (syncs) can still set a price');
rollback;

-- ---------------------------------------------------------------------------
\echo '== Review fixes 4: a deleted RSVP cancels its open charge'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal2"}', true);   -- Alex
select public.set_rsvp('5f000000-0000-0000-0000-000000000002', 'yes', 1, 1, null);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","aal":"aal2"}', true);   -- Blair
select public.set_rsvp('5f000000-0000-0000-0000-000000000002', 'yes', 1, 1, null);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","aal":"aal2"}', true);   -- Morgan
select test.check(public.update_charges(array(select id from public.charges where event_id = '5f000000-0000-0000-0000-000000000002'
                                                and family_id = '20000000-0000-0000-0000-000000000002'), 'paid', 'cash', null) = 1,
                  'Blair''s family pays in cash');
select test.expect_rows($$delete from public.event_rsvps where event_id = '5f000000-0000-0000-0000-000000000002'$$, 2,
                        'a leader deletes both RSVPs');
select test.check((select status from public.charges where event_id = '5f000000-0000-0000-0000-000000000002'
                    and family_id = '20000000-0000-0000-0000-000000000001') = 'canceled', 'the open charge is canceled');
select test.check((select status from public.charges where event_id = '5f000000-0000-0000-0000-000000000002'
                    and family_id = '20000000-0000-0000-0000-000000000002') = 'paid', 'the paid charge never changes');
rollback;

-- ---------------------------------------------------------------------------
\echo '== Review fixes 5: charges change only through the money functions'
begin;
reset role;
insert into public.charges (id, family_id, kind, title, amount_cents, status, paid_via, paid_at, paid_amount_cents) values
 ('8f000000-0000-0000-0000-000000000051', '20000000-0000-0000-0000-000000000001', 'other', 'Paid online', 1000, 'paid', 'paypal', now(), 1000),
 ('8f000000-0000-0000-0000-000000000052', '20000000-0000-0000-0000-000000000001', 'other', 'Still due', 1000, 'open', null, null, null);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","aal":"aal2"}', true);   -- Morgan
select test.expect_error($$update public.charges set status = 'open', paid_via = null where id = '8f000000-0000-0000-0000-000000000051'$$, '42501',
                         'the committee cannot reopen a PayPal payment directly');
select test.expect_error($$delete from public.charges where id = '8f000000-0000-0000-0000-000000000051'$$, '42501',
                         'the committee cannot delete a paid charge');
select test.expect_error($$insert into public.charges (family_id, kind, title, amount_cents) values ('20000000-0000-0000-0000-000000000001', 'other', 'x', 1)$$,
                         '42501', 'the committee cannot add charges directly');
select test.expect_rows($$update public.charges set amount_cents = 1200 where id = '8f000000-0000-0000-0000-000000000052'$$, 1,
                        'the committee still fixes an unpaid charge''s amount (Money page)');
select test.expect_rows($$update public.charges set amount_cents = 1 where id = '8f000000-0000-0000-0000-000000000051'$$, 0,
                        'but not a paid one''s');
select test.check((select status || '/' || paid_via || '/' || amount_cents from public.charges where id = '8f000000-0000-0000-0000-000000000051')
                  = 'paid/paypal/1000', 'the PayPal payment is untouched');
rollback;

-- ---------------------------------------------------------------------------
\echo '== Review fixes 6: reopening next to an open twin'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal2"}', true);   -- Alex
select public.set_rsvp('5f000000-0000-0000-0000-000000000003', 'yes', 1, 1, null);
select public.set_rsvp('5f000000-0000-0000-0000-000000000003', 'no', 0, 0, null);
select public.set_rsvp('5f000000-0000-0000-0000-000000000003', 'yes', 1, 1, null);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","aal":"aal2"}', true);   -- Morgan
create temporary table twin on commit drop as
select id from public.charges where event_id = '5f000000-0000-0000-0000-000000000003' and status = 'canceled';
select test.check((select count(*) from twin) = 1, 'yes, no, yes leaves a canceled charge next to the open one');
select test.expect_error($$select public.update_charges(array(select id from twin), 'reopen')$$, '22023',
                         'reopening it says there''s already an open charge like it');
select test.check(public.update_charges(array(select id from twin) || '8f000000-0000-0000-0000-0000000000f1'::uuid, 'reopen') = 1,
                  'picked with others, it is skipped and the rest reopen');
select test.check((select status from public.charges where id = (select id from twin)) = 'canceled', 'the twin stays canceled');
rollback;

-- ---------------------------------------------------------------------------
\echo '== Review fixes 7 + 8: den meetings'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);   -- Lee
select test.check((public.record_den_meeting('10000000-0000-0000-0000-000000000002', null, (now() at time zone 'America/New_York')::date - 20,
                    '{40000000-0000-0000-0000-000000000003}',
                    '[{"adventure":"Balancing Bears","requirements":["1"],"skip":{"40000000-0000-0000-0000-000000000003":"1"}},
                      {"adventure":"Baloo the Builder","requirements":"1","skip":"nope"}]') ->> 'added')::int = 1,
                  'a skip or requirements that is not a list is ignored instead of failing the Save');

create temporary table m8 on commit drop as
select (public.record_den_meeting('10000000-0000-0000-0000-000000000002', null, (now() at time zone 'America/New_York')::date - 21,
        '{40000000-0000-0000-0000-000000000003}', '[{"adventure":"Balancing Bears","requirements":["2"]}]') ->> 'meeting_id')::uuid as id;
update public.advancement_submissions set status = 'returned', review_note = 'Not done yet'
 where meeting_id = (select id from m8) and scout_id = '40000000-0000-0000-0000-000000000003';
select public.record_den_meeting('10000000-0000-0000-0000-000000000002', (select id from m8), (now() at time zone 'America/New_York')::date - 21,
       '{40000000-0000-0000-0000-000000000003}', '[{"adventure":"Balancing Bears","requirements":["2"]}]');
select test.check(test.count($$select * from public.advancement_submissions where meeting_id = (select id from m8)
                                and scout_id = '40000000-0000-0000-0000-000000000003'$$) = 1,
                  'saving the meeting again makes no second row next to the returned one');
select test.check((select status::text from public.advancement_submissions where meeting_id = (select id from m8)) = 'approved',
                  'the returned requirement, still checked, is approved again');
-- Returned again; the family sends it in again, then the meeting is saved again.
update public.advancement_submissions set status = 'returned' where meeting_id = (select id from m8);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","aal":"aal2"}', true);   -- Blair, Jo's parent
select test.expect_rows($$update public.advancement_submissions set status = 'submitted' where meeting_id = (select id from m8)$$, 1,
                        'the family sends the returned requirement in again');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);
select public.record_den_meeting('10000000-0000-0000-0000-000000000002', (select id from m8), (now() at time zone 'America/New_York')::date - 21,
       '{40000000-0000-0000-0000-000000000003}', '[{"adventure":"Balancing Bears","requirements":["2"]}]');
select test.check(test.count($$select * from public.advancement_submissions where meeting_id = (select id from m8)$$) = 1
                  and (select status::text from public.advancement_submissions where meeting_id = (select id from m8)) = 'submitted',
                  'saving again after that changes nothing');

-- Editing a planned meeting's first adventure keeps the rest (what the planning form does).
insert into public.den_meetings (id, den_id, meets_on, title, work) values
 ('9f000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', (now() at time zone 'America/New_York')::date + 7, 'Two things',
  '[{"adventure":"Balancing Bears","requirements":["1","2"],"skip":{"40000000-0000-0000-0000-000000000003":["2"]}},
    {"adventure":"Baloo the Builder","requirements":["3"]}]');
select test.expect_rows($$update public.den_meetings set adventure = 'Balancing Bears', requirements = '{1,3}', location = 'Park'
                          where id = '9f000000-0000-0000-0000-000000000001'$$, 1, 'leader edits the first adventure');
select test.check((select work from public.den_meetings where id = '9f000000-0000-0000-0000-000000000001')
                  = '[{"adventure":"Balancing Bears","requirements":["1","3"],"skip":{"40000000-0000-0000-0000-000000000003":["2"]}},
                      {"adventure":"Baloo the Builder","requirements":["3"]}]'::jsonb,
                  'the second adventure stays, and the first keeps its skips');
update public.den_meetings set location = 'Gym' where id = '9f000000-0000-0000-0000-000000000001';
select test.check(jsonb_array_length((select work from public.den_meetings where id = '9f000000-0000-0000-0000-000000000001')) = 2,
                  'editing other details leaves the adventures alone');
update public.den_meetings set adventure = 'A Bear Goes Fishing', requirements = '{4}' where id = '9f000000-0000-0000-0000-000000000001';
select test.check((select work from public.den_meetings where id = '9f000000-0000-0000-0000-000000000001')
                  = '[{"adventure":"A Bear Goes Fishing","requirements":["4"]}, {"adventure":"Baloo the Builder","requirements":["3"]}]'::jsonb,
                  'picking another first adventure replaces only the first');
update public.den_meetings set adventure = null, requirements = '{}' where id = '9f000000-0000-0000-0000-000000000001';
select test.check((select adventure from public.den_meetings where id = '9f000000-0000-0000-0000-000000000001') = 'Baloo the Builder'
                  and jsonb_array_length((select work from public.den_meetings where id = '9f000000-0000-0000-0000-000000000001')) = 1,
                  'clearing the first adventure keeps the others');
rollback;

\echo '== REVIEW FIX TESTS PASSED'
