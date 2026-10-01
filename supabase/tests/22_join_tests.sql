-- Ask to join: people not on the roster ask; only pack admins see and answer the requests.
\set QUIET on
set client_min_messages = notice;

insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-00000000a221', 'Jordan.New@Example.com'),
 ('00000000-0000-0000-0000-00000000a222', 'riley.new@example.com'),
 ('00000000-0000-0000-0000-00000000a223', 'pat.new@example.com');

-- Jordan asks, with two scouts.
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a221"}', true);
insert into public.join_requests (first_name, last_name, phone, relationship, scouts, note, status, email, user_id)
values (' Jordan ', 'New', '555-0100', 'Mother',
        '[{"first_name":"Ava","last_name":"New","grade":"2"},{"first_name":"Max","last_name":"New","grade":"K"}]',
        'We met you at the school fair', 'approved', 'someone@else.com', '00000000-0000-0000-0000-00000000000a');
select test.check((select status from public.join_requests) = 'pending', 'a new request always starts as waiting');
select test.check((select email from public.join_requests) = 'jordan.new@example.com', 'the email is the one they signed in with');
select test.check((select user_id from public.join_requests) = '00000000-0000-0000-0000-00000000a221', 'the request is filed under the person asking');
select test.check((select first_name from public.join_requests) = 'Jordan', 'names are trimmed');
select test.expect_error($$insert into public.join_requests (first_name, last_name) values ('Jordan', 'Again')$$, '23505', 'one waiting request per person');
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a222"}', true);
select test.check(test.count('select * from public.join_requests') = 0, 'people cannot see others'' requests');
select test.expect_error($$insert into public.join_requests (first_name, last_name, scouts) values ('Riley', 'New', '[{"first_name":"A","last_name":"B","grade":"7"}]')$$,
                         '23514', 'grades are K to 5');
select test.expect_error($$insert into public.join_requests (first_name, last_name, scouts) values ('Riley', 'New', '[{"first_name":"A","last_name":"B","birthday":"2018-01-01"}]')$$,
                         '23514', 'nothing about a scout but a name and grade');
select test.expect_error($$insert into public.join_requests (first_name, last_name, scouts) values ('Riley', 'New', '[{"first_name":"","last_name":"B"}]')$$,
                         '23514', 'a scout needs a name');
select test.expect_error($$select public.decline_join_request((select id from public.join_requests limit 1), 'no')$$, '42501', 'non-admins cannot answer requests');
rollback;

-- Someone already on the roster can't ask.
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', true);
select test.expect_error($$insert into public.join_requests (first_name, last_name) values ('Alex', 'Smith')$$, '23505', 'people on the roster cannot ask to join');
select test.check(test.count('select * from public.join_requests') = 0, 'parents cannot see join requests');
select test.expect_error($$select public.approve_join_request((select id from public.join_requests limit 1), null, 'X', '[]')$$, '42501', 'parents cannot approve');
rollback;

begin;
set local role anon;
select test.expect_error('select * from public.join_requests', '42501', 'anon cannot read join requests');
select test.expect_error($$select public.approve_join_request(gen_random_uuid(), null, 'X', '[]')$$, '42501', 'anon cannot approve');
rollback;

-- The admin approves: a new family, Jordan, and the one scout kept, in the Wolf den.
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d"}', true);
select test.check(test.count('select * from public.join_requests where status = ''pending''') = 1, 'admins see waiting requests');
select test.expect_error($$update public.join_requests set status = 'approved'$$, '42501', 'requests change only through approve or decline');
select public.approve_join_request(
    (select id from public.join_requests where email = 'jordan.new@example.com'), null, '',
    '[{"first_name":"Ava","last_name":"New","den_id":"10000000-0000-0000-0000-000000000001"}]');
select test.check((select family_name from public.families f join public.join_requests r on r.family_id = f.id) = 'New', 'the family is named after the parent''s last name');
select test.check((select user_id from public.adults where email = 'jordan.new@example.com') = '00000000-0000-0000-0000-00000000a221', 'the parent''s login links by email');
select test.check((select role::text from public.adults where email = 'jordan.new@example.com') = 'parent', 'they join as a parent');
select test.check((select d.rank::text from public.scouts s join public.dens d on d.id = s.den_id join public.join_requests r on r.family_id = s.family_id) = 'wolf', 'the scout is in the den the admin picked');
select test.check((select scouts = '[]' and phone is null and note is null from public.join_requests where email = 'jordan.new@example.com'), 'scout names, phone and note are cleared after the decision');
select test.check((select decided_by from public.join_requests where email = 'jordan.new@example.com') = '30000000-0000-0000-0000-00000000000d', 'the request records who approved it');
select test.expect_error($$select public.decline_join_request((select id from public.join_requests where email = 'jordan.new@example.com'), 'x')$$, 'P0002', 'a request is answered once');
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a221"}', true);
select test.check(private.is_member(), 'once approved, the parent is a member');
select test.expect_error($$insert into public.join_requests (first_name, last_name) values ('Jordan', 'New')$$, '23505', 'and cannot ask again');
rollback;

-- Riley asks; the admin declines with a reason. Riley sees the reason; the scouts are gone.
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a222"}', true);
insert into public.join_requests (first_name, last_name, scouts) values ('Riley', 'New', '[{"first_name":"Kim","last_name":"New","grade":"3"}]');
commit;
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d"}', true);
select test.expect_error($$select public.approve_join_request((select id from public.join_requests where email = 'riley.new@example.com'), gen_random_uuid(), null, '[]')$$,
                         '23503', 'approving into a family that does not exist fails');
select test.expect_error($$select public.approve_join_request((select id from public.join_requests where email = 'riley.new@example.com'), null, null, '[{"first_name":"Kim","last_name":"New","den_id":"10000000-0000-0000-0000-0000000000ff"}]')$$,
                         '23503', 'approving into a den that does not exist fails');
select public.decline_join_request((select id from public.join_requests where email = 'riley.new@example.com'), 'We could not reach you');
commit;
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a222"}', true);
select test.check((select decline_reason from public.join_requests) = 'We could not reach you', 'the person sees why');
select test.check((select scouts from public.join_requests) = '[]', 'a declined request keeps no scout names');
select test.expect_rows($$delete from public.join_requests$$, 0, 'people cannot delete requests (so the limit holds)');
insert into public.join_requests (first_name, last_name) values ('Riley', 'New');
select test.check(test.count('select * from public.join_requests where status = ''pending''') = 1, 'after a decline they can ask again');
reset role;
update public.join_requests set status = 'declined' where status = 'pending';
set local role authenticated;
insert into public.join_requests (first_name, last_name) values ('Riley', 'New');
reset role;
update public.join_requests set status = 'declined' where status = 'pending';
set local role authenticated;
select test.expect_error($$insert into public.join_requests (first_name, last_name) values ('Riley', 'New')$$, '54000', 'a few requests a month per person');
rollback;

-- Pat asks to join an existing family; the email already on the roster blocks a second login.
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a223"}', true);
insert into public.join_requests (first_name, last_name) values ('Pat', 'Smith');
commit;
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d"}', true);
select public.approve_join_request((select id from public.join_requests where email = 'pat.new@example.com'), '20000000-0000-0000-0000-000000000001', null, '[]');
select test.check((select family_id from public.adults where email = 'pat.new@example.com') = '20000000-0000-0000-0000-000000000001', 'a parent can join an existing family');
rollback;
