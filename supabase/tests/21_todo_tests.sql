-- "Not now" on to-dos: each person sees and changes only their own, and only polls and jobs.
\set QUIET on
set client_min_messages = notice;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', true);
insert into public.todo_dismissals (key, hidden_until) values ('poll-58000000-0000-0000-0000-000000000001', now() + interval '3 days');
select test.check((select adult_id from public.todo_dismissals) = '30000000-0000-0000-0000-00000000000a', 'a hidden item is filed under the person who hid it');
select test.expect_error($$insert into public.todo_dismissals (key) values ('dues')$$, '23514', 'money due cannot be hidden');
select test.expect_error($$insert into public.todo_dismissals (adult_id, key) values ('30000000-0000-0000-0000-00000000000b', 'poll-58000000-0000-0000-0000-000000000002')$$,
                         '42501', 'nobody hides things for someone else');
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', true);
select test.check(test.count('select * from public.todo_dismissals') = 0, 'others cannot see what you hid');
select test.expect_rows($$delete from public.todo_dismissals$$, 0, 'others cannot unhide your items');
rollback;

begin;
set local role anon;
select test.expect_error('select * from public.todo_dismissals', '42501', 'anon cannot read hidden items');
rollback;
