-- RSVP limits and the waitlist; "Ready to go?" reminder limits.
-- A = Alex Smith (family 1), B = Blair Jones (family 2), C = Lee Leader (den leader, no family),
-- P = Pat Parker (family 33-1), Q = Quinn Quill (family 33-2), both added here.
\set QUIET on
set client_min_messages = notice;

insert into public.families (id, family_name) values
 ('23300000-0000-0000-0000-000000000001', 'Parker'),
 ('23300000-0000-0000-0000-000000000002', 'Quill');
insert into public.adults (id, family_id, first_name, last_name, email, role) values
 ('33300000-0000-0000-0000-000000000001', '23300000-0000-0000-0000-000000000001', 'Pat',   'Parker', 'pat.ready33@example.com', 'parent'),
 ('33300000-0000-0000-0000-000000000002', '23300000-0000-0000-0000-000000000002', 'Quinn', 'Quill',  'quinn.ready33@example.com', 'parent');
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-000000003301', 'pat.ready33@example.com'),
 ('00000000-0000-0000-0000-000000003302', 'quinn.ready33@example.com');

-- 5 spots, $10 a scout.
insert into public.events (id, title, category, starts_at, rsvp_enabled, rsvp_limit, fee_scout_cents) values
 ('53300000-0000-0000-0000-000000000001', 'Limited Campout', 'Campout', now() + interval '20 days', true, 5, 1000);

-- as(who): sign in as A/B/C/P/Q for the rest of the transaction.
create function test.as33(who text) returns void language plpgsql as $$
begin
    perform set_config('request.jwt.claims', json_build_object('sub', case who
        when 'A' then '00000000-0000-0000-0000-00000000000a'
        when 'B' then '00000000-0000-0000-0000-00000000000b'
        when 'C' then '00000000-0000-0000-0000-00000000000c'
        when 'P' then '00000000-0000-0000-0000-000000003301'
        when 'Q' then '00000000-0000-0000-0000-000000003302' end, 'aal', 'aal2')::text, true);
end $$;
grant execute on function test.as33(text) to authenticated;

-- The family's RSVP row (read as the superuser).
create function test.r33(fam text) returns public.event_rsvps language sql as $$
    select * from public.event_rsvps where event_id = '53300000-0000-0000-0000-000000000001'
       and family_id = case fam when 'A' then '20000000-0000-0000-0000-000000000001'
                                when 'B' then '20000000-0000-0000-0000-000000000002'
                                when 'P' then '23300000-0000-0000-0000-000000000001'
                                when 'Q' then '23300000-0000-0000-0000-000000000002' end::uuid
$$;
-- The family's open RSVP charge for the event, in cents (null = none).
create function test.c33(fam text) returns int language sql as $$
    select amount_cents from public.charges where event_id = '53300000-0000-0000-0000-000000000001'
       and source = 'rsvp' and status = 'open'
       and family_id = case fam when 'A' then '20000000-0000-0000-0000-000000000001'
                                when 'B' then '20000000-0000-0000-0000-000000000002'
                                when 'P' then '23300000-0000-0000-0000-000000000001'
                                when 'Q' then '23300000-0000-0000-0000-000000000002' end::uuid
$$;

\echo '== Waitlist: the limit'
select test.expect_error($$update public.events set rsvp_limit = 0 where id = '53300000-0000-0000-0000-000000000001'$$, '23514',
                         'a limit of 0 is refused');
select test.expect_error($$update public.events set rsvp_limit = 501 where id = '53300000-0000-0000-0000-000000000001'$$, '23514',
                         'a limit over 500 is refused');

\echo '== Waitlist: families answer'
begin; set local role authenticated; select test.as33('A');
select public.set_rsvp('53300000-0000-0000-0000-000000000001', 'yes', 2, 1, null);
commit;
select test.check(not (test.r33('A')).waitlisted, 'the first family (3 people) is in');
select test.check(test.c33('A') = 2000, 'and is charged for their 2 scouts');

begin; set local role authenticated; select test.as33('B');
select public.set_rsvp('53300000-0000-0000-0000-000000000001', 'yes', 1, 2, null);
commit;
select test.check((test.r33('B')).waitlisted, 'a family that does not fit (3 + 3 > 5) goes on the waitlist');
select test.check((test.r33('B')).scouts = 1 and (test.r33('B')).adults = 2, 'their numbers are kept');
select test.check(test.c33('B') is null, 'a waitlisted family is not charged');

begin; set local role authenticated; select test.as33('P');
select public.set_rsvp('53300000-0000-0000-0000-000000000001', 'yes', 1, 0, null);
select test.check((select families_yes = 1 and scouts = 2 and adults = 1 and families_waitlist = 2 and waitlist_people = 4
                          and rsvp_limit = 5 and my_waitlist_spot = 2
                     from public.rsvp_counts('53300000-0000-0000-0000-000000000001')),
                  'headcount counts the waitlist apart, with the limit and my place in line (#2)');
commit;
select test.check((test.r33('P')).waitlisted, 'a family that would fit still waits behind families already waiting');

begin; set local role authenticated; select test.as33('A');
select test.check((select my_waitlist_spot is null from public.rsvp_counts('53300000-0000-0000-0000-000000000001')),
                  'a family that is in has no place in line');
select test.check(private.going_to_event('53300000-0000-0000-0000-000000000001'), 'a family that is in is going');
select public.set_rsvp('53300000-0000-0000-0000-000000000001', 'yes', 4, 1, null);
select test.check(not (test.r33('A')).waitlisted, 'a family that is in can grow into the spots left');
select test.expect_error($$select public.set_rsvp('53300000-0000-0000-0000-000000000001', 'yes', 5, 1, null)$$, '22023',
                         'but not past the limit');
select test.check((test.r33('A')).scouts = 4, 'and keeps their spot when they try');
commit;

begin; set local role authenticated; select test.as33('P');
select test.check(not private.going_to_event('53300000-0000-0000-0000-000000000001'), 'a waitlisted family is not going yet (no Signal link)');
commit;

\echo '== Waitlist: spots open up'
begin; set local role authenticated; select test.as33('A');
select public.set_rsvp('53300000-0000-0000-0000-000000000001', 'yes', 1, 1, null);
commit;
select test.check(not (test.r33('B')).waitlisted and (test.r33('B')).promoted_at is not null,
                  'when a family cuts their numbers, the next family moves in and it is recorded');
select test.check(test.c33('B') = 1000, 'and the family that moved in is charged');
select test.check(test.c33('A') = 1000, 'the smaller family pays less');
select test.check((test.r33('P')).waitlisted, 'a family that still does not fit keeps waiting (2 + 3 + 1 > 5)');
begin; set local role authenticated; select test.as33('P');
select test.check((select my_waitlist_spot = 1 from public.rsvp_counts('53300000-0000-0000-0000-000000000001')), 'and is now next in line');
commit;

begin; set local role authenticated; select test.as33('B');
select public.set_rsvp('53300000-0000-0000-0000-000000000001', 'yes', 1, 2, 'Bringing a tent');
commit;
select test.check(not (test.r33('B')).waitlisted, 'answering again keeps a family in');

begin; set local role authenticated; select test.as33('A');
select public.set_rsvp('53300000-0000-0000-0000-000000000001', 'no', 0, 0, null);
commit;
select test.check(test.c33('A') is null, 'a family that cancels is no longer charged');
select test.check(not (test.r33('P')).waitlisted and (test.r33('P')).promoted_at is not null, 'and the next family moves in');
select test.check(test.c33('P') = 1000, 'and is charged');

\echo '== Waitlist: maybe, and the leader changes the limit'
begin; set local role authenticated; select test.as33('Q');
select public.set_rsvp('53300000-0000-0000-0000-000000000001', 'yes', 1, 1, null);
commit;
select test.check((test.r33('Q')).waitlisted, 'a family that does not fit (4 + 2 > 5) waits');
begin; set local role authenticated; select test.as33('Q');
select public.set_rsvp('53300000-0000-0000-0000-000000000001', 'maybe', 1, 1, null);
commit;
select test.check(not (test.r33('Q')).waitlisted and (test.r33('Q')).waitlisted_at is null, 'a maybe is not on the waitlist');
begin; set local role authenticated; select test.as33('Q');
select public.set_rsvp('53300000-0000-0000-0000-000000000001', 'yes', 1, 1, null);
commit;
select test.check((test.r33('Q')).waitlisted, 'saying yes again goes back on the waitlist');

begin; set local role authenticated; select test.as33('C');
update public.events set rsvp_limit = 10 where id = '53300000-0000-0000-0000-000000000001';
commit;
select test.check(not (test.r33('Q')).waitlisted and test.c33('Q') = 1000, 'raising the limit lets the waitlist in');

\echo '== Waitlist: a leader removes an RSVP'
update public.events set rsvp_limit = 4 where id = '53300000-0000-0000-0000-000000000001';
select test.check(not (test.r33('Q')).waitlisted, 'lowering the limit never bumps a family that is in');
begin; set local role authenticated; select test.as33('A');
select public.set_rsvp('53300000-0000-0000-0000-000000000001', 'yes', 1, 0, null);
commit;
select test.check((test.r33('A')).waitlisted, 'over the limit, a new yes waits');
begin; set local role authenticated; select test.as33('C');
delete from public.event_rsvps where event_id = '53300000-0000-0000-0000-000000000001' and family_id = '23300000-0000-0000-0000-000000000002';
commit;
select test.check((test.r33('A')).waitlisted, 'still waiting while it does not fit (3 + 1 + 1 > 4)');
begin; set local role authenticated; select test.as33('C');
delete from public.event_rsvps where event_id = '53300000-0000-0000-0000-000000000001' and family_id = '23300000-0000-0000-0000-000000000001';
commit;
select test.check(not (test.r33('A')).waitlisted and test.c33('A') = 1000, 'and moves in once a leader removes another answer');

update public.events set rsvp_limit = null where id = '53300000-0000-0000-0000-000000000001';
begin; set local role authenticated; select test.as33('Q');
select public.set_rsvp('53300000-0000-0000-0000-000000000001', 'yes', 3, 2, null);
commit;
select test.check(not (test.r33('Q')).waitlisted, 'with no limit nobody waits');

select test.expect_error($$update public.event_rsvps set waitlisted = true, waitlisted_at = null
                            where event_id = '53300000-0000-0000-0000-000000000001'$$, '23514',
                         'a waitlisted answer always has its place in line');
select test.expect_error($$update public.event_rsvps set status = 'maybe', waitlisted = true, waitlisted_at = now()
                            where event_id = '53300000-0000-0000-0000-000000000001'$$, '23514',
                         'only a yes can be waitlisted');

\echo '== Ready to go: reminders'
begin; set local role authenticated; select test.as33('B');
select test.expect_error($$select public.claim_event_reminder('53300000-0000-0000-0000-000000000001', 'medical', 2)$$, '42501',
                         'families cannot send reminders');
commit;
begin; set local role authenticated; select test.as33('C');
select test.check(public.claim_event_reminder('53300000-0000-0000-0000-000000000001', 'medical', 2), 'a leader sends a reminder');
select test.check(not public.claim_event_reminder('53300000-0000-0000-0000-000000000001', 'medical', 2),
                  'the same reminder cannot go out again right away');
select test.check(public.claim_event_reminder('53300000-0000-0000-0000-000000000001', 'pay', 1), 'a different reminder can');
select test.expect_error($$select public.claim_event_reminder('53300000-0000-0000-0000-000000000001', 'cookies', 1)$$, '22023',
                         'only known reminders');
select test.check(test.count('select * from public.event_reminders') = 2, 'leaders see when reminders went out');
commit;
begin; set local role authenticated; select test.as33('B');
select test.check(test.count('select * from public.event_reminders') = 0, 'families do not');
select test.expect_error($$insert into public.event_reminders (event_id, kind) values ('53300000-0000-0000-0000-000000000001', 'jobs')$$, '42501',
                         'nobody writes reminders directly');
commit;
update public.event_reminders set sent_at = now() - interval '13 hours' where kind = 'medical';
begin; set local role authenticated; select test.as33('C');
select test.check(public.claim_event_reminder('53300000-0000-0000-0000-000000000001', 'medical', 2), 'after 12 hours it can go out again');
commit;

delete from public.events where id = '53300000-0000-0000-0000-000000000001';
select test.check(test.count($$select * from public.event_reminders where event_id = '53300000-0000-0000-0000-000000000001'$$) = 0,
                  'reminders go with their event');

\echo '== READY AND WAITLIST TESTS PASSED'
