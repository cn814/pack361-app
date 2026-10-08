-- RSVPs count siblings (brothers and sisters who aren't scouts), and the limit counts them too.
-- A = Alex Smith (family 1), B = Blair Jones (family 2), C = Lee Leader (den leader, no family).
\set QUIET on
set client_min_messages = notice;

-- Room for 6 people; another event with no limit.
insert into public.events (id, title, category, starts_at, rsvp_enabled, rsvp_limit) values
 ('54700000-0000-0000-0000-000000000001', 'Family Campout', 'Campout', now() + interval '20 days', true, 6),
 ('54700000-0000-0000-0000-000000000002', 'Open Picnic', 'Pack Event', now() + interval '20 days', true, null);

create function test.as47(who text) returns void language plpgsql as $$
begin
    perform set_config('request.jwt.claims', json_build_object('sub', case who
        when 'A' then '00000000-0000-0000-0000-00000000000a'
        when 'B' then '00000000-0000-0000-0000-00000000000b'
        when 'C' then '00000000-0000-0000-0000-00000000000c' end, 'aal', 'aal2')::text, true);
end $$;
grant execute on function test.as47(text) to authenticated;

create function test.r47(ev text, fam text) returns public.event_rsvps language sql as $$
    select * from public.event_rsvps where event_id = ('54700000-0000-0000-0000-00000000000' || ev)::uuid
       and family_id = case fam when 'A' then '20000000-0000-0000-0000-000000000001'
                                when 'B' then '20000000-0000-0000-0000-000000000002' end::uuid
$$;

\echo '== Siblings: families say how many are coming'
begin; set local role authenticated; select test.as47('A');
select public.set_rsvp('54700000-0000-0000-0000-000000000001', 'yes', 1, 1, null, 2);
commit;
select test.check((test.r47('1', 'A')).siblings = 2, 'a family RSVPs with 2 siblings');
select test.check(not (test.r47('1', 'A')).waitlisted, 'and 4 people fit in 6 spots');

begin; set local role authenticated; select test.as47('A');
select test.check((select siblings from public.rsvp_counts('54700000-0000-0000-0000-000000000001')) = 2, 'the headcount includes siblings');
rollback;

\echo '== Siblings: the limit counts them'
begin; set local role authenticated; select test.as47('B');
select public.set_rsvp('54700000-0000-0000-0000-000000000001', 'yes', 1, 1, null, 1);
commit;
select test.check((test.r47('1', 'B')).waitlisted, 'a family of 3 doesn''t fit in the 2 spots left: waitlist');
begin; set local role authenticated; select test.as47('B');
select test.check((select waitlist_people from public.rsvp_counts('54700000-0000-0000-0000-000000000001')) = 3, 'the waitlist counts their sibling');
rollback;

begin; set local role authenticated; select test.as47('A');
select test.expect_error($$select public.set_rsvp('54700000-0000-0000-0000-000000000001', 'yes', 1, 1, null, 5)$$, '22023',
                         'a family already in can''t add siblings past the spots left');
select public.set_rsvp('54700000-0000-0000-0000-000000000001', 'yes', 1, 1, null, 0);
commit;
select test.check((test.r47('1', 'A')).siblings = 0, 'leaving the siblings home frees their spots');
select test.check(not (test.r47('1', 'B')).waitlisted, 'and the waiting family moves in');

\echo '== Siblings: only families bring them'
begin; set local role authenticated; select test.as47('C');
select public.set_rsvp('54700000-0000-0000-0000-000000000002', 'yes', 0, 1, null, 3);
commit;
select test.check((select siblings from public.event_rsvps where event_id = '54700000-0000-0000-0000-000000000002'
                    and adult_id = '30000000-0000-0000-0000-00000000000c' and family_id is null) = 0,
                  'a leader with no family brings no siblings');

begin; set local role authenticated; select test.as47('A');
select public.set_rsvp('54700000-0000-0000-0000-000000000002', 'yes', 1, 1, null, 99);
commit;
select test.check((test.r47('2', 'A')).siblings = 20, 'at most 20 siblings');
begin; set local role authenticated; select test.as47('A');
select public.set_rsvp('54700000-0000-0000-0000-000000000002', 'no', 1, 1, null, 2);
commit;
select test.check((test.r47('2', 'A')).siblings = 0, 'a no brings nobody');
begin; set local role authenticated; select test.as47('A');
select public.set_rsvp(p_event_id => '54700000-0000-0000-0000-000000000002', p_status => 'yes', p_scouts => 1, p_adults => 2, p_note => null);
commit;
select test.check((test.r47('2', 'A')).siblings = 0 and (test.r47('2', 'A')).adults = 2, 'an answer without siblings still works');

select test.expect_error($$update public.event_rsvps set siblings = 21 where event_id = '54700000-0000-0000-0000-000000000002'$$, '23514',
                         'the table refuses more than 20 siblings');
select test.expect_error($$update public.event_rsvps set siblings = -1 where event_id = '54700000-0000-0000-0000-000000000002'$$, '23514',
                         'or fewer than none');
