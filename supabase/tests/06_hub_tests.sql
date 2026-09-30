-- Pack guide, paperwork, den messages and polls.
-- A = Alex Smith (parent: Sky in Wolf 1, River in Bear 1), F = Sam Smith (Alex's co-parent),
-- B = Blair Jones (parent: Jo in Bear 1), C = Lee Leader (Bear 1 den leader), D = Morgan Admin.
\set QUIET on
set client_min_messages = notice;

insert into public.announcements (id, author_id, title, body, den_id) values
 ('80000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000d', 'Wolf news', 'Wolves only', '10000000-0000-0000-0000-000000000001');
insert into public.polls (id, question, options, den_id, created_by) values
 ('90000000-0000-0000-0000-000000000001', 'Wolf hike day?', array['Sat', 'Sun'], '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000d'),
 ('90000000-0000-0000-0000-000000000002', 'Spring campout weekend?', array['April 10', 'April 17', 'April 24'], null, '30000000-0000-0000-0000-00000000000d');
insert into public.polls (id, question, options, one_per_family, allow_multiple, created_by) values
 ('90000000-0000-0000-0000-000000000003', 'Which snacks? (one answer per family)', array['Fruit', 'Pretzels', 'Cheese'], true, true, '30000000-0000-0000-0000-00000000000d');

\echo '== Hub: parent (Alex)'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', true);
select test.check(test.count('select * from public.guide_pages') > 0, 'families read the pack guide');
select test.check(test.count('select * from public.guide_pages where not is_published') = 0, 'families do not see draft pages');
select test.expect_error($$insert into public.guide_pages (slug, title) values ('mine', 'Mine')$$, '42501', 'families cannot add guide pages');
select test.expect_rows($$update public.guide_pages set title = 'Hacked'$$, 0, 'families cannot edit guide pages');

select test.expect_rows($$insert into public.health_forms (scout_id, status, form_date)
                          values ('40000000-0000-0000-0000-000000000002', 'submitted', '2026-09-01')$$, 1,
                        'family reports a medical form turned in');
select test.check((select expires_on from public.health_forms where scout_id = '40000000-0000-0000-0000-000000000002') = '2027-08-31',
                  'medical form expires a year after the date on it');
select test.expect_rows($$insert into public.health_forms (adult_id, status) values ('30000000-0000-0000-0000-00000000000f', 'submitted')$$, 1,
                        'family reports the other parent''s form');
select test.expect_error($$insert into public.health_forms (scout_id, status) values ('40000000-0000-0000-0000-000000000001', 'on_file')$$,
                         '42501', 'families cannot mark a form received');
select test.expect_error($$insert into public.health_forms (scout_id, status) values ('40000000-0000-0000-0000-000000000003', 'submitted')$$,
                         '42501', 'families cannot report another family''s scout');
select test.expect_error($$insert into public.health_forms (adult_id, status) values ('30000000-0000-0000-0000-00000000000b', 'submitted')$$,
                         '42501', 'families cannot report another family''s adult');
select test.expect_rows($$insert into public.dues_payments (family_id, season, status) values ('20000000-0000-0000-0000-000000000001', '2026-27', 'submitted')$$, 1,
                        'family says they paid dues');
select test.expect_error($$insert into public.dues_payments (family_id, season, status) values ('20000000-0000-0000-0000-000000000002', '2026-27', 'submitted')$$,
                         '42501', 'families cannot report for another family');
select test.expect_error($$update public.dues_payments set status = 'paid'$$, '42501', 'families cannot mark dues paid');

select test.check(test.count($$select * from public.announcements where id = '80000000-0000-0000-0000-000000000001'$$) = 1,
                  'a Wolf family sees Wolf den messages');
select test.expect_error($$insert into public.announcements (author_id, title, body) values ('30000000-0000-0000-0000-00000000000a', 'x', 'y')$$,
                         '42501', 'families cannot post');

select test.check(test.count('select * from public.polls') = 3, 'a family in both dens sees pack and den polls');
select test.check(test.count($$select * from public.poll_results('90000000-0000-0000-0000-000000000002')$$) = 0,
                  'no results before you vote');
select public.cast_vote('90000000-0000-0000-0000-000000000002', array[1]);
select test.check((select votes from public.poll_results('90000000-0000-0000-0000-000000000002') where option_index = 1) = 1,
                  'results show after voting');
select public.cast_vote('90000000-0000-0000-0000-000000000002', array[2]);
select test.check((select count(*) from public.poll_votes where poll_id = '90000000-0000-0000-0000-000000000002') = 1
                  and (select choices from public.poll_votes where poll_id = '90000000-0000-0000-0000-000000000002') = array[2],
                  'voting again changes your vote');
select test.expect_error($$select public.cast_vote('90000000-0000-0000-0000-000000000002', array[0, 1])$$, '22023',
                         'one answer only unless the poll allows more');
select test.expect_error($$select public.cast_vote('90000000-0000-0000-0000-000000000002', array[7])$$, '22023',
                         'answers must be on the poll');
select public.cast_vote('90000000-0000-0000-0000-000000000003', array[0, 2]);
select test.expect_error($$insert into public.poll_votes (poll_id, adult_id, choices) values ('90000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a', '{0}')$$,
                         '42501', 'votes only go through cast_vote');
commit;

\echo '== Hub: co-parent (Sam)'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000f"}', true);
select test.check(test.count('select * from public.health_forms') = 2, 'both parents see the family''s forms');
select test.check(test.count($$select * from public.poll_results('90000000-0000-0000-0000-000000000003')$$) = 3,
                  'a one-per-family poll counts as voted for the whole family');
select public.cast_vote('90000000-0000-0000-0000-000000000003', array[1]);
select test.check((select count(*) from public.poll_votes v where v.poll_id = '90000000-0000-0000-0000-000000000003') = 1,
                  'one-per-family: the family''s vote is replaced, not added');
commit;

\echo '== Hub: other parent (Blair, Bear only)'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', true);
select test.check(test.count('select * from public.health_forms') = 0, 'other families'' forms are private');
select test.check(test.count('select * from public.dues_payments') = 0, 'other families'' dues are private');
select test.check(test.count($$select * from public.announcements where id = '80000000-0000-0000-0000-000000000001'$$) = 0,
                  'Bear families do not see Wolf den messages');
select test.check(test.count($$select * from public.polls where id = '90000000-0000-0000-0000-000000000001'$$) = 0,
                  'Bear families do not see Wolf polls');
select test.expect_error($$select public.cast_vote('90000000-0000-0000-0000-000000000001', array[0])$$, 'P0002',
                         'cannot vote on a poll you cannot see');
select test.check(test.count('select * from public.poll_votes') = 0, 'parents cannot see other people''s votes');
rollback;

\echo '== Hub: den leader (Lee, Bear 1)'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', true);
select test.check(test.count('select * from public.guide_pages where not is_published') > 0, 'leaders see draft guide pages');
select test.expect_rows($$update public.guide_pages set title = 'Edited'$$, 0, 'den leaders do not edit the guide');
select test.check(test.count('select * from public.health_forms') = 2, 'leaders see every family''s forms');
select test.expect_rows($$update public.health_forms set status = 'on_file' where scout_id = '40000000-0000-0000-0000-000000000002'$$, 1,
                        'leaders mark a form received');
select test.expect_rows($$update public.dues_payments set status = 'paid', paid_on = '2026-09-30'$$, 1, 'leaders mark dues paid');
select test.expect_rows($$insert into public.announcements (author_id, title, body, den_id)
                          values ('30000000-0000-0000-0000-00000000000c', 'Bring a flashlight', 'Monday', '10000000-0000-0000-0000-000000000002')$$, 1,
                        'den leader messages their den');
select test.expect_error($$insert into public.announcements (author_id, title, body, den_id)
                           values ('30000000-0000-0000-0000-00000000000c', 'x', 'y', '10000000-0000-0000-0000-000000000001')$$,
                         '42501', 'den leader cannot message another den');
select test.expect_rows($$insert into public.polls (question, options, den_id, created_by)
                          values ('Bear snack?', array['a', 'b'], '10000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-00000000000c')$$, 1,
                        'den leader polls their den');
select test.expect_error($$insert into public.polls (question, options, den_id, created_by)
                           values ('x', array['a', 'b'], '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000c')$$,
                         '42501', 'den leader cannot poll another den');
select test.check(test.count('select * from public.poll_votes') >= 2, 'leaders see who voted');
commit;

\echo '== Hub: parent after a leader confirmed'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', true);
select test.expect_rows($$update public.dues_payments set note = 'changed'$$, 0, 'families cannot change dues once confirmed');
select test.check(test.count($$select * from public.announcements where title = 'Bring a flashlight'$$) = 1, 'Bear family sees the den message');
rollback;

\echo '== Hub: admin (Morgan)'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d"}', true);
select test.expect_rows($$update public.guide_pages set is_published = true where slug = 'uniforms'$$, 1, 'committee edits and publishes guide pages');
select test.expect_rows($$update public.polls set closed_at = now() where id = '90000000-0000-0000-0000-000000000002'$$, 1, 'admin closes a poll');
rollback;

\echo '== Hub: anonymous'
begin;
set local role anon;
select test.expect_error('select * from public.guide_pages', '42501', 'anon cannot read the guide');
select test.expect_error('select * from public.health_forms', '42501', 'anon cannot read forms');
select test.expect_error($$select public.cast_vote('90000000-0000-0000-0000-000000000002', array[0])$$, '42501', 'anon cannot vote');
rollback;

\echo '== Hub: notification reads'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', true);
select test.expect_rows($$insert into public.inbox_reads (adult_id) values ('30000000-0000-0000-0000-00000000000a')$$, 1, 'you record when you read notifications');
select test.expect_error($$insert into public.inbox_reads (adult_id) values ('30000000-0000-0000-0000-00000000000b')$$, '42501', 'not for someone else');
rollback;

\echo '== HUB TESTS PASSED'
