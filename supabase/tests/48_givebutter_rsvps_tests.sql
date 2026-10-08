-- Givebutter sign-ups fill in RSVPs. A = Alex Smith (family 1), B = Blair Jones (family 2).
\set QUIET on
set client_min_messages = notice;

insert into public.events (id, title, category, starts_at, rsvp_enabled, rsvp_limit) values
 ('54800000-0000-0000-0000-000000000001', 'Givebutter Campout', 'Campout', now() + interval '20 days', true, 3);

create function test.r48(fam text) returns public.event_rsvps language sql as $$
    select * from public.event_rsvps where event_id = '54800000-0000-0000-0000-000000000001'
       and family_id = case fam when 'A' then '20000000-0000-0000-0000-000000000001'
                                when 'B' then '20000000-0000-0000-0000-000000000002' end::uuid
$$;

\echo '== Givebutter RSVPs: only the sync'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal2"}', true);
select test.expect_error($$select * from public.sync_givebutter_rsvps(array['54800000-0000-0000-0000-000000000001']::uuid[], '[]')$$, '42501',
                         'a family can''t call the Givebutter sync');
rollback;

\echo '== Givebutter RSVPs: a paid family is going'
set role service_role;
select test.check((select added = 1 from public.sync_givebutter_rsvps(array['54800000-0000-0000-0000-000000000001']::uuid[],
    '[{"event_id":"54800000-0000-0000-0000-000000000001","family_id":"20000000-0000-0000-0000-000000000001","scouts":1,"siblings":2,"adults":2,"paid_at":"2026-10-01T12:00:00Z"}]')),
    'the sync adds an RSVP');
reset role;
select test.check((test.r48('A')).status = 'yes' and (test.r48('A')).siblings = 2 and (test.r48('A')).adults = 2
                  and not (test.r48('A')).waitlisted, 'going, with the ticket counts, never waitlisted (even past the limit)');
select test.check((test.r48('A')).givebutter_at is not null, 'and marked as from Givebutter');
select test.check(not exists (select 1 from public.charges where event_id = '54800000-0000-0000-0000-000000000001'),
                  'no app charge: they paid on Givebutter');

\echo '== Givebutter RSVPs: kept up to date'
set role service_role;
select test.check((select updated = 1 from public.sync_givebutter_rsvps(array['54800000-0000-0000-0000-000000000001']::uuid[],
    '[{"event_id":"54800000-0000-0000-0000-000000000001","family_id":"20000000-0000-0000-0000-000000000001","scouts":1,"siblings":1,"adults":2,"paid_at":"2026-10-01T12:00:00Z"}]')),
    'a changed count is updated');
select test.check((select added + updated + removed = 0 from public.sync_givebutter_rsvps(array['54800000-0000-0000-0000-000000000001']::uuid[],
    '[{"event_id":"54800000-0000-0000-0000-000000000001","family_id":"20000000-0000-0000-0000-000000000001","scouts":1,"siblings":1,"adults":2,"paid_at":"2026-10-01T12:00:00Z"}]')),
    'nothing changed, nothing written');
reset role;

\echo '== Givebutter RSVPs: the family''s own answer'
begin; set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal2"}', true);
select public.set_rsvp('54800000-0000-0000-0000-000000000001', 'yes', 1, 2, null, 0);
commit;
set role service_role;
select test.check((select updated = 0 from public.sync_givebutter_rsvps(array['54800000-0000-0000-0000-000000000001']::uuid[],
    '[{"event_id":"54800000-0000-0000-0000-000000000001","family_id":"20000000-0000-0000-0000-000000000001","scouts":1,"siblings":1,"adults":2,"paid_at":"2026-10-01T12:00:00Z"}]')),
    'a family that fixed its numbers in the app after paying keeps them');
reset role;
select test.check((test.r48('A')).siblings = 0, 'their own count stands');
set role service_role;
select test.check((select updated = 1 from public.sync_givebutter_rsvps(array['54800000-0000-0000-0000-000000000001']::uuid[],
    jsonb_build_array(jsonb_build_object('event_id','54800000-0000-0000-0000-000000000001','family_id','20000000-0000-0000-0000-000000000001',
                                         'scouts',2,'siblings',1,'adults',2,'paid_at', now() + interval '1 minute')))),
    'but a newer Givebutter order (paid after their answer) wins');
reset role;

\echo '== Givebutter RSVPs: refunded'
set role service_role;
select test.check((select added = 1 from public.sync_givebutter_rsvps(array['54800000-0000-0000-0000-000000000001']::uuid[],
    '[{"event_id":"54800000-0000-0000-0000-000000000001","family_id":"20000000-0000-0000-0000-000000000002","scouts":1,"siblings":0,"adults":1}]')),
    'a second family signs up');
select test.check((select removed = 1 from public.sync_givebutter_rsvps(array['54800000-0000-0000-0000-000000000001']::uuid[],
    '[{"event_id":"54800000-0000-0000-0000-000000000001","family_id":"20000000-0000-0000-0000-000000000001","scouts":2,"siblings":1,"adults":2}]')),
    'their order is gone: the RSVP the sync made is removed');
reset role;
select test.check(test.r48('B') is null or (test.r48('B')).id is null, 'the refunded family has no RSVP');
select test.check((test.r48('A')).status = 'yes', 'the other family is still going');

set role service_role;
select test.check((select added = 0 from public.sync_givebutter_rsvps(array[]::uuid[],
    '[{"event_id":"54800000-0000-0000-0000-000000000001","family_id":"20000000-0000-0000-0000-000000000002","scouts":1,"siblings":0,"adults":1}]')),
    'only the events the sync names are touched');
reset role;

\echo '== Payment RSVPs: paid in the app'
insert into public.events (id, title, category, starts_at, rsvp_enabled) values
 ('54800000-0000-0000-0000-000000000002', 'PayPal Outing', 'Outing', now() + interval '20 days', true);
set role service_role;
select test.check((select added = 1 from public.sync_givebutter_rsvps(array['54800000-0000-0000-0000-000000000002']::uuid[],
    '[{"event_id":"54800000-0000-0000-0000-000000000002","family_id":"20000000-0000-0000-0000-000000000002","scouts":1,"siblings":0,"adults":1,"only_if_missing":true}]')),
    'a family that paid with no answer is marked going');
reset role;
begin; set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal2"}', true);
select public.set_rsvp('54800000-0000-0000-0000-000000000002', 'yes', 2, 2, null, 1);
commit;
set role service_role;
select test.check((select updated = 0 from public.sync_givebutter_rsvps(array['54800000-0000-0000-0000-000000000002']::uuid[],
    jsonb_build_array(
      jsonb_build_object('event_id','54800000-0000-0000-0000-000000000002','family_id','20000000-0000-0000-0000-000000000002','scouts',1,'siblings',0,'adults',1,'only_if_missing',true),
      jsonb_build_object('event_id','54800000-0000-0000-0000-000000000002','family_id','20000000-0000-0000-0000-000000000001','scouts',1,'siblings',0,'adults',1,'only_if_missing',true,'paid_at', now() + interval '1 minute')))),
    'a family''s own yes and numbers stand, even when they paid after');
reset role;
select test.check((select siblings = 1 and adults = 2 from public.event_rsvps where event_id = '54800000-0000-0000-0000-000000000002'
                    and family_id = '20000000-0000-0000-0000-000000000001'), 'their counts are kept');
begin; set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal2"}', true);
select public.set_rsvp('54800000-0000-0000-0000-000000000002', 'maybe', 1, 1, null, 0);
commit;
set role service_role;
select test.check((select updated = 1 from public.sync_givebutter_rsvps(array['54800000-0000-0000-0000-000000000002']::uuid[],
    jsonb_build_array(
      jsonb_build_object('event_id','54800000-0000-0000-0000-000000000002','family_id','20000000-0000-0000-0000-000000000002','scouts',1,'siblings',0,'adults',1,'only_if_missing',true),
      jsonb_build_object('event_id','54800000-0000-0000-0000-000000000002','family_id','20000000-0000-0000-0000-000000000001','scouts',1,'siblings',0,'adults',1,'only_if_missing',true,'paid_at', now() + interval '1 minute')))),
    'a maybe older than the payment becomes going');
reset role;
select test.check((select status = 'yes' and scouts = 1 and adults = 1 from public.event_rsvps where event_id = '54800000-0000-0000-0000-000000000002'
                    and family_id = '20000000-0000-0000-0000-000000000001'), 'keeping their own numbers');
