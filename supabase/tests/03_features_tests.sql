-- Settings, Givebutter copies, push subscriptions, popcorn, calendar token.
-- Run after 02_advancement_tests.sql (reuses its fixtures).
\set QUIET on
set client_min_messages = notice;

-- Fixture rows, written as the sync job would (service role / superuser)
insert into public.givebutter_campaigns (id, title, slug, type, show_as_fundraiser)
values (745658, 'Fall Campout', 'pack361-campout', 'event', false),
       (732665, 'Pack Attire', 'pack361-attire', 'event', true);
insert into public.givebutter_orders (id, campaign_id, family_id, name, email, amount, tickets) values
 (1, 745658, '20000000-0000-0000-0000-000000000001', 'Alex Smith', 'alex.smith@example.com', 70, 2),
 (2, 745658, '20000000-0000-0000-0000-000000000002', 'Blair Jones', 'blair.jones@example.com', 35, 1),
 (3, 732665, null, 'Grandma Unknown', 'someone@example.com', 25, 0);
insert into public.popcorn_sales (scout_id, amount) values ('40000000-0000-0000-0000-000000000001', 250);

\echo '== Features: anonymous'
begin;
set local role anon;
select test.expect_error('select * from public.pack_settings', '42501', 'anon cannot read settings');
select test.expect_error('select * from public.givebutter_orders', '42501', 'anon cannot read Givebutter orders');
select test.expect_error('select * from public.popcorn_sales', '42501', 'anon cannot read popcorn sales');
rollback;

\echo '== Features: stranger'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000e","aal":"aal2"}', true);
select test.check(test.count('select * from public.givebutter_campaigns') = 0, 'stranger sees no campaigns');
select test.check(test.count('select * from public.popcorn_sales') = 0, 'stranger sees no popcorn sales');
rollback;

\echo '== Features: parent (Alex Smith)'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal2"}', true);
select test.check((select value from public.pack_settings where key = 'awards_tracked_from') = '2026-07-01', 'members read settings');
select test.expect_rows($$update public.pack_settings set value = '2020-01-01'$$, 0, 'parent cannot change settings');
select test.check(test.count('select * from public.givebutter_campaigns') = 2, 'members see campaigns');
select test.check(test.count('select * from public.givebutter_orders') = 1, 'parent sees only their own family''s orders');
select test.expect_error($$insert into public.givebutter_orders (id, campaign_id, name) values (9, 745658, 'fake')$$,
                         '42501', 'parent cannot write orders');
select test.expect_rows($$update public.givebutter_campaigns set show_as_fundraiser = false$$, 0, 'parent cannot relabel campaigns');
select test.check(test.count('select * from public.popcorn_sales') = 1, 'members see the popcorn leaderboard');
select test.expect_error($$insert into public.popcorn_sales (scout_id, amount) values ('40000000-0000-0000-0000-000000000002', 9999)$$,
                         '42501', 'parent cannot enter popcorn sales');
select test.expect_rows($$insert into public.push_subscriptions (adult_id, endpoint, p256dh, auth)
                          values ('30000000-0000-0000-0000-00000000000a', 'https://push.example/alex', 'k', 'a')$$, 1, 'parent saves own push subscription');
select test.expect_error($$insert into public.push_subscriptions (adult_id, endpoint, p256dh, auth)
                          values ('30000000-0000-0000-0000-00000000000b', 'https://push.example/blair', 'k', 'a')$$,
                         '42501', 'parent cannot subscribe someone else');
select test.check((select calendar_token from public.adults where first_name = 'Alex') is not null, 'adult has a calendar token');
select test.expect_error($$update public.adults set calendar_token = gen_random_uuid() where first_name = 'Alex'$$,
                         '42501', 'calendar token cannot be changed by the user');
commit;

\echo '== Features: other parent (Blair)'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","aal":"aal2"}', true);
select test.check(test.count('select * from public.push_subscriptions') = 0, 'push subscriptions are private');
select test.check(test.count('select * from public.givebutter_orders') = 1, 'Blair sees only the Jones order');
rollback;

\echo '== Features: leader and admin'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);
select test.check(test.count('select * from public.givebutter_orders') = 3, 'leaders see all orders');
select test.expect_rows($$update public.pack_settings set value = '2020-01-01'$$, 0, 'den leader cannot change settings');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","aal":"aal2"}', true);
select test.expect_rows($$update public.pack_settings set value = '150' where key = 'popcorn_scout_goal'$$, 1, 'admin changes a setting');
select test.expect_rows($$insert into public.popcorn_sales (scout_id, amount) values ('40000000-0000-0000-0000-000000000002', 120)$$, 1, 'admin enters popcorn sales');
select test.expect_rows($$update public.givebutter_campaigns set show_as_fundraiser = true where id = 745658$$, 1, 'admin relabels a campaign');
select test.check((select count(*) from public.adventures where home_idea is not null) = 148, 'every adventure has a home idea');
rollback;

\echo '== FEATURE TESTS PASSED'
