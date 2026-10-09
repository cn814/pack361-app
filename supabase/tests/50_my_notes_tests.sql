-- Each account's private notepad and meeting notes: only the person who wrote them can read them,
-- not their family, not leaders, not admins.
\set QUIET on
set client_min_messages = notice;

reset role;
insert into public.events (id, title, category, starts_at, signup_url) values
 ('5e700000-0000-0000-0000-000000000001', 'Committee meeting', 'Committee', '2027-03-04 19:30-05', 'https://meet.google.com/abc-defg-hij');
insert into public.events (id, title, category, starts_at, leaders_only) values
 ('5e700000-0000-0000-0000-000000000002', 'Leaders planning', 'Committee', '2027-03-05 19:30-05', true);

\echo '== A parent keeps a notepad and meeting notes'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal1"}', true);
select test.expect_rows($$insert into public.my_notes (adult_id, body) values ('30000000-0000-0000-0000-00000000000a', 'Ask about Pinewood')$$, 1,
                        'Alex starts a notepad');
select test.expect_rows($$insert into public.my_notes (adult_id, event_id, body)
                          values ('30000000-0000-0000-0000-00000000000a', '5e700000-0000-0000-0000-000000000001', 'Budget vote next month')$$, 1,
                        'and takes notes at the committee meeting');
select test.expect_error($$insert into public.my_notes (adult_id, body) values ('30000000-0000-0000-0000-00000000000a', 'again')$$, '23505',
                         'one notepad per person');
select test.expect_error($$insert into public.my_notes (adult_id, event_id, body)
                           values ('30000000-0000-0000-0000-00000000000a', '5e700000-0000-0000-0000-000000000001', 'again')$$, '23505',
                         'one page of notes per meeting');
select test.expect_error($$insert into public.my_notes (adult_id, event_id, body)
                           values ('30000000-0000-0000-0000-00000000000a', '5e700000-0000-0000-0000-000000000002', 'x')$$, '42501',
                         'not for a leaders-only meeting they cannot see');
select test.expect_error($$insert into public.my_notes (adult_id, body) values ('30000000-0000-0000-0000-00000000000b', 'x')$$, '42501',
                         'and never as someone else');
select test.check(test.count('select * from public.my_notes') = 2, 'Alex reads their own two');
select test.expect_rows($$update public.my_notes set body = body || ' (dues too)' where event_id is not null$$, 1,
                        'and can change them');
select test.expect_rows($$update public.my_notes set adult_id = '30000000-0000-0000-0000-00000000000b' where event_id is null$$, 1,
                        'an update that tries to hand the notepad to someone else');
select test.check((select adult_id = '30000000-0000-0000-0000-00000000000a' from public.my_notes where event_id is null),
                  'still belongs to Alex');
commit;

\echo '== Nobody else can read them'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000f","aal":"aal1"}', true);
select test.check(test.count('select * from public.my_notes') = 0, 'not another adult in the same family');
select test.expect_rows($$update public.my_notes set body = 'x'$$, 0, 'who cannot change them either');
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);
select test.check(test.count('select * from public.my_notes') = 0, 'not a den leader');
select test.expect_rows($$insert into public.my_notes (adult_id, event_id, body)
                          values ('30000000-0000-0000-0000-00000000000c', '5e700000-0000-0000-0000-000000000002', 'Leader-only notes')$$, 1,
                        'a leader takes their own notes at a leaders-only meeting');
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","aal":"aal2"}', true);
select test.check(test.count('select * from public.my_notes') = 0, 'not an admin');
select test.expect_rows($$delete from public.my_notes$$, 0, 'who cannot delete them either');
rollback;

begin;
set local role anon;
select test.expect_error('select * from public.my_notes', '42501', 'the public cannot read them');
rollback;

\echo '== The owner deletes their own'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal1"}', true);
select test.expect_rows($$delete from public.my_notes where event_id is null$$, 1, 'Alex clears their notepad');
rollback;

reset role;
delete from public.my_notes;
delete from public.events where id in ('5e700000-0000-0000-0000-000000000001', '5e700000-0000-0000-0000-000000000002');
