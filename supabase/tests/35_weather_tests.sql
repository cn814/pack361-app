-- Weather: event coordinates (from the Census geocoder) and the record of alerts sent to leaders.
-- A = Alex Smith (parent, family 1), C = Lee Leader (den leader).
\set QUIET on
set client_min_messages = notice;

insert into public.events (id, title, category, starts_at, leaders_only) values
 ('b5000000-0000-0000-0000-000000000001', 'Rocket Derby', 'Pack Event', now() + interval '2 days', false),
 ('b5000000-0000-0000-0000-000000000002', 'Fall Campout', 'Campout', now() + interval '20 days', false);

\echo '== Weather: event coordinates'
select test.check((select lat is null and lon is null and geocoded_address is null from public.events
                    where id = 'b5000000-0000-0000-0000-000000000001'), 'events start with no coordinates');
select test.expect_rows($$update public.events set lat = 39.2673, lon = -76.7983, geocoded_address = 'Centennial Park, 10000 Route 108, Ellicott City, MD'
                          where id = 'b5000000-0000-0000-0000-000000000001'$$, 1, 'the server saves coordinates and the address');
select test.check((select lat = 39.2673 and lon = -76.7983 from public.events where id = 'b5000000-0000-0000-0000-000000000001'),
                  'coordinates keep four decimal places');
select test.expect_rows($$update public.events set lat = null, lon = null, geocoded_address = 'Somewhere Park'
                          where id = 'b5000000-0000-0000-0000-000000000002'$$, 1, 'an address the geocoder could not find is kept without coordinates');
select test.expect_error($$update public.events set lat = 91, lon = 0 where id = 'b5000000-0000-0000-0000-000000000002'$$, '23514',
                         'latitude must be on the globe');
select test.expect_error($$update public.events set lat = 0, lon = -181 where id = 'b5000000-0000-0000-0000-000000000002'$$, '23514',
                         'so must longitude');
select test.expect_error($$update public.events set lat = 39.2, lon = null where id = 'b5000000-0000-0000-0000-000000000002'$$, '23514',
                         'latitude and longitude go together');
select test.expect_error($$update public.events set geocoded_address = repeat('x', 1001) where id = 'b5000000-0000-0000-0000-000000000002'$$, '23514',
                         'the looked-up address has a sensible length');

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal2"}', true);
select test.check((select lat is not null from public.events where id = 'b5000000-0000-0000-0000-000000000001'),
                  'families can read an event''s coordinates');
select test.expect_rows($$update public.events set lat = 0, lon = 0 where id = 'b5000000-0000-0000-0000-000000000001'$$, 0,
                        'families cannot change them');
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);
select test.expect_rows($$update public.events set lat = 39.25, lon = -76.8 where id = 'b5000000-0000-0000-0000-000000000001'$$, 1,
                        'leaders can correct them');
rollback;

\echo '== Weather: alerts sent to leaders'
insert into public.weather_alerts_sent (event_id, alert_id, alert_event)
values ('b5000000-0000-0000-0000-000000000001', 'urn:oid:2.49.0.1.840.0.abc.001.1', 'Severe Thunderstorm Watch');
select test.expect_error($$insert into public.weather_alerts_sent (event_id, alert_id, alert_event)
                           values ('b5000000-0000-0000-0000-000000000001', 'urn:oid:2.49.0.1.840.0.abc.001.1', 'Severe Thunderstorm Watch')$$, '23505',
                         'each alert is recorded once per event');
select test.expect_rows($$insert into public.weather_alerts_sent (event_id, alert_id, alert_event)
                          values ('b5000000-0000-0000-0000-000000000002', 'urn:oid:2.49.0.1.840.0.abc.001.1', 'Severe Thunderstorm Watch')$$, 1,
                        'the same alert can go out for another event');
select test.expect_error($$insert into public.weather_alerts_sent (event_id, alert_id) values ('b5000000-0000-0000-0000-000000000001', '')$$, '23514',
                         'an alert id is required');

begin;
set local role service_role;
select test.check(test.count('select * from public.weather_alerts_sent') = 2, 'the server (secret key) reads the record');
select test.expect_rows($$insert into public.weather_alerts_sent (event_id, alert_id, alert_event)
                          values ('b5000000-0000-0000-0000-000000000001', 'urn:oid:2.49.0.1.840.0.abc.002.1', 'Heat Advisory')$$, 1,
                        'and adds to it');
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);
select test.expect_error($$select * from public.weather_alerts_sent$$, '42501', 'leaders do not read it directly');
select test.expect_error($$insert into public.weather_alerts_sent (event_id, alert_id) values ('b5000000-0000-0000-0000-000000000001', 'x')$$, '42501',
                         'or add to it');
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal2"}', true);
select test.expect_error($$select * from public.weather_alerts_sent$$, '42501', 'families cannot read it');
select test.expect_error($$delete from public.weather_alerts_sent$$, '42501', 'or clear it');
rollback;

begin;
set local role anon;
select test.expect_error($$select * from public.weather_alerts_sent$$, '42501', 'signed-out visitors cannot read it');
rollback;

\echo '== Weather: removing the event removes its record'
delete from public.events where id in ('b5000000-0000-0000-0000-000000000001', 'b5000000-0000-0000-0000-000000000002');
select test.check(test.count('select * from public.weather_alerts_sent') = 0, 'sent alerts go with their event');

\echo '== WEATHER TESTS PASSED'
