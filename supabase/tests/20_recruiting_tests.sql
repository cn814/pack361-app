-- Recruiting: the public join page lists only the upcoming events leaders picked, with no address.
\set QUIET on
set client_min_messages = notice;

insert into public.events (id, title, category, starts_at, ends_at, location_name, address, details, public_on_join, public_blurb) values
 ('57000000-0000-0000-0000-000000000001', 'Pinewood Derby', 'Derby', now() + interval '10 days', null, 'Church hall', '123 Main St', 'Secret gate code 1234', true, 'Come watch the race.'),
 ('57000000-0000-0000-0000-000000000002', 'Committee meeting', 'Committee', now() + interval '5 days', null, 'Kevin''s house', '9 Elm St', null, false, null),
 ('57000000-0000-0000-0000-000000000003', 'Last year''s derby', 'Derby', now() - interval '300 days', null, 'Church hall', null, null, true, null);
insert into public.events (id, title, category, starts_at, public_on_join, leaders_only) values
 ('57000000-0000-0000-0000-000000000004', 'Leaders planning night', 'Committee', now() + interval '3 days', true, true);

begin;
set local role anon;
select test.check(test.count('select * from public.join_page_events()') = 1, 'the public page lists only upcoming events leaders picked');
select test.check((select title from public.join_page_events() limit 1) = 'Pinewood Derby', 'the picked event is listed');
select test.check((select public_blurb from public.join_page_events() limit 1) = 'Come watch the race.', 'with its public note');
select test.expect_error('select address from public.join_page_events()', '42703', 'the address is never part of it');
select test.expect_error('select * from public.events', '42501', 'anon still cannot read events');
rollback;

select test.check((select value from public.pack_settings where key = 'public_site_url') = 'https://app.pack361.org/join',
                  'the shared link starts at the app''s join page');
select test.expect_error($$update public.events set public_blurb = repeat('x', 301) where id = '57000000-0000-0000-0000-000000000001'$$,
                         '23514', 'the public note is short');
