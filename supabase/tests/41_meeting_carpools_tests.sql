-- Carpool posts on den meetings: seen and used by the people who can see the meeting.
\set QUIET on
set client_min_messages = notice;

reset role;
insert into public.den_meetings (id, den_id, meets_on, title, location, address) values
 ('41000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '2027-02-08', 'Animal rescue visit', 'Rescue', 'Columbia, MD'),
 ('41000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '2027-02-08', 'Wolf hike', 'Park', 'Ellicott City, MD');

\echo '== A family in the den posts on the meeting'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","aal":"aal1"}', true);
select test.expect_rows($$insert into public.event_carpools (meeting_id, adult_id, family_id, kind, seats)
                          values ('41000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000b',
                                  '20000000-0000-0000-0000-000000000002', 'need', 1)$$, 1,
                        'Jones (Bear den) asks for a ride to a Bear meeting');
select test.expect_error($$insert into public.event_carpools (meeting_id, adult_id, family_id, kind)
                           values ('41000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-00000000000b',
                                   '20000000-0000-0000-0000-000000000002', 'need')$$, '42501',
                         'but not on a Wolf meeting they cannot see');
select test.expect_error($$insert into public.event_carpools (event_id, meeting_id, adult_id, family_id, kind)
                           values ('50000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001',
                                   '30000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-000000000002', 'need')$$, '23514',
                         'a post is on an event or a meeting, not both');
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal1"}', true);
select test.check((select name = 'Blair Jones' and seats = 1 from public.meeting_carpool_board('41000000-0000-0000-0000-000000000001')),
                  'another Bear family sees it with the name');
select test.expect_rows($$insert into public.event_carpools (meeting_id, adult_id, family_id, kind, seats)
                          values ('41000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a',
                                  '20000000-0000-0000-0000-000000000001', 'offer', 2)$$, 1,
                        'and offers seats');
select test.expect_error($$insert into public.event_carpools (meeting_id, adult_id, family_id, kind)
                           values ('41000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a',
                                   '20000000-0000-0000-0000-000000000001', 'need')$$, '23505',
                         'one post per family per meeting');
select test.expect_rows($$insert into public.event_carpools (event_id, adult_id, family_id, kind)
                          values ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a',
                                  '20000000-0000-0000-0000-000000000001', 'offer')$$, 1,
                        'their event post is separate from their meeting post');
rollback;

\echo '== Outside the den'
reset role;
insert into public.families (id, family_name) values ('41200000-0000-0000-0000-000000000001', 'Outside');
insert into public.adults (id, family_id, first_name, last_name, email, role) values
 ('41300000-0000-0000-0000-000000000001', '41200000-0000-0000-0000-000000000001', 'Pat', 'Outside', 'pat.outside@example.com', 'parent');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000004101', 'pat.outside@example.com');
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000004101","aal":"aal1"}', true);
select test.check(test.count($$select * from public.event_carpools where meeting_id is not null$$) = 0,
                  'a family outside the den sees no meeting posts');
select test.check(test.count($$select * from public.meeting_carpool_board('41000000-0000-0000-0000-000000000001')$$) = 0,
                  'or the meeting board');
rollback;

\echo '== The den''s leader (with their code) can remove a post'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);
select test.check(test.count($$select * from public.meeting_carpool_board('41000000-0000-0000-0000-000000000001')$$) = 1,
                  'the den leader sees the board');
select test.expect_rows($$delete from public.event_carpools where meeting_id = '41000000-0000-0000-0000-000000000001'$$, 1,
                        'and can remove a post');
rollback;

reset role;
delete from public.event_carpools where meeting_id is not null;
delete from public.den_meetings where id in ('41000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000002');
delete from public.adults where id = '41300000-0000-0000-0000-000000000001';
delete from public.families where id = '41200000-0000-0000-0000-000000000001';
