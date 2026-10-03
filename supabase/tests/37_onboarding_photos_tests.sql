-- Getting started for new families (2026-10-12): hiding the card, which families are new, the
-- committee's list of where each new family stands, and who has phone alerts on.
set client_min_messages = notice;

-- -----------------------------------------------------------------------------
-- Hiding the card
-- -----------------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal2"}', true);
insert into public.todo_dismissals (key) values ('getting-started');
select test.check((select count(*) from public.todo_dismissals where key = 'getting-started') = 1, 'a family can hide the Getting started card');
insert into public.todo_dismissals (key) values ('training-import');
select test.check(true, 'the training-import reminder can still be hidden');
select test.expect_error($$insert into public.todo_dismissals (key) values ('getting-started-now')$$, '23514', 'only the exact getting-started key is allowed');
select test.expect_error($$insert into public.todo_dismissals (key) values ('photo-permission')$$, '23514', 'there is no photo question to hide any more');
rollback;

-- -----------------------------------------------------------------------------
-- Photo permission: families can still opt out, and back in
-- -----------------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal2"}', true);
select test.expect_rows($$update public.scouts set photo_permission = 'no' where id = '40000000-0000-0000-0000-000000000001'$$, 1, 'a family can opt their scout out of photos');
select test.expect_rows($$update public.scouts set photo_permission = 'yes' where id = '40000000-0000-0000-0000-000000000001'$$, 1, 'and opt back in');
select test.expect_rows($$update public.scouts set photo_permission = 'no' where id = '40000000-0000-0000-0000-000000000003'$$, 0, 'but not for another family''s scout');
rollback;

-- -----------------------------------------------------------------------------
-- Which families are new
-- -----------------------------------------------------------------------------
begin;
-- A family added today, with one adult and one scout in Wolf den 1.
insert into public.families (id, family_name) values ('37200000-0000-0000-0000-000000000001', 'Newby');
insert into auth.users (id, email) values ('37000000-0000-0000-0000-000000000001', 'nat.newby@example.com');
insert into public.adults (id, family_id, first_name, last_name, email, role) values
 ('37300000-0000-0000-0000-000000000001', '37200000-0000-0000-0000-000000000001', 'Nat', 'Newby', 'nat.newby@example.com', 'parent');
insert into public.scouts (id, family_id, den_id, first_name, last_name) values
 ('37400000-0000-0000-0000-000000000001', '37200000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Ned', 'Newby');
-- An older family (four months in the pack).
insert into public.families (id, family_name, created_at) values ('37200000-0000-0000-0000-000000000002', 'Oldham', now() - interval '120 days');
insert into public.adults (id, family_id, first_name, last_name, email, role) values
 ('37300000-0000-0000-0000-000000000002', '37200000-0000-0000-0000-000000000002', 'Olive', 'Oldham', 'olive.oldham@example.com', 'parent');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"37000000-0000-0000-0000-000000000001","aal":"aal1"}', true);
select test.check(public.getting_started_since() is not null, 'a family added today gets the Getting started card');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","aal":"aal2"}', true);
select test.check(public.getting_started_since() is null, 'an adult with no family does not');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000e","aal":"aal2"}', true);
select test.check(public.getting_started_since() is null, 'someone not on the roster does not');

-- The committee's list
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","aal":"aal2"}', true);
select test.check(exists (select 1 from public.new_family_checklist() where family_id = '37200000-0000-0000-0000-000000000001'),
                  'pack leadership sees the new family');
select test.check(not exists (select 1 from public.new_family_checklist() where family_id = '37200000-0000-0000-0000-000000000002'),
                  'a family that joined four months ago is not new');
select test.check((select adults = 'Nat Newby' and scouts = 1 and not registered and not forms_in and not dues_paid and not alerts_on and signed_in
                     from public.new_family_checklist() where family_id = '37200000-0000-0000-0000-000000000001'),
                  'a brand-new family has only signed in');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","aal":"aal1"}', true);
select test.check(test.count('select * from public.new_family_checklist()') = 0, 'without their sign-in code, leadership sees no list');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);
select test.check(test.count('select * from public.new_family_checklist()') = 0, 'den leaders do not see the list');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal2"}', true);
select test.check(test.count('select * from public.new_family_checklist()') = 0, 'parents do not see the list');
select test.check(test.count('select * from public.adults_with_alerts()') = 0, 'parents cannot see who has alerts on');

-- Steps tick themselves as the data comes in.
reset role;
update public.scouts set registration_expires_on = current_date + 200 where id = '37400000-0000-0000-0000-000000000001';
insert into public.health_forms (scout_id, status, form_date) values ('37400000-0000-0000-0000-000000000001', 'submitted', current_date);
insert into public.charges (family_id, scout_id, kind, title, season, amount_cents, status)
values ('37200000-0000-0000-0000-000000000001', '37400000-0000-0000-0000-000000000001', 'dues', 'Pack dues', '2026-27', 25500, 'open');
insert into public.push_subscriptions (adult_id, endpoint, p256dh, auth)
values ('37300000-0000-0000-0000-000000000001', 'https://fcm.googleapis.com/fcm/send/newby-test', 'k', 'a');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","aal":"aal2"}', true);
select test.check((select registered and forms_in and alerts_on and signed_in and not dues_paid
                     from public.new_family_checklist() where family_id = '37200000-0000-0000-0000-000000000001'),
                  'registration, a turned-in form, alerts and sign-in count; open dues do not');
select test.check(exists (select 1 from public.adults_with_alerts() a where a.adult_id = '37300000-0000-0000-0000-000000000001'),
                  'pack leadership sees who has phone alerts on');
reset role;
update public.charges set status = 'paid', paid_via = 'cash', paid_at = now()
 where family_id = '37200000-0000-0000-0000-000000000001' and kind = 'dues';
update public.health_forms set expires_on = current_date - 1 where scout_id = '37400000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","aal":"aal2"}', true);
select test.check((select dues_paid and not forms_in from public.new_family_checklist() where family_id = '37200000-0000-0000-0000-000000000001'),
                  'paid dues count; an expired form does not');

-- Families from the first roster load are not new.
reset role;
update public.pack_settings set value = ((current_date + 1)::text) where key = 'onboarding_from';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"37000000-0000-0000-0000-000000000001","aal":"aal1"}', true);
select test.check(public.getting_started_since() is null, 'families added before onboarding_from (the first roster load) are not new');
rollback;

begin;
set local role anon;
select test.expect_error('select public.new_family_checklist()', '42501', 'anon cannot read the new-family list');
select test.expect_error('select public.adults_with_alerts()', '42501', 'anon cannot read who has alerts on');
select test.expect_error('select public.getting_started_since()', '42501', 'anon cannot call getting_started_since');
rollback;
