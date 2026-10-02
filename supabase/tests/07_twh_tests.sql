-- In-app RSVPs and public guide pages (taking over from TroopWebHost).
-- A = Alex Smith (family 1), F = Sam Smith (Alex's co-parent), B = Blair Jones (family 2),
-- C = Lee Leader (den leader, no family), E = signed in but not on the roster.
\set QUIET on
set client_min_messages = notice;

insert into public.events (id, title, category, starts_at, rsvp_enabled, rsvp_by, leaders_only) values
 ('51000000-0000-0000-0000-000000000001', 'Pack Hike', 'Outing', now() + interval '10 days', true, null, false),
 ('51000000-0000-0000-0000-000000000002', 'Den Meeting', 'Den Meeting', now() + interval '10 days', false, null, false),
 ('51000000-0000-0000-0000-000000000003', 'Closed Signup', 'Outing', now() + interval '10 days', true,
  ((now() at time zone 'America/New_York')::date - 1), false),
 ('51000000-0000-0000-0000-000000000004', 'Leader Dinner', 'Committee', now() + interval '10 days', true, null, true),
 ('51000000-0000-0000-0000-000000000005', 'Last Month', 'Outing', now() - interval '30 days', true, null, false);

\echo '== RSVP: parent (Alex)'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal2"}', true);
select public.set_rsvp('51000000-0000-0000-0000-000000000001', 'yes', 2, 1, '  Bringing a sibling  ');
select test.check((select scouts from public.event_rsvps where event_id = '51000000-0000-0000-0000-000000000001') = 2
                  and (select note from public.event_rsvps where event_id = '51000000-0000-0000-0000-000000000001') = 'Bringing a sibling',
                  'a family answers an RSVP');
select public.set_rsvp('51000000-0000-0000-0000-000000000001', 'maybe', 1, 1, null);
select test.check(test.count($$select * from public.event_rsvps where event_id = '51000000-0000-0000-0000-000000000001'$$) = 1
                  and (select status from public.event_rsvps where event_id = '51000000-0000-0000-0000-000000000001') = 'maybe',
                  'answering again changes the family''s answer');
select public.set_rsvp('51000000-0000-0000-0000-000000000001', 'yes', 99, -3, null);
select test.check((select scouts from public.event_rsvps where event_id = '51000000-0000-0000-0000-000000000001') = 20
                  and (select adults from public.event_rsvps where event_id = '51000000-0000-0000-0000-000000000001') = 0,
                  'headcounts are kept in range');
select test.expect_error($$select public.set_rsvp('51000000-0000-0000-0000-000000000002', 'yes', 1, 1, null)$$, '22023',
                         'no RSVP on events that are not taking them');
select test.expect_error($$select public.set_rsvp('51000000-0000-0000-0000-000000000003', 'yes', 1, 1, null)$$, '22023',
                         'no RSVP after the RSVP-by date');
select test.expect_error($$select public.set_rsvp('51000000-0000-0000-0000-000000000005', 'yes', 1, 1, null)$$, '22023',
                         'no RSVP after the event');
select test.expect_error($$select public.set_rsvp('51000000-0000-0000-0000-000000000004', 'yes', 1, 1, null)$$, 'P0002',
                         'no RSVP on leaders-only events');
select test.expect_error($$select public.set_rsvp('51000000-0000-0000-0000-000000000001', 'sure', 1, 1, null)$$, '22023',
                         'answer must be yes, maybe or no');
select test.expect_error($$insert into public.event_rsvps (event_id, family_id, adult_id, status)
                           values ('51000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-00000000000b', 'no')$$,
                         '42501', 'RSVPs only go through set_rsvp');
commit;

\echo '== RSVP: co-parent (Sam)'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000f","aal":"aal2"}', true);
select test.check(test.count('select * from public.event_rsvps') = 1, 'both parents see the family''s answer');
select public.set_rsvp('51000000-0000-0000-0000-000000000001', 'yes', 2, 2, null);
select test.check(test.count('select * from public.event_rsvps') = 1
                  and (select adult_id from public.event_rsvps) = '30000000-0000-0000-0000-00000000000f',
                  'one answer per family: the co-parent updates it');
commit;

\echo '== RSVP: other parent (Blair)'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","aal":"aal2"}', true);
select test.check(test.count('select * from public.event_rsvps') = 0, 'families do not see other families'' answers');
select test.check((select families_yes from public.rsvp_counts('51000000-0000-0000-0000-000000000001')) = 1
                  and (select scouts from public.rsvp_counts('51000000-0000-0000-0000-000000000001')) = 2,
                  'families see the headcount');
select public.set_rsvp('51000000-0000-0000-0000-000000000001', 'no', 3, 3, null);
select test.check((select scouts + adults from public.event_rsvps) = 0, 'a "no" answer brings nobody');
select test.expect_rows($$delete from public.event_rsvps$$, 0, 'families cannot delete answers directly');
commit;

\echo '== RSVP: leader with no family (Lee)'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);
select public.set_rsvp('51000000-0000-0000-0000-000000000001', 'yes', 5, null, null);
select test.check((select scouts from public.event_rsvps where adult_id = '30000000-0000-0000-0000-00000000000c') = 0
                  and (select adults from public.event_rsvps where adult_id = '30000000-0000-0000-0000-00000000000c') = 1,
                  'an adult without a family counts as one adult');
select public.set_rsvp('51000000-0000-0000-0000-000000000004', 'yes', 0, 1, null);
select test.check(test.count('select * from public.event_rsvps') = 4, 'leaders see who''s coming');
select test.check((select families_yes from public.rsvp_counts('51000000-0000-0000-0000-000000000001')) = 2
                  and (select families_no from public.rsvp_counts('51000000-0000-0000-0000-000000000001')) = 1
                  and (select adults from public.rsvp_counts('51000000-0000-0000-0000-000000000001')) = 3,
                  'headcount adds up');
select test.expect_rows($$delete from public.event_rsvps where event_id = '51000000-0000-0000-0000-000000000004'$$, 1,
                        'leaders can remove an answer');
commit;

\echo '== RSVP: not on the roster'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000e","aal":"aal2"}', true);
select test.expect_error($$select public.set_rsvp('51000000-0000-0000-0000-000000000001', 'yes', 1, 1, null)$$, '42501',
                         'strangers cannot RSVP');
select test.check(test.count('select * from public.event_rsvps') = 0, 'strangers see no answers');
select test.check((select families_yes from public.rsvp_counts('51000000-0000-0000-0000-000000000001')) = 0,
                  'strangers get no headcount');
commit;

\echo '== Public pages: anonymous visitor'
begin;
set local role anon;
select test.check(test.count('select * from public.guide_pages') = 1
                  and (select slug from public.guide_pages) = 'join',
                  'the public sees only public, published guide pages');
select test.expect_error('select * from public.event_rsvps', '42501', 'the public cannot read RSVPs');
select test.expect_error($$select public.set_rsvp('51000000-0000-0000-0000-000000000001', 'yes', 1, 1, null)$$, '42501',
                         'the public cannot RSVP');
select test.expect_error($$select * from public.rsvp_counts('51000000-0000-0000-0000-000000000001')$$, '42501',
                         'the public gets no headcount');
select test.expect_error($$update public.guide_pages set title = 'Hacked'$$, '42501', 'the public cannot edit guide pages');
commit;

\echo '== Public pages: a draft stays private'
update public.guide_pages set is_public = true where slug = 'faq';
begin;
set local role anon;
select test.check(test.count($$select * from public.guide_pages where slug = 'faq'$$) = 0,
                  'a public page that is still a draft is not shown');
commit;
update public.guide_pages set is_public = false where slug = 'faq';
