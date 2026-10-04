-- Campout builder (20261012000000_campout_builder.sql): leaders build the schedule, packing list,
-- sections and links; start from a past event; copy an event to a new date; repeating events.
-- A = Alex Smith (parent), C = Lee Leader (den leader), D = Morgan Admin (admin, with their code).
\set QUIET on
set client_min_messages = notice;

-- Last fall's campout (source) and this spring's (target). Fall 2026 crosses the end of daylight
-- saving time (Sun Nov 1), so the copied times must keep their clock time.
insert into public.events (id, title, category, starts_at, ends_at, location_name, rsvp_enabled, rsvp_by,
                           fee_scout_cents, fee_adult_cents, slip_required, slip_text, slip_due, camping_nights, links, sections) values
 ('32100000-0000-0000-0000-000000000001', 'Fall Campout', 'Campout', '2026-10-30 17:30-04', '2026-11-01 10:00-05',
  'Broad Creek', true, '2026-10-23', 3500, 3500, true, 'I agree.', '2026-10-25', null,
  '[{"label": "Sign up", "url": "https://givebutter.com/pack361-campout", "note": "By Oct 23"}]',
  '[{"title": "The basics", "tone": null, "items": ["Arrive Friday"]}, {"title": "Scavenger hunt", "check": true, "items": ["A red leaf", "An acorn"]}]'),
 ('32100000-0000-0000-0000-000000000002', 'Spring Campout', 'Campout', '2027-05-07 18:00-04', '2027-05-09 10:00-04',
  'Camp Ritchie', true, null, null, null, false, null, null, null, '[]', '[]');

insert into public.itinerary_items (event_id, starts_at, title, location, notes) values
 ('32100000-0000-0000-0000-000000000001', '2026-10-30 17:30-04', 'Arrive and set up camp', 'Welcome Center', 'Tents first'),
 ('32100000-0000-0000-0000-000000000001', '2026-10-31 08:30-04', 'Hike', 'Yellow Trail', null),
 ('32100000-0000-0000-0000-000000000001', '2026-11-01 07:00-05', 'Breakfast', null, null);

insert into public.packing_items (id, event_id, category, label, sort_order) values
 ('32200000-0000-0000-0000-000000000001', '32100000-0000-0000-0000-000000000001', 'Sleeping', 'Sleeping bag', 2),
 ('32200000-0000-0000-0000-000000000002', '32100000-0000-0000-0000-000000000001', 'Sleeping', 'Pad', 3),
 ('32200000-0000-0000-0000-000000000003', '32100000-0000-0000-0000-000000000001', 'Every scout carries', 'Water bottle', 1),
 ('32200000-0000-0000-0000-000000000009', '32100000-0000-0000-0000-000000000002', 'Old', 'Something to be replaced', 1);

insert into public.volunteer_slots (id, event_id, role_title, shift_label, starts_at, capacity) values
 ('32300000-0000-0000-0000-000000000001', '32100000-0000-0000-0000-000000000001', 'Breakfast cook', 'Sat 7-8 AM', '2026-10-31 07:00-04', 2);
insert into public.volunteer_signups (slot_id, adult_id) values
 ('32300000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000c');
insert into public.event_signal (event_id, url) values
 ('32100000-0000-0000-0000-000000000001', 'https://signal.group/#FallCampout123');

-- ---------------------------------------------------------------------------
\echo '== Campout builder: who can edit'
select test.check(not has_function_privilege('anon', 'public.copy_event_plan(uuid, uuid, text[])', 'execute')
                  and not has_function_privilege('anon', 'public.copy_event(uuid, date)', 'execute')
                  and not has_function_privilege('anon', 'public.apply_to_series(uuid)', 'execute')
                  and not has_function_privilege('anon', 'public.set_packing_order(uuid, uuid[])', 'execute')
                  and not has_function_privilege('anon', 'private.shift_local(timestamptz, date, date)', 'execute'),
                  'signed-out visitors cannot call the builder functions');
select test.check(has_function_privilege('authenticated', 'public.copy_event(uuid, date)', 'execute'),
                  'signed-in members can call them (the function checks for a leader)');

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal2"}', true);
select test.check(test.count($$select * from public.itinerary_items where event_id = '32100000-0000-0000-0000-000000000001'$$) = 3,
                  'families can read the schedule');
select test.expect_error($$insert into public.itinerary_items (event_id, starts_at, title)
                           values ('32100000-0000-0000-0000-000000000002', now(), 'Sneaky')$$, '42501',
                         'families cannot add to the schedule');
select test.expect_rows($$update public.packing_items set label = 'Hacked'$$, 0, 'families cannot change the packing list');
select test.expect_rows($$delete from public.itinerary_items$$, 0, 'or delete schedule items');
select test.expect_error($$select public.copy_event_plan('32100000-0000-0000-0000-000000000001', '32100000-0000-0000-0000-000000000002', array['schedule'])$$,
                         '42501', 'families cannot copy a plan');
select test.expect_error($$select public.copy_event('32100000-0000-0000-0000-000000000001', '2027-10-29')$$,
                         '42501', 'or copy an event');
select test.expect_error($$select public.set_packing_order('32100000-0000-0000-0000-000000000001', array['32200000-0000-0000-0000-000000000002']::uuid[])$$,
                         '42501', 'or reorder the packing list');
select test.expect_error($$select public.apply_to_series('32100000-0000-0000-0000-000000000001')$$,
                         '42501', 'or change a series');
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);
select test.expect_rows($$insert into public.itinerary_items (event_id, starts_at, title, location)
                          values ('32100000-0000-0000-0000-000000000002', '2027-05-07 19:00-04', 'Campfire', 'Fire ring')$$, 1,
                        'a den leader adds a schedule item');
select test.expect_rows($$update public.packing_items set label = 'Sleeping bag (warm)' where id = '32200000-0000-0000-0000-000000000001'$$, 1,
                        'and edits a packing item in place (same id, so families keep their ticks)');
select test.expect_error($$insert into public.itinerary_items (event_id, starts_at, title)
                           values ('32100000-0000-0000-0000-000000000002', now(), '')$$, '23514',
                         'a schedule item needs a title');
select test.expect_error($$update public.events set links = '[{"label": "Bad", "url": "javascript:alert(1)"}]' where id = '32100000-0000-0000-0000-000000000002'$$,
                         '23514', 'links must be https (no javascript:)');
select test.expect_error($$update public.events set links = '[{"label": "Plain", "url": "http://example.com"}]' where id = '32100000-0000-0000-0000-000000000002'$$,
                         '23514', 'plain http is refused too');
select test.expect_error($$update public.events set links = '[{"label": "No address"}]' where id = '32100000-0000-0000-0000-000000000002'$$,
                         '23514', 'a link needs an address');
select test.expect_error($$update public.events set sections = '[{"body": "No title"}]' where id = '32100000-0000-0000-0000-000000000002'$$,
                         '23514', 'a section needs a title');
select test.expect_rows($$update public.events set links = '[{"label": "Map", "url": "https://maps.example.com/x"}]' where id = '32100000-0000-0000-0000-000000000002'$$,
                        1, 'an https link saves');
rollback;

-- ---------------------------------------------------------------------------
\echo '== Campout builder: start from a past event'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);
select public.copy_event_plan('32100000-0000-0000-0000-000000000001', '32100000-0000-0000-0000-000000000002',
                              array['schedule', 'packing', 'sections', 'links']);
select test.check(test.count($$select * from public.itinerary_items where event_id = '32100000-0000-0000-0000-000000000002'$$) = 3,
                  'the schedule is copied');
select test.check(exists (select 1 from public.itinerary_items where event_id = '32100000-0000-0000-0000-000000000002'
                           and title = 'Arrive and set up camp' and location = 'Welcome Center' and notes = 'Tents first'
                           and (starts_at at time zone 'America/New_York')::text = '2027-05-07 17:30:00'),
                  'the first day moves to the new start date, same clock time');
select test.check(exists (select 1 from public.itinerary_items where event_id = '32100000-0000-0000-0000-000000000002'
                           and title = 'Hike' and (starts_at at time zone 'America/New_York')::text = '2027-05-08 08:30:00'),
                  'the second day stays the second day');
select test.check(exists (select 1 from public.itinerary_items where event_id = '32100000-0000-0000-0000-000000000002'
                           and title = 'Breakfast' and (starts_at at time zone 'America/New_York')::text = '2027-05-09 07:00:00'),
                  'a 7:00 AM breakfast stays at 7:00 AM across a daylight saving change');
select test.check(test.count($$select * from public.packing_items where event_id = '32100000-0000-0000-0000-000000000002'$$) = 3
                  and not exists (select 1 from public.packing_items where id = '32200000-0000-0000-0000-000000000009'),
                  'the packing list replaces the old one');
select test.check((select string_agg(label, ', ' order by sort_order) from public.packing_items
                    where event_id = '32100000-0000-0000-0000-000000000002') = 'Water bottle, Sleeping bag, Pad',
                  'in the same order');
select test.check(test.count($$select * from public.packing_items where event_id = '32100000-0000-0000-0000-000000000001'$$) = 3,
                  'the past event keeps its own list');
select test.check((select jsonb_array_length(sections) = 2 and links -> 0 ->> 'label' = 'Sign up'
                     from public.events where id = '32100000-0000-0000-0000-000000000002'),
                  'sections and links are copied');
select public.copy_event_plan('32100000-0000-0000-0000-000000000001', '32100000-0000-0000-0000-000000000002', array['links']);
select test.check(test.count($$select * from public.itinerary_items where event_id = '32100000-0000-0000-0000-000000000002'$$) = 3,
                  'copying just one part leaves the others alone');
select test.expect_error($$select public.copy_event_plan('32100000-0000-0000-0000-000000000002', '32100000-0000-0000-0000-000000000002', array['links'])$$,
                         '22023', 'an event cannot copy from itself');
rollback;

-- ---------------------------------------------------------------------------
\echo '== Campout builder: packing list order'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);
select public.set_packing_order('32100000-0000-0000-0000-000000000001',
       array['32200000-0000-0000-0000-000000000002', '32200000-0000-0000-0000-000000000001',
             '32200000-0000-0000-0000-000000000003', '32200000-0000-0000-0000-000000000009']::uuid[]);
select test.check((select string_agg(label, ', ' order by sort_order) from public.packing_items
                    where event_id = '32100000-0000-0000-0000-000000000001') = 'Pad, Sleeping bag, Water bottle',
                  'leaders reorder the packing list');
select test.check((select sort_order from public.packing_items where id = '32200000-0000-0000-0000-000000000009') = 1,
                  'items of another event are left alone');
rollback;

-- ---------------------------------------------------------------------------
\echo '== Campout builder: copy an event'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);
create temp table copied on commit drop as
  select public.copy_event('32100000-0000-0000-0000-000000000001', '2027-10-29') as id;
select test.check((select title = 'Fall Campout' and category = 'Campout' and location_name = 'Broad Creek'
                          and (starts_at at time zone 'America/New_York')::text = '2027-10-29 17:30:00'
                          and (ends_at at time zone 'America/New_York')::text = '2027-10-31 10:00:00'
                          and rsvp_enabled and rsvp_by = '2027-10-22' and slip_required and slip_text = 'I agree.'
                          and slip_due = '2027-10-24' and source = 'manual' and series_id is null and archived_at is null
                          and created_by = '30000000-0000-0000-0000-00000000000c'
                          and jsonb_array_length(sections) = 2 and jsonb_array_length(links) = 1
                     from public.events where id = (select id from copied)),
                  'a den leader copies an event to a new date: details, dates and deadlines moved together');
select test.check((select fee_scout_cents is null and fee_adult_cents is null from public.events where id = (select id from copied)),
                  'a den leader''s copy has no cost (only the committee sets prices)');
select test.check(test.count($$select * from public.itinerary_items where event_id = (select id from copied)$$) = 3
                  and exists (select 1 from public.itinerary_items where event_id = (select id from copied) and title = 'Breakfast'
                               and (starts_at at time zone 'America/New_York')::text = '2027-10-31 07:00:00'),
                  'the schedule comes along, moved to the new dates');
select test.check(test.count($$select * from public.packing_items where event_id = (select id from copied)$$) = 3,
                  'the packing list comes along');
select test.check(exists (select 1 from public.volunteer_slots where event_id = (select id from copied)
                           and role_title = 'Breakfast cook' and capacity = 2
                           and (starts_at at time zone 'America/New_York')::text = '2027-10-30 07:00:00'),
                  'volunteer jobs come along');
select test.check(not exists (select 1 from public.volunteer_signups s join public.volunteer_slots v on v.id = s.slot_id
                               where v.event_id = (select id from copied)),
                  'but not who signed up');
select test.check(not exists (select 1 from public.event_signal where event_id = (select id from copied)),
                  'and not the Signal group');
select test.check(not exists (select 1 from public.event_rsvps where event_id = (select id from copied)),
                  'and no RSVPs');
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","aal":"aal2"}', true);
create temp table copied on commit drop as
  select public.copy_event('32100000-0000-0000-0000-000000000001', '2027-10-29') as id;
select test.check((select fee_scout_cents = 3500 and fee_adult_cents = 3500
                     from public.events where id = (select id from copied)),
                  'the committee''s copy keeps the cost');
rollback;

-- The RSVP limit column comes with the RSVP waitlist migration; check it only when it's there.
do $$
declare v uuid;
begin
    if exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'events' and column_name = 'rsvp_limit') then
        execute 'update public.events set rsvp_limit = 40 where id = $1' using '32100000-0000-0000-0000-000000000001'::uuid;
        perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);
        v := public.copy_event('32100000-0000-0000-0000-000000000001', '2028-10-27');
        execute 'select test.check((select rsvp_limit = 40 from public.events where id = $1), ''the RSVP limit is copied'')' using v;
        delete from public.events where id = v;
        execute 'update public.events set rsvp_limit = null where id = $1' using '32100000-0000-0000-0000-000000000001'::uuid;
        perform set_config('request.jwt.claims', '', true);
    else
        raise notice 'PASS: (no rsvp_limit column yet; RSVP limit copy not checked)';
    end if;
end $$;

-- ---------------------------------------------------------------------------
\echo '== Campout builder: repeating events'
insert into public.events (id, title, category, starts_at, ends_at, location_name, series_id, archived_at) values
 ('32400000-0000-0000-0000-000000000001', 'Den night', 'Den', now() - interval '7 days', null, 'Church', '32500000-0000-0000-0000-000000000001', null),
 ('32400000-0000-0000-0000-000000000002', 'Den night', 'Den', '2027-01-05 18:30-05', '2027-01-05 20:00-05', 'Church', '32500000-0000-0000-0000-000000000001', null),
 ('32400000-0000-0000-0000-000000000003', 'Den night', 'Den', '2027-06-01 18:30-04', '2027-06-01 20:00-04', 'Church', '32500000-0000-0000-0000-000000000001', null),
 ('32400000-0000-0000-0000-000000000004', 'Den night', 'Den', '2027-06-15 18:30-04', null, 'Church', '32500000-0000-0000-0000-000000000001', now()),
 ('32400000-0000-0000-0000-000000000005', 'Den night', 'Den', '2027-06-08 18:30-04', null, 'Church', null, null);

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);
update public.events set title = 'Bear den night', location_name = 'Library', details = 'Bring your handbook',
                         starts_at = '2027-01-05 19:00-05', ends_at = '2027-01-05 20:30-05'
 where id = '32400000-0000-0000-0000-000000000002';
select test.check(public.apply_to_series('32400000-0000-0000-0000-000000000002') = 1,
                  'changing one event updates the other upcoming one in the series');
select test.check((select title = 'Bear den night' and location_name = 'Library' and details = 'Bring your handbook' and source = 'manual'
                          and (starts_at at time zone 'America/New_York')::text = '2027-06-01 19:00:00'
                          and (ends_at at time zone 'America/New_York')::text = '2027-06-01 20:30:00'
                     from public.events where id = '32400000-0000-0000-0000-000000000003'),
                  'with the new name, place, details and times, on its own date (summer time)');
select test.check((select title = 'Den night' from public.events where id = '32400000-0000-0000-0000-000000000001'),
                  'past events in the series stay as they were');
select test.check((select title = 'Den night' from public.events where id = '32400000-0000-0000-0000-000000000004'),
                  'archived ones too');
select test.check((select title = 'Den night' from public.events where id = '32400000-0000-0000-0000-000000000005'),
                  'and events outside the series');
select test.check(public.apply_to_series('32400000-0000-0000-0000-000000000005') = 0,
                  'an event that is not in a series changes nothing else');
rollback;

delete from public.events where id::text like '32100000-%' or id::text like '32400000-%';
select test.check(test.count($$select * from public.itinerary_items where event_id::text like '32100000-%'$$) = 0,
                  'schedule and packing items go with their event');

\echo '== CAMPOUT BUILDER TESTS PASSED'
