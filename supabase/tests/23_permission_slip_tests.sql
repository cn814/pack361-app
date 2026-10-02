-- Permission slips: parents sign for their own scouts; leaders see them all and record paper ones.
\set QUIET on
set client_min_messages = notice;

insert into public.events (id, title, category, starts_at, slip_required, slip_text) values
 ('5a000000-0000-0000-0000-000000000001', 'Zoo trip', 'Pack', now() + interval '10 days', true, 'I give permission for my scout to go to the zoo.'),
 ('5a000000-0000-0000-0000-000000000002', 'Pack meeting', 'Pack Meeting', now() + interval '3 days', false, null),
 ('5a000000-0000-0000-0000-000000000003', 'Old hike', 'Pack', now() - interval '10 days', true, 'Hike permission.');

-- Alex (Smith parent) signs for Sky.
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal2"}', true);
insert into public.permission_slips (event_id, scout_id, kind, signed_name, contact, signed_text, signed_by)
values ('5a000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'signed', ' Alex Smith ', '410-555-0101',
        'Something else', '30000000-0000-0000-0000-00000000000b');
select test.check((select signed_by from public.permission_slips) = '30000000-0000-0000-0000-00000000000a', 'the slip is signed by the parent who signed it');
select test.check((select signed_text from public.permission_slips) = 'I give permission for my scout to go to the zoo.', 'the wording agreed to is the event''s');
select test.check((select signed_name from public.permission_slips) = 'Alex Smith', 'the typed name is kept');
select test.expect_error($$insert into public.permission_slips (event_id, scout_id, kind, signed_name) values ('5a000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000003', 'signed', 'Alex Smith')$$,
                         '42501', 'parents cannot sign for other families'' scouts');
select test.expect_error($$insert into public.permission_slips (event_id, scout_id, kind) values ('5a000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', 'paper')$$,
                         '42501', 'parents cannot record paper slips');
select test.expect_error($$insert into public.permission_slips (event_id, scout_id, kind, signed_name) values ('5a000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', 'signed', ' ')$$,
                         '23514', 'signing needs a typed name');
select test.expect_error($$insert into public.permission_slips (event_id, scout_id, kind, signed_name) values ('5a000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', 'signed', 'Alex Smith')$$,
                         '23514', 'no slips for events that do not need one');
select test.expect_error($$insert into public.permission_slips (event_id, scout_id, kind, signed_name) values ('5a000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000002', 'signed', 'Alex Smith')$$,
                         '23514', 'no signing after the event is over');
select test.expect_error($$insert into public.permission_slips (event_id, scout_id, kind, signed_name) values ('5a000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'signed', 'Alex Smith')$$,
                         '23505', 'one slip per scout per event');
select test.expect_error($$update public.permission_slips set signed_name = 'Someone'$$, '42501', 'a slip cannot be edited');
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","aal":"aal2"}', true);
select test.check(test.count('select * from public.permission_slips') = 0, 'other families cannot see a family''s slips');
select test.expect_rows($$delete from public.permission_slips$$, 0, 'other families cannot remove a slip');
rollback;

begin;
set local role anon;
select test.expect_error('select * from public.permission_slips', '42501', 'anon cannot read permission slips');
rollback;

-- Lee (den leader) sees the slip and records a paper one for Jo.
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);
select test.check(test.count('select * from public.permission_slips') = 1, 'leaders see the slips');
insert into public.permission_slips (event_id, scout_id, kind, signed_name) values ('5a000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000003', 'paper', 'Forged');
select test.check((select recorded_by from public.permission_slips where kind = 'paper') = '30000000-0000-0000-0000-00000000000c', 'a paper slip records the leader');
select test.check((select signed_name is null from public.permission_slips where kind = 'paper'), 'a paper slip has no typed signature');
commit;

-- Alex takes back the signature; can't remove the leader's paper slip for Jo.
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal2"}', true);
select test.expect_rows($$delete from public.permission_slips where scout_id = '40000000-0000-0000-0000-000000000001'$$, 1, 'a parent can take back their signature');
select test.expect_rows($$delete from public.permission_slips where scout_id = '40000000-0000-0000-0000-000000000003'$$, 0, 'and nothing else');
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","aal":"aal2"}', true);
select test.expect_rows($$delete from public.permission_slips where kind = 'paper'$$, 1, 'leaders can remove a slip');
rollback;
