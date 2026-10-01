-- Den names without the number, and all-day events taking RSVPs through their last day.
\set QUIET on
set client_min_messages = notice;

select test.check((select name from public.dens where id = '10000000-0000-0000-0000-000000000002') = 'Bear'
                  or (select rank::text from public.dens where id = '10000000-0000-0000-0000-000000000002') <> 'bear',
                  'den names are just the rank');
select test.check(not exists (select 1 from public.dens where name like '% Den %'), 'no den name carries a number');

insert into public.events (id, title, category, starts_at, ends_at, all_day, rsvp_enabled) values
 ('56000000-0000-0000-0000-000000000001', 'Sale Day', 'Fundraiser',
  ((now() at time zone 'America/New_York')::date)::timestamp at time zone 'America/New_York',
  ((now() at time zone 'America/New_York')::date)::timestamp at time zone 'America/New_York', true, true),
 ('56000000-0000-0000-0000-000000000002', 'Yesterday Sale', 'Fundraiser',
  ((now() at time zone 'America/New_York')::date - 1)::timestamp at time zone 'America/New_York',
  ((now() at time zone 'America/New_York')::date - 1)::timestamp at time zone 'America/New_York', true, true);

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', true);
select public.set_rsvp('56000000-0000-0000-0000-000000000001', 'yes', 1, 1, null);
select test.check(test.count($$select * from public.event_rsvps where event_id = '56000000-0000-0000-0000-000000000001'$$) = 1,
                  'an all-day event takes RSVPs all through its day');
select test.expect_error($$select public.set_rsvp('56000000-0000-0000-0000-000000000002', 'yes', 1, 1, null)$$, '22023',
                         'an all-day event that ended yesterday is closed');
rollback;
