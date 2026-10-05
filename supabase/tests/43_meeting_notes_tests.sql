-- Leader notes for meetings: the den's leaders (and pack leadership) for den meetings, leaders for
-- events. Families never see them.
\set QUIET on
set client_min_messages = notice;

\echo '== The den leader writes notes for their den meeting'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);
select test.expect_rows($$insert into public.meeting_notes (den_id, meets_on, body)
                          values ('10000000-0000-0000-0000-000000000002', '2027-03-01', 'Snacks: Jones family')$$, 1,
                        'Lee writes notes for their den''s meeting');
select test.check((select updated_by = '30000000-0000-0000-0000-00000000000c' from public.meeting_notes where den_id = '10000000-0000-0000-0000-000000000002'),
                  'stamped with who wrote them');
select test.expect_error($$insert into public.meeting_notes (den_id, meets_on, body)
                           values ('10000000-0000-0000-0000-000000000001', '2027-03-01', 'x')$$, '42501',
                         'but not for a den they don''t lead');
select test.expect_error($$insert into public.meeting_notes (den_id, meets_on, body)
                           values ('10000000-0000-0000-0000-000000000002', '2027-03-01', 'again')$$, '23505',
                         'one notes box per den per day');
select test.expect_error($$insert into public.meeting_notes (event_id, den_id, meets_on, body)
                           values ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '2027-03-02', 'x')$$, '23514',
                         'notes are for a den meeting or an event, not both');
select test.expect_rows($$insert into public.meeting_notes (event_id, body)
                          values ('50000000-0000-0000-0000-000000000001', 'Bring the flag')$$, 1,
                        'any leader writes notes for an event');
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal1"}', true);
select test.check(test.count('select * from public.meeting_notes') = 0, 'not before entering their authenticator code');
rollback;

\echo '== Families never see them'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","aal":"aal1"}', true);
select test.check(test.count('select * from public.meeting_notes') = 0, 'a family in the den sees no notes');
select test.expect_error($$insert into public.meeting_notes (event_id, body)
                           values ('50000000-0000-0000-0000-000000000001', 'hi')$$, '42501',
                         'and cannot write any');
rollback;

\echo '== Pack leadership'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","aal":"aal2"}', true);
select test.check(test.count('select * from public.meeting_notes') = 2, 'an admin sees den and event notes');
select test.expect_rows($$update public.meeting_notes set body = body || ' and juice' where den_id = '10000000-0000-0000-0000-000000000002'$$, 1,
                        'and can add to them');
rollback;

begin;
set local role anon;
select test.expect_error('select * from public.meeting_notes', '42501', 'the public cannot read them');
rollback;

reset role;
delete from public.meeting_notes;
