-- Carpool board on events: one post per family per event, readable by members who can see the
-- event, changed only by that family, removable by leaders.
\set QUIET on
set client_min_messages = notice;

reset role;
insert into public.events (id, title, category, starts_at, leaders_only) values
 ('40400000-0000-0000-0000-000000000001', 'Leaders planning hike', 'Leaders', '2027-03-06 09:00-05', true);

\echo '== A parent posts seats for their family'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal1"}', true);
select test.expect_rows($$insert into public.event_carpools (event_id, adult_id, family_id, kind, seats, leaving_from, contact)
                          values ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a',
                                  '20000000-0000-0000-0000-000000000001', 'offer', 3, 'Ellicott City', '410-555-0101')$$, 1,
                        'Alex posts 3 seats');
select test.expect_error($$insert into public.event_carpools (event_id, adult_id, family_id, kind)
                           values ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a',
                                   '20000000-0000-0000-0000-000000000001', 'need')$$, '23505',
                         'one post per family per event');
select test.expect_error($$insert into public.event_carpools (event_id, adult_id, family_id, kind)
                           values ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000b',
                                   '20000000-0000-0000-0000-000000000002', 'need')$$, '42501',
                         'cannot post as someone else');
select test.expect_error($$insert into public.event_carpools (event_id, adult_id, family_id, kind, seats)
                           values ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a',
                                   '20000000-0000-0000-0000-000000000001', 'offer', 20)$$, '23514',
                         'seats are 1 to 8');
select test.expect_error($$insert into public.event_carpools (event_id, adult_id, family_id, kind)
                           values ('40400000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a',
                                   '20000000-0000-0000-0000-000000000001', 'need')$$, '42501',
                         'cannot post on an event they cannot see');
commit;

\echo '== Another family sees the board and posts a need'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","aal":"aal1"}', true);
select test.check(test.count($$select * from public.event_carpools where event_id = '50000000-0000-0000-0000-000000000001'$$) = 1,
                  'Blair sees the Smiths'' offer');
select test.expect_rows($$update public.event_carpools set seats = 1$$, 0, 'and cannot change it');
select test.expect_rows($$delete from public.event_carpools$$, 0, 'or remove it');
select test.expect_rows($$insert into public.event_carpools (event_id, adult_id, family_id, kind, note)
                          values ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000b',
                                  '20000000-0000-0000-0000-000000000002', 'need', 'One scout, Friday evening')$$, 1,
                        'Blair asks for a ride');
commit;

\echo '== The other parent in a family changes the family post'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000f","aal":"aal1"}', true);
select test.expect_rows($$update public.event_carpools set seats = 2, adult_id = '30000000-0000-0000-0000-00000000000f'
                          where family_id = '20000000-0000-0000-0000-000000000001'$$, 1,
                        'Sam updates the Smiths'' post');
select test.expect_error($$update public.event_carpools set family_id = '20000000-0000-0000-0000-000000000002'
                           where family_id = '20000000-0000-0000-0000-000000000001'$$, '42501',
                         'and cannot move it to another family');
rollback;

\echo '== Signed out and not on the roster'
begin;
set local role anon;
select test.expect_error('select * from public.event_carpools', '42501', 'the public cannot read the board');
rollback;
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ee","aal":"aal1"}', true);
select test.check(test.count('select * from public.event_carpools') = 0, 'strangers see nothing');
rollback;

\echo '== Leaders can remove a post'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);
select test.expect_rows($$delete from public.event_carpools where family_id = '20000000-0000-0000-0000-000000000002'$$, 1,
                        'a den leader removes a post');
rollback;

reset role;
delete from public.event_carpools where event_id = '50000000-0000-0000-0000-000000000001';
delete from public.events where id = '40400000-0000-0000-0000-000000000001';

\echo '== The board, with names'
reset role;
insert into public.event_carpools (event_id, adult_id, family_id, kind, seats) values
 ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001', 'offer', 3);
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","aal":"aal1"}', true);
select test.check((select name = 'Alex Smith' and not mine and seats = 3 from public.event_carpool_board('50000000-0000-0000-0000-000000000001')),
                  'another family sees the poster''s name');
select test.check(test.count($$select * from public.event_carpool_board('40400000-0000-0000-0000-000000000001')$$) = 0,
                  'nothing for an event they cannot see');
rollback;
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000f","aal":"aal1"}', true);
select test.check((select mine from public.event_carpool_board('50000000-0000-0000-0000-000000000001')),
                  'the other parent in the family sees it as theirs');
rollback;
begin;
set local role anon;
select test.expect_error($$select * from public.event_carpool_board('50000000-0000-0000-0000-000000000001')$$, '42501',
                         'the public cannot call it');
rollback;
reset role;
delete from public.event_carpools where event_id = '50000000-0000-0000-0000-000000000001';
