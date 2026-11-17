-- Awarded at awards night. 01's people: Lee leads the Bear den (River, Jo); Blair is Jo's parent;
-- Sky is in the Wolf den; Morgan is an admin. 55's Dov is a den leader who leads no den.
\set QUIET on
set client_min_messages = notice;

create function test.as61(p_sub text, p_aal text default 'aal2') returns void language sql as $$
    select set_config('request.jwt.claims', json_build_object('sub', p_sub, 'aal', p_aal)::text, true)
$$;
grant execute on function test.as61(text, text) to authenticated;

\echo '== Awarded at awards night'
begin; set local role authenticated; select test.as61('00000000-0000-0000-0000-00000000000c');
select test.expect_rows($$insert into public.awards_given (scout_id, label, given_by, given_at)
                          values ('40000000-0000-0000-0000-000000000003', 'Bear Strong (Bear)', '30000000-0000-0000-0000-00000000000d', '2020-01-01')$$, 1,
                        'the den leader marks a scout awarded for a scout in their den');
select test.check((select given_by = '30000000-0000-0000-0000-00000000000c' and given_at > now() - interval '1 minute'
                     from public.awards_given where scout_id = '40000000-0000-0000-0000-000000000003'),
                  'stamped as theirs, now, whatever was sent');
select test.expect_error($$insert into public.awards_given (scout_id, label) values ('40000000-0000-0000-0000-000000000003', 'Bear Strong (Bear)')$$,
                         '23505', 'once per scout and award');
select test.expect_error($$insert into public.awards_given (scout_id, label) values ('40000000-0000-0000-0000-000000000001', 'Paws on the Path (Wolf)')$$,
                         '42501', 'not for a scout in a den they don''t lead');
select test.expect_rows($$update public.awards_given set label = 'Changed'$$, 0, 'nothing is edited');
select test.expect_rows($$delete from public.awards_given where scout_id = '40000000-0000-0000-0000-000000000003'$$, 1,
                        'and can take it off (not awarded after all)');
rollback;

begin; set local role authenticated; select test.as61('00000000-0000-0000-0000-00000000000c', 'aal1');
select test.expect_error($$insert into public.awards_given (scout_id, label) values ('40000000-0000-0000-0000-000000000003', 'Bear Strong (Bear)')$$,
                         '42501', 'not without two-step sign-in');
rollback;

insert into public.awards_given (scout_id, label) values ('40000000-0000-0000-0000-000000000003', 'Bear Strong (Bear)');

begin; set local role authenticated; select test.as61('00000000-0000-0000-0000-00000000000b');
select test.check(test.count('select * from public.awards_given') = 0, 'a parent doesn''t see it');
select test.expect_rows($$delete from public.awards_given$$, 0, 'or take anything off');
rollback;

begin; set local role authenticated; select test.as55('D');
select test.check(test.count('select * from public.awards_given') = 0, 'a den leader of another den doesn''t see it');
rollback;

begin; set local role authenticated; select test.as61('00000000-0000-0000-0000-00000000000d');
select test.check(test.count('select * from public.awards_given') = 1, 'an admin sees every den''s');
rollback;

delete from public.awards_given;
