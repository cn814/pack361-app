-- Awards still owed. 01's people: Lee leads the Bear den (River, Jo); Blair is Jo's parent;
-- Sky is in the Wolf den; Morgan is an admin. 55's Dov is a den leader who leads no den.
\set QUIET on
set client_min_messages = notice;

create function test.as59(p_sub text, p_aal text default 'aal2') returns void language sql as $$
    select set_config('request.jwt.claims', json_build_object('sub', p_sub, 'aal', p_aal)::text, true)
$$;
grant execute on function test.as59(text, text) to authenticated;

\echo '== Awards still owed'
begin; set local role authenticated; select test.as59('00000000-0000-0000-0000-00000000000c');
select test.expect_rows($$insert into public.awards_owed (scout_id, label, kind, completed_on, noted_by, given_at)
                          values ('40000000-0000-0000-0000-000000000003', 'Bear Strong (Bear)', 'adventure', '2026-10-01',
                                  '30000000-0000-0000-0000-00000000000d', now())$$, 1,
                        'the den leader notes an award owed to a scout in their den');
select test.check((select noted_by = '30000000-0000-0000-0000-00000000000c' and given_at is null and given_by is null
                     from public.awards_owed where scout_id = '40000000-0000-0000-0000-000000000003'),
                  'stamped as theirs, and still open whatever was sent');
select test.expect_error($$insert into public.awards_owed (scout_id, label, kind) values ('40000000-0000-0000-0000-000000000003', 'Bear Strong (Bear)', 'adventure')$$,
                         '23505', 'one open entry per scout and award');
select test.expect_error($$insert into public.awards_owed (scout_id, label, kind) values ('40000000-0000-0000-0000-000000000001', 'Paws on the Path (Wolf)', 'adventure')$$,
                         '42501', 'not for a scout in a den they don''t lead');
select test.expect_rows($$update public.awards_owed set given_at = '2020-01-01', label = 'Changed'
                          where scout_id = '40000000-0000-0000-0000-000000000003'$$, 1, 'marks it given');
select test.check((select label = 'Bear Strong (Bear)' and given_at > now() - interval '1 minute' and given_by = '30000000-0000-0000-0000-00000000000c'
                     from public.awards_owed where scout_id = '40000000-0000-0000-0000-000000000003'),
                  'given now, by them; the award itself unchanged');
select test.expect_rows($$insert into public.awards_owed (scout_id, label, kind) values ('40000000-0000-0000-0000-000000000003', 'Bear Strong (Bear)', 'adventure')$$,
                        1, 'once given, it can be owed again another night');
rollback;

begin; set local role authenticated; select test.as59('00000000-0000-0000-0000-00000000000c', 'aal1');
select test.expect_error($$insert into public.awards_owed (scout_id, label, kind) values ('40000000-0000-0000-0000-000000000003', 'Bear Strong (Bear)', 'adventure')$$,
                         '42501', 'not without two-step sign-in');
rollback;

insert into public.awards_owed (scout_id, label, kind) values ('40000000-0000-0000-0000-000000000003', 'Bear Strong (Bear)', 'adventure');

begin; set local role authenticated; select test.as59('00000000-0000-0000-0000-00000000000b');
select test.check(test.count('select * from public.awards_owed') = 0, 'a parent doesn''t see the list');
select test.expect_rows($$update public.awards_owed set given_at = now()$$, 0, 'or mark anything given');
rollback;

begin; set local role authenticated; select test.as55('D');
select test.check(test.count('select * from public.awards_owed') = 0, 'a den leader of another den doesn''t see it');
select test.expect_rows($$delete from public.awards_owed$$, 0, 'or remove it');
rollback;

begin; set local role authenticated; select test.as59('00000000-0000-0000-0000-00000000000d');
select test.check(test.count('select * from public.awards_owed') = 1, 'an admin sees every den''s');
select test.expect_rows($$delete from public.awards_owed where given_at is null$$, 1, 'and can take a mistaken entry off');
rollback;

delete from public.awards_owed;
