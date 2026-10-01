-- Payments: charges (what people owe), PayPal checkouts, event fees kept in step with RSVPs.
-- A = Alex Smith (family 1: Sky, River), F = Sam Smith (Alex's co-parent), B = Blair Jones
-- (family 2: Jo), C = Lee Leader (den leader, not committee, no family), D = Morgan Admin,
-- E = signed in but not on the roster.
-- From 06_hub_tests: family 1 has paid dues for 2026-27, family 2 has open dues.
\set QUIET on
set client_min_messages = notice;

grant usage on schema test to service_role;
grant execute on all functions in schema test to service_role;

insert into public.events (id, title, category, starts_at, rsvp_enabled, fee_family_cents, fee_scout_cents, fee_adult_cents) values
 ('52000000-0000-0000-0000-000000000001', 'Spring Campout', 'Campout', now() + interval '20 days', true, 1000, 2500, 1500),
 ('52000000-0000-0000-0000-000000000002', 'Free Hike', 'Outing', now() + interval '20 days', true, null, null, null);

insert into public.charges (id, family_id, adult_id, scout_id, kind, title, season, amount_cents) values
 ('83000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', null, '40000000-0000-0000-0000-000000000001', 'national', 'Scouting America registration 2027', '2027', 7500),
 ('83000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', null, '40000000-0000-0000-0000-000000000003', 'national', 'Scouting America registration 2027', '2027', 7500),
 ('83000000-0000-0000-0000-000000000003', null, '30000000-0000-0000-0000-00000000000c', null, 'national', 'Scouting America registration 2027', '2027', 6500),
 ('83000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', null, null, 'other', 'Pack T-shirt', null, 1200);

-- ---------------------------------------------------------------------------
\echo '== Payments: anonymous'
begin;
set local role anon;
select test.expect_error('select * from public.charges', '42501', 'anon cannot read charges');
select test.expect_error('select * from public.payments', '42501', 'anon cannot read payments');
select test.expect_error($$select public.report_paid(array['83000000-0000-0000-0000-000000000004'::uuid], 'check', null)$$, '42501',
                         'anon cannot report a payment');
select test.expect_error($$select * from public.add_fee('dues', 'x', '2026-27', null, 100, null, 'families', null)$$, '42501',
                         'anon cannot add fees');
rollback;

\echo '== Payments: signed in but not on the roster'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000e"}', true);
select test.check(test.count('select * from public.charges') = 0, 'strangers see no charges');
select test.check(test.count('select * from public.payments') = 0, 'strangers see no payments');
select test.expect_error($$select public.report_paid(array['83000000-0000-0000-0000-000000000004'::uuid], 'check', null)$$, '42501',
                         'strangers cannot report a payment');
rollback;

-- ---------------------------------------------------------------------------
\echo '== Payments: parent (Alex)'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', true);
select test.check(test.count('select * from public.charges') = 3
                  and test.count($$select * from public.charges where family_id <> '20000000-0000-0000-0000-000000000001'$$) = 0,
                  'a family sees only its own charges');
select test.expect_error($$insert into public.charges (family_id, kind, title, amount_cents)
                           values ('20000000-0000-0000-0000-000000000001', 'other', 'Free stuff', 0)$$, '42501',
                         'families cannot add charges');
select test.expect_error($$update public.charges set status = 'paid', paid_via = 'cash'$$, '42501', 'families cannot mark their own charges paid');
select test.expect_rows($$update public.charges set amount_cents = 1$$, 0, 'families cannot change amounts');
select test.expect_error($$delete from public.charges$$, '42501', 'families cannot delete charges');
select test.check((select public.report_paid(array['83000000-0000-0000-0000-000000000002'::uuid], 'check', null)) = 0,
                  'report_paid ignores another family''s charge');
select test.expect_error($$select public.report_paid(array['83000000-0000-0000-0000-000000000004'::uuid], 'bitcoin', null)$$, '22023',
                         'report_paid needs check, cash or other');
select test.check((select public.report_paid(array['83000000-0000-0000-0000-000000000004'::uuid, '82000000-0000-0000-0000-000000000001'::uuid],
                                             'check', '  Check #2041  ')) = 1,
                  'report_paid marks only the family''s open charges');
select test.check((select status || '/' || paid_via || '/' || report_note from public.charges where id = '83000000-0000-0000-0000-000000000004')
                  = 'reported/check/Check #2041', 'a reported charge keeps how and the note');
select test.check((select status from public.charges where id = '82000000-0000-0000-0000-000000000001') = 'paid',
                  'already-paid dues are not touched');
select test.check((select public.report_paid(array['83000000-0000-0000-0000-000000000004'::uuid], 'cash', null)) = 0,
                  'report_paid only works on open charges');
select test.expect_error($$insert into public.payments (charge_ids, charge_cents, amount_cents, provider_order_id)
                           values (array['83000000-0000-0000-0000-000000000001'::uuid], array[7500], 7500, 'FAKE')$$, '42501',
                         'families cannot write payments');
select test.expect_error($$select public.record_paypal_capture('00000000-0000-0000-0000-000000000000', 'X', 1)$$, '42501',
                         'families cannot record a PayPal capture');
select test.expect_error($$select public.update_charges(array['83000000-0000-0000-0000-000000000001'::uuid], 'waive')$$, '42501',
                         'families cannot waive charges');
select test.expect_error($$select public.save_pay_settings('{"dues_amount_cents": "0"}')$$, '42501',
                         'families cannot change fee settings');

-- Event fees follow the RSVP
select public.set_rsvp('52000000-0000-0000-0000-000000000001', 'yes', 2, 1, null);
select test.check((select amount_cents from public.charges where event_id = '52000000-0000-0000-0000-000000000001' and status = 'open') = 7500,
                  'RSVP yes adds the event fee: $10 family + 2 x $25 scouts + 1 x $15 adult');
select public.set_rsvp('52000000-0000-0000-0000-000000000001', 'yes', 1, 2, null);
select test.check(test.count($$select * from public.charges where event_id = '52000000-0000-0000-0000-000000000001' and status <> 'canceled'$$) = 1
                  and (select amount_cents from public.charges where event_id = '52000000-0000-0000-0000-000000000001' and status = 'open') = 6500,
                  'changing the headcount updates the open charge');
select public.set_rsvp('52000000-0000-0000-0000-000000000001', 'maybe', 3, 3, null);
select test.check((select amount_cents from public.charges where event_id = '52000000-0000-0000-0000-000000000001' and status = 'open') = 6500,
                  '"maybe" leaves the charge as it is');
select public.set_rsvp('52000000-0000-0000-0000-000000000001', 'no', 0, 0, null);
select test.check(test.count($$select * from public.charges where event_id = '52000000-0000-0000-0000-000000000001' and status <> 'canceled'$$) = 0,
                  'RSVP no cancels the open charge');
select public.set_rsvp('52000000-0000-0000-0000-000000000001', 'yes', 2, 2, null);
select test.check(test.count($$select * from public.charges where event_id = '52000000-0000-0000-0000-000000000001' and status = 'open'$$) = 1
                  and (select amount_cents from public.charges where event_id = '52000000-0000-0000-0000-000000000001' and status = 'open') = 9000,
                  'answering yes again adds a new charge');
select public.set_rsvp('52000000-0000-0000-0000-000000000002', 'yes', 2, 2, null);
select test.check(test.count($$select * from public.charges where event_id = '52000000-0000-0000-0000-000000000002'$$) = 0,
                  'free events add no charge');
commit;

\echo '== Payments: co-parent (Sam)'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000f"}', true);
select test.check(test.count($$select * from public.charges where status <> 'canceled'$$) = 4, 'both parents see the family''s charges');
rollback;

\echo '== Payments: other parent (Blair)'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', true);
select test.check(test.count('select * from public.charges') = 2, 'Blair sees only the Jones family''s dues and registration');
select test.check((select public.report_paid(array(select id from public.charges where family_id = '20000000-0000-0000-0000-000000000001'), 'cash', null)) = 0,
                  'cannot report another family''s charges');
rollback;

-- ---------------------------------------------------------------------------
\echo '== Payments: den leader, not on the committee (Lee)'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', true);
select test.check(test.count('select * from public.charges') = 1
                  and (select id from public.charges) = '83000000-0000-0000-0000-000000000003',
                  'a den leader sees only their own charge, not families'' money');
select test.expect_error($$update public.charges set status = 'waived'$$, '42501', 'den leaders cannot change charges');
select test.expect_rows($$update public.charges set amount_cents = 1$$, 0, 'den leaders cannot change amounts');
select test.expect_error($$select public.update_charges(array['83000000-0000-0000-0000-000000000002'::uuid], 'paid', 'cash')$$, '42501',
                         'den leaders cannot mark charges paid');
select test.expect_error($$select * from public.add_fee('other', 'x', null, null, 100, null, 'families', null)$$, '42501',
                         'den leaders cannot add fees');
select test.expect_error($$select public.set_remitted(array['83000000-0000-0000-0000-000000000002'::uuid], current_date)$$, '42501',
                         'den leaders cannot record money sent to the council');
select public.set_rsvp('52000000-0000-0000-0000-000000000001', 'yes', 4, 1, null);
select test.check((select amount_cents || '/' || (family_id is null)::text || '/' || adult_id::text
                     from public.charges where event_id = '52000000-0000-0000-0000-000000000001' and status = 'open')
                  = '2500/true/30000000-0000-0000-0000-00000000000c',
                  'an adult with no family owes the family fee plus themselves');
commit;

-- ---------------------------------------------------------------------------
\echo '== Payments: committee (Morgan)'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d"}', true);
select test.check(test.count('select * from public.charges') = 9,
                  'committee sees every charge');
select test.check((select added || '/' || skipped from public.add_fee('dues', 'Pack dues 2026-27', '2026-27', null, 6000, null, 'families', null))
                  = '0/2', 'adding dues again skips families that already have them');
select test.check((select added || '/' || skipped from public.add_fee('national', 'Scouting America registration 2027', '2027', null, 7500, '2026-11-30', 'scouts', null))
                  = '1/2', 'registration for every scout adds only the scout without one');
select test.check((select added || '/' || skipped from public.add_fee('national', 'Scouting America registration 2027', '2027', null, 6500, null, 'leaders', null))
                  = '1/1', 'registration for every leader: Lee already has one, Morgan is added');
select test.check((select added from public.add_fee('council', 'Council fee 2027', '2027', null, 2500, null, 'den_scouts', '10000000-0000-0000-0000-000000000002'))
                  = 2, 'council fee for one den''s scouts');
select test.expect_error($$select * from public.add_fee('national', 'x', '2027', null, 100, null, 'families', null)$$, '22023',
                         'registration fees must be per person');
select test.expect_error($$select * from public.add_fee('dues', 'x', null, null, 100, null, 'families', null)$$, '22023',
                         'dues need a season');
select test.expect_error($$insert into public.charges (family_id, kind, title, season, amount_cents)
                           values ('20000000-0000-0000-0000-000000000002', 'dues', 'Dues again', '2026-27', 6000)$$, '42501',
                         'the committee adds charges through add_fee, not directly');
select test.expect_error($$delete from public.charges where status = 'paid'$$, '42501', 'the committee cannot delete charges');
select test.expect_error($$update public.charges set status = 'open', paid_via = null where status = 'paid'$$, '42501',
                         'the committee cannot reopen charges directly');
-- The unique keys themselves (as the table owner: only the money functions write charges).
reset role;
select test.expect_error($$insert into public.charges (family_id, kind, title, season, amount_cents)
                           values ('20000000-0000-0000-0000-000000000002', 'dues', 'Dues again', '2026-27', 6000)$$, '23505',
                         'unique index blocks duplicate dues');
select test.expect_error($$insert into public.charges (family_id, scout_id, kind, title, season, amount_cents)
                           values ('20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000003', 'national', 'Again', '2027', 7500)$$, '23505',
                         'unique index blocks duplicate registration');
select test.expect_error($$insert into public.charges (kind, title, amount_cents) values ('other', 'Nobody', 100)$$, '23514',
                         'every charge has an owner');
set local role authenticated;
select test.check((select public.update_charges(array['83000000-0000-0000-0000-000000000002'::uuid], 'cancel', null, 'Entered twice')) = 1,
                  'committee cancels a charge');
reset role;
select test.expect_rows($$insert into public.charges (family_id, scout_id, kind, title, season, amount_cents)
                          values ('20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000003', 'national', 'Registration 2027', '2027', 7500)$$, 1,
                        'a canceled charge does not block a new one');
set local role authenticated;
select test.check((select public.update_charges(array['83000000-0000-0000-0000-000000000004'::uuid], 'paid', null, null)) = 1,
                  'committee confirms a reported payment');
select test.check((select paid_via || '/' || paid_amount_cents from public.charges where id = '83000000-0000-0000-0000-000000000004') = 'check/1200',
                  'confirming a reported payment keeps how the family paid');
select test.check((select public.update_charges(array['83000000-0000-0000-0000-000000000004'::uuid], 'reopen')) = 1, 'committee reopens a charge');
select test.check((select status || coalesce(paid_via, '-') from public.charges where id = '83000000-0000-0000-0000-000000000004') = 'open-',
                  'a reopened charge is open again with no payment details');
select test.check((select public.update_charges(array['83000000-0000-0000-0000-000000000004'::uuid], 'waive')) = 1, 'committee waives a charge');
select test.expect_error($$select public.update_charges(array['83000000-0000-0000-0000-000000000004'::uuid], 'paid', 'venmo')$$, '22023',
                         'mark paid needs cash, check or other');
select test.check((select public.set_remitted(array(select id from public.charges where kind in ('national', 'council') and season = '2027'), '2026-12-01'))
                  = (select count(*) from public.charges where kind in ('national', 'council') and season = '2027' and status <> 'canceled'),
                  'committee records registration money sent to the council');
select public.save_pay_settings('{"dues_amount_cents": "6000", "registration_year": "2027", "pay_other_how": "Checks to Pack 361"}');
select test.check((select value from public.pack_settings where key = 'dues_amount_cents') = '6000', 'committee saves fee settings');
select test.expect_error($$select public.save_pay_settings('{"email_daily_limit": "999"}')$$, '22023', 'only payment settings can be changed this way');
select test.expect_error($$select public.save_pay_settings('{"council_youth_cents": "-5"}')$$, '22023', 'amounts must be whole cents');
-- Mark Alex's event charge paid in cash; RSVP changes then leave it alone.
select test.check((select public.update_charges(array(select id from public.charges
                                                      where event_id = '52000000-0000-0000-0000-000000000001'
                                                        and family_id = '20000000-0000-0000-0000-000000000001' and status = 'open'),
                                                'paid', 'cash', null)) = 1, 'committee marks an event fee paid in cash');
-- The cost goes up; refreshing updates Lee's open charge.
update public.events set fee_adult_cents = 2000 where id = '52000000-0000-0000-0000-000000000001';
select public.refresh_event_charges('52000000-0000-0000-0000-000000000001');
select test.check((select amount_cents from public.charges where event_id = '52000000-0000-0000-0000-000000000001'
                     and adult_id = '30000000-0000-0000-0000-00000000000c' and status = 'open') = 3000,
                  'changing an event''s cost updates open charges');
commit;

\echo '== Payments: a paid event fee is never changed by the RSVP'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', true);
select public.set_rsvp('52000000-0000-0000-0000-000000000001', 'yes', 2, 3, null);
select test.check((select status || '/' || amount_cents from public.charges
                     where event_id = '52000000-0000-0000-0000-000000000001' and family_id = '20000000-0000-0000-0000-000000000001'
                       and status <> 'canceled') = 'paid/9000',
                  'a bigger headcount does not change a paid charge');
select public.set_rsvp('52000000-0000-0000-0000-000000000001', 'no', 0, 0, null);
select test.check((select status from public.charges
                     where event_id = '52000000-0000-0000-0000-000000000001' and family_id = '20000000-0000-0000-0000-000000000001'
                       and status <> 'canceled') = 'paid',
                  'answering no does not cancel a paid charge');
commit;

-- ---------------------------------------------------------------------------
-- PayPal checkouts (the server writes these with the secret key)
insert into public.payments (id, family_id, adult_id, charge_ids, charge_cents, amount_cents, provider_order_id) values
 ('84000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a',
  array['83000000-0000-0000-0000-000000000001'::uuid], array[7500], 7500, 'ORDER-A'),
 ('84000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-00000000000b',
  array['82000000-0000-0000-0000-000000000002'::uuid], array[6000], 6000, 'ORDER-B'),
 ('84000000-0000-0000-0000-000000000003', null, '30000000-0000-0000-0000-00000000000c',
  array['83000000-0000-0000-0000-000000000003'::uuid], array[6500], 6500, 'ORDER-C');
-- Each checkout holds its charges (as claim_charges does when a checkout starts).
update public.charges c set pending_payment_id = p.id, pending_since = now()
  from public.payments p where c.id = any (p.charge_ids) and p.provider_order_id in ('ORDER-A', 'ORDER-B', 'ORDER-C');

\echo '== Payments: who sees checkouts'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000f"}', true);
select test.check(test.count('select * from public.payments') = 1, 'a family sees its own checkouts (co-parent too)');
select test.expect_error($$update public.payments set status = 'captured'$$, '42501', 'families cannot change a checkout');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', true);
select test.check(test.count('select * from public.payments') = 1
                  and (select provider_order_id from public.payments) = 'ORDER-B', 'other families see only theirs');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', true);
select test.check(test.count('select * from public.payments') = 1
                  and (select provider_order_id from public.payments) = 'ORDER-C', 'an adult with no family sees their own checkout');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d"}', true);
select test.check(test.count('select * from public.payments') = 3, 'committee sees every checkout');
select test.expect_error($$insert into public.payments (charge_ids, charge_cents, amount_cents, provider_order_id)
                           values (array['83000000-0000-0000-0000-000000000001'::uuid], array[1], 1, 'X')$$, '42501',
                         'even the committee cannot write checkouts from the browser');
rollback;

\echo '== Payments: recording a PayPal capture (server)'
begin;
set local role service_role;
select test.check(public.record_paypal_capture('84000000-0000-0000-0000-000000000001', 'CAPTURE-A', 7500) = 'recorded',
                  'a completed capture is recorded');
select test.check((select status || '/' || paid_via || '/' || paid_amount_cents || '/' || paypal_capture_id || '/' || paypal_order_id
                     from public.charges where id = '83000000-0000-0000-0000-000000000001') = 'paid/paypal/7500/CAPTURE-A/ORDER-A',
                  'its charges are marked paid with PayPal');
select test.check((select status from public.payments where id = '84000000-0000-0000-0000-000000000001') = 'captured',
                  'the checkout is captured');
select test.check((select pending_payment_id from public.charges where id = '83000000-0000-0000-0000-000000000001') is null,
                  'and its hold on the charge is let go');
select test.check(public.record_paypal_capture('84000000-0000-0000-0000-000000000001', 'CAPTURE-A', 7500) = 'already',
                  'recording twice does nothing the second time');
select test.check(public.record_paypal_capture('84000000-0000-0000-0000-000000000002', 'CAPTURE-B', 100) = 'mismatch',
                  'a capture for the wrong amount is caught');
select test.check((select status from public.charges where id = '82000000-0000-0000-0000-000000000002') = 'open'
                  and (select error from public.payments where id = '84000000-0000-0000-0000-000000000002') is not null,
                  'a capture for the wrong amount marks nothing paid and is flagged for leaders');
update public.charges set status = 'paid', paid_via = 'cash' where id = '83000000-0000-0000-0000-000000000003';
select test.check(public.record_paypal_capture('84000000-0000-0000-0000-000000000003', 'CAPTURE-C', 6500) = 'partial',
                  'paying something already paid is flagged for a refund');
select test.check((select paid_via from public.charges where id = '83000000-0000-0000-0000-000000000003') = 'cash',
                  'and the charge already paid in cash is left alone');
commit;

\echo '== Payments: online payments cannot be reopened'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d"}', true);
select test.check((select public.update_charges(array['83000000-0000-0000-0000-000000000001'::uuid], 'reopen')) = 0,
                  'a PayPal payment stays paid (refund it in PayPal first)');
select test.check((select public.update_charges(array['83000000-0000-0000-0000-000000000001'::uuid], 'cancel')) = 0,
                  'a paid charge cannot be canceled');
rollback;

\echo '== PAYMENTS TESTS PASSED'

-- ---------------------------------------------------------------------------
-- Review fixes: amounts must match the checkout, one checkout at a time, per-person fees.
insert into public.events (id, title, category, starts_at, rsvp_enabled, fee_scout_cents) values
 ('52000000-0000-0000-0000-000000000003', 'Fishing Derby', 'Outing', now() + interval '20 days', true, 1000),
 ('52000000-0000-0000-0000-000000000004', 'Museum Trip', 'Outing', now() + interval '20 days', true, 1000);

\echo '== Payments: a checkout holds its charges'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', true);
select public.set_rsvp('52000000-0000-0000-0000-000000000003', 'yes', 1, 0, null);
select test.check((select amount_cents from public.claim_charges('85000000-0000-0000-0000-000000000001',
                     array(select id from public.charges where event_id = '52000000-0000-0000-0000-000000000003'))) = 1000,
                  'starting a checkout claims the charge and returns its amount');
select public.set_rsvp('52000000-0000-0000-0000-000000000003', 'yes', 5, 0, null);
select test.check((select amount_cents from public.charges where event_id = '52000000-0000-0000-0000-000000000003' and status = 'open') = 1000,
                  'changing the RSVP mid-checkout does not change the amount being paid');
select test.check((select public.report_paid(array(select id from public.charges where event_id = '52000000-0000-0000-0000-000000000003'), 'cash', null)) = 0,
                  'cannot report paying another way while a checkout holds it');
commit;

\echo '== Payments: a second phone cannot pay for the same things'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000f"}', true);
select test.expect_error($$select * from public.claim_charges('85000000-0000-0000-0000-000000000002',
                           array(select id from public.charges where event_id = '52000000-0000-0000-0000-000000000003'))$$, '55006',
                         'a second checkout for the same charge is refused while the first is in progress');
select test.expect_error($$select * from public.claim_charges('85000000-0000-0000-0000-000000000002', array['82000000-0000-0000-0000-000000000002'::uuid])$$, '22023',
                         'cannot start a checkout for another family''s charge');
rollback;
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', true);
select test.expect_error($$select * from public.claim_charges('85000000-0000-0000-0000-000000000003',
                           array(select id from public.charges where event_id = '52000000-0000-0000-0000-000000000003'))$$, '22023',
                         'other families cannot claim it either');
rollback;

-- The first checkout was opened and left (its hold lapses after 30 minutes).
insert into public.payments (id, family_id, adult_id, charge_ids, charge_cents, amount_cents, provider_order_id)
select '85000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a',
       array[id], array[1000], 1000, 'ORDER-OLD'
  from public.charges where event_id = '52000000-0000-0000-0000-000000000003' and status = 'open';
update public.charges set pending_since = now() - interval '1 hour' where pending_payment_id = '85000000-0000-0000-0000-000000000001';

\echo '== Payments: after the hold lapses'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', true);
select public.set_rsvp('52000000-0000-0000-0000-000000000003', 'yes', 5, 0, null);
select test.check((select amount_cents from public.charges where event_id = '52000000-0000-0000-0000-000000000003' and status = 'open') = 5000,
                  'the RSVP updates the amount once the old checkout''s hold lapses');
select test.check((select amount_cents from public.claim_charges('85000000-0000-0000-0000-000000000004',
                     array(select id from public.charges where event_id = '52000000-0000-0000-0000-000000000003'))) = 5000,
                  'a new checkout can take over a lapsed hold');
commit;
insert into public.payments (id, family_id, adult_id, charge_ids, charge_cents, amount_cents, provider_order_id)
select '85000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a',
       array[id], array[5000], 5000, 'ORDER-NEW'
  from public.charges where event_id = '52000000-0000-0000-0000-000000000003' and status = 'open';

\echo '== Payments: an old checkout cannot pay a changed charge'
begin;
set local role service_role;
select test.check(public.record_paypal_capture('85000000-0000-0000-0000-000000000001', 'CAPTURE-OLD', 1000) = 'partial',
                  'capturing the old $10 checkout for a charge that is now $50 is flagged');
select test.check((select status || '/' || amount_cents from public.charges where event_id = '52000000-0000-0000-0000-000000000003' and status <> 'canceled')
                  = 'open/5000', 'and the charge is not marked paid for less than it costs');
select test.check(public.record_paypal_capture('85000000-0000-0000-0000-000000000004', 'CAPTURE-NEW', 5000) = 'recorded',
                  'the checkout holding the charge at its current amount is recorded');
select test.check((select status || '/' || paid_amount_cents || '/' || coalesce(pending_payment_id::text, '-')
                     from public.charges where event_id = '52000000-0000-0000-0000-000000000003' and status <> 'canceled')
                  = 'paid/5000/-', 'paid in full, hold let go');
commit;

\echo '== Payments: wrong amount at checkout time is caught even without a capture race'
begin;
set local role service_role;
update public.charges set status = 'open', paid_via = null, paid_at = null, paid_amount_cents = null, amount_cents = 2000,
                          pending_payment_id = '85000000-0000-0000-0000-000000000005', pending_since = now()
 where id = '83000000-0000-0000-0000-000000000004';
insert into public.payments (id, family_id, charge_ids, charge_cents, amount_cents, provider_order_id) values
 ('85000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000001',
  array['83000000-0000-0000-0000-000000000004'::uuid], array[1200], 1200, 'ORDER-T');
select test.check(public.record_paypal_capture('85000000-0000-0000-0000-000000000005', 'CAPTURE-T', 1200) = 'partial'
                  , 'a charge whose amount went up since checkout is not marked paid');
select test.check((select status from public.charges where id = '83000000-0000-0000-0000-000000000004') = 'open', 'it stays open');
rollback;

\echo '== Payments: a canceled checkout lets go of its charges'
begin;
set local role service_role;
update public.charges set pending_payment_id = '85000000-0000-0000-0000-000000000006', pending_since = now()
 where id = '83000000-0000-0000-0000-000000000004';
insert into public.payments (id, family_id, charge_ids, charge_cents, amount_cents, provider_order_id) values
 ('85000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000001',
  array['83000000-0000-0000-0000-000000000004'::uuid], array[1200], 1200, 'ORDER-X');
update public.payments set status = 'canceled' where id = '85000000-0000-0000-0000-000000000006';
select test.check((select pending_payment_id from public.charges where id = '83000000-0000-0000-0000-000000000004') is null,
                  'canceling the checkout releases the hold');
rollback;

\echo '== Payments: a reported charge is not changed by the RSVP'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', true);
select public.set_rsvp('52000000-0000-0000-0000-000000000004', 'yes', 3, 0, null);
select test.check((select public.report_paid(array(select id from public.charges where event_id = '52000000-0000-0000-0000-000000000004'), 'cash', null)) = 1,
                  'family reports paying $30 in cash');
select public.set_rsvp('52000000-0000-0000-0000-000000000004', 'yes', 0, 0, null);
select test.check((select status || '/' || amount_cents from public.charges where event_id = '52000000-0000-0000-0000-000000000004' and status <> 'canceled')
                  = 'reported/3000', 'dropping the headcount after reporting leaves the reported amount alone');
select public.set_rsvp('52000000-0000-0000-0000-000000000004', 'no', 0, 0, null);
select test.check((select status from public.charges where event_id = '52000000-0000-0000-0000-000000000004' and status <> 'canceled') = 'reported',
                  'answering no does not cancel a reported charge');
commit;

\echo '== Payments: per-scout fees'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d"}', true);
select test.check((select added || '/' || skipped from public.add_fee('event', 'Fishing Derby bait', null, '52000000-0000-0000-0000-000000000003', 500, null, 'scouts', null))
                  = '3/0', 'a per-scout event fee charges each sibling, alongside the family''s RSVP charge');
select test.check((select added || '/' || skipped from public.add_fee('event', 'Fishing Derby bait', null, '52000000-0000-0000-0000-000000000003', 500, null, 'scouts', null))
                  = '0/3', 'and is still added only once per scout');
select test.check((select added || '/' || skipped from public.add_fee('dues', 'Dues per scout', '2026-27', null, 3000, null, 'scouts', null))
                  = '3/0', 'per-scout dues charge each sibling');
select test.check((select added || '/' || skipped from public.add_fee('dues', 'Pack dues 2026-27', '2026-27', null, 6000, null, 'families', null))
                  = '0/2', 'family dues are still once per family');
select test.check((select added || '/' || skipped from public.add_fee('event', 'Museum Trip', null, '52000000-0000-0000-0000-000000000004', 1000, null, 'family', '20000000-0000-0000-0000-000000000001'))
                  = '1/0', 'a committee fee for one family stands next to the family''s RSVP charge');
select test.check((select added || '/' || skipped from public.add_fee('event', 'Museum Trip', null, '52000000-0000-0000-0000-000000000004', 1000, null, 'family', '20000000-0000-0000-0000-000000000001'))
                  = '0/1', 'and is still added only once per family');
-- A $0 charge can't be confirmed as paid.
update public.charges set amount_cents = 0 where id = '82000000-0000-0000-0000-000000000002';
select test.check((select public.update_charges(array['82000000-0000-0000-0000-000000000002'::uuid], 'paid', 'cash')) = 0,
                  'a $0 charge cannot be marked paid (set the amount or waive it)');
rollback;

\echo '== PAYMENTS REVIEW TESTS PASSED'
