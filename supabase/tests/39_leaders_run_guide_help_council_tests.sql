-- Den leaders (with their two-step code) run the Pack guide, Help wanted and council events;
-- parents and den leaders without their code still can't. Money stays with key leaders.
\set QUIET on
set client_min_messages = notice;

reset role;
insert into public.council_events (uid, title, starts_at) values ('c39-1', 'District day', now() + interval '20 days');

\echo '== Den leader with their code'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);
select test.expect_rows($$insert into public.guide_pages (slug, title) values ('den-leader-page', 'Den leader page')$$, 1,
                        'a den leader adds a guide page');
select test.expect_rows($$update public.guide_pages set title = 'Edited by a den leader' where slug = 'den-leader-page'$$, 1,
                        'and edits it');
select test.expect_rows($$insert into public.pack_roles (title, open) values ('Pinewood helper', true)$$, 1,
                        'adds a Help wanted job');
select test.expect_rows($$update public.pack_roles set open = false where title = 'Pinewood helper'$$, 1,
                        'closes it');
select test.check(test.count($$select * from public.pack_roles where title = 'Pinewood helper'$$) = 1,
                  'and still sees it once closed');
select test.expect_rows($$delete from public.pack_roles where title = 'Pinewood helper'$$, 1,
                        'and deletes it');
select test.expect_rows($$update public.council_events set status = 'skipped' where uid = 'c39-1'$$, 1,
                        'skips a council event');
select test.expect_rows($$insert into public.pack_settings (key, value) values ('council_calendar_url', 'https://example.org/feed.ics')
                          on conflict (key) do update set value = excluded.value$$, 1,
                        'sets the council calendar link');
select test.check((select count(*) from public.volunteer_load('2000-01-01', '2100-01-01')) > 0,
                  'sees volunteer sign-ups per family');
select test.check(not private.is_committee(), 'but is not a key leader (no Money)');
select test.check(test.count('select * from public.expenses') = 0, 'and sees no expenses');
rollback;

\echo '== Den leader without their code'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal1"}', true);
select test.expect_error($$insert into public.guide_pages (slug, title) values ('nope', 'Nope')$$, '42501',
                         'no guide pages before the code');
select test.expect_error($$insert into public.pack_roles (title) values ('Nope')$$, '42501', 'no Help wanted jobs');
select test.expect_rows($$update public.council_events set status = 'skipped' where uid = 'c39-1'$$, 0, 'no council picks');
rollback;

\echo '== Parent'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal2"}', true);
select test.expect_error($$insert into public.guide_pages (slug, title) values ('nope', 'Nope')$$, '42501', 'parents cannot add guide pages');
select test.expect_error($$insert into public.pack_roles (title) values ('Nope')$$, '42501', 'or Help wanted jobs');
select test.expect_rows($$update public.council_events set status = 'skipped' where uid = 'c39-1'$$, 0, 'or pick council events');
select test.expect_error($$insert into public.pack_settings (key, value) values ('council_calendar_url', 'https://example.org/x.ics')$$, '42501',
                         'or set the council link');
select test.check((select count(*) from public.volunteer_load('2000-01-01', '2100-01-01')) = 0, 'or see volunteer sign-ups');
rollback;

reset role;
delete from public.council_events where uid = 'c39-1';
