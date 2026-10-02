-- Security review fixes (2026-10-02): limits, poll edits, calendar link reset, uploads.
\set QUIET on
set client_min_messages = notice;

-- Lee (den leader) makes a poll; families vote.
insert into public.polls (id, question, options, created_by) values
 ('90000000-0000-0000-0000-0000000000a1', 'Pizza or tacos?', array['Pizza', 'Tacos'], '30000000-0000-0000-0000-00000000000c');

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', true);
select test.expect_error($$update public.polls set options = array['Tacos', 'Pizza'] where id = '90000000-0000-0000-0000-0000000000a1'$$,
                         '42501', 'a poll''s options can''t be changed after it''s posted');
select test.expect_error($$update public.polls set question = 'Something else' where id = '90000000-0000-0000-0000-0000000000a1'$$,
                         '42501', 'nor its question');
select test.expect_rows($$update public.polls set closes_at = now() + interval '2 days' where id = '90000000-0000-0000-0000-0000000000a1'$$,
                        1, 'the creator can still change when it closes');
rollback;

-- Lee stops being a leader: no more editing or deleting the old poll.
update public.adults set role = 'parent' where id = '30000000-0000-0000-0000-00000000000c';
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', true);
select test.expect_rows($$update public.polls set closed_at = now() where id = '90000000-0000-0000-0000-0000000000a1'$$, 0,
                        'someone who is no longer a leader can''t close their old poll');
select test.expect_rows($$delete from public.polls where id = '90000000-0000-0000-0000-0000000000a1'$$, 0, 'or delete it');
rollback;
update public.adults set role = 'den_leader' where id = '30000000-0000-0000-0000-00000000000c';

-- Feedback: ten a day.
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', true);
insert into public.feedback (adult_id, message)
select '30000000-0000-0000-0000-00000000000a', 'note ' || g from generate_series(1, 10) g;
select test.expect_error($$insert into public.feedback (adult_id, message) values ('30000000-0000-0000-0000-00000000000a', 'one more')$$,
                         '54000', 'at most ten messages a day per person');
rollback;

-- Calendar link: a new one on request, only for yourself.
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', true);
create temp table before_token as select calendar_token from public.adults where id = '30000000-0000-0000-0000-00000000000a';
select public.reset_calendar_token();
select test.check((select calendar_token from public.adults where id = '30000000-0000-0000-0000-00000000000a') <> (select calendar_token from before_token),
                  'a parent can get a new calendar link');
rollback;
begin;
set local role anon;
select test.expect_error('select public.reset_calendar_token()', '42501', 'anon cannot reset calendar links');
rollback;

-- Uploads.
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', true);
select test.expect_error($$insert into storage.objects (bucket_id, name) values ('advancement-evidence', '30000000-0000-0000-0000-00000000000a/x.html')$$,
                         '42501', 'the unused evidence bucket takes no uploads');
insert into storage.objects (bucket_id, name)
select 'receipts', 'r/30000000-0000-0000-0000-00000000000a/' || g || '.pdf' from generate_series(1, 40) g;
select test.expect_error($$insert into storage.objects (bucket_id, name) values ('receipts', 'r/30000000-0000-0000-0000-00000000000a/41.pdf')$$,
                         '42501', 'at most 40 receipt files a day per person');
insert into storage.objects (bucket_id, name)
select 'pack-photos', '30000000-0000-0000-0000-00000000000a/' || g || '.jpg' from generate_series(1, 299) g;
select test.expect_error($$insert into storage.objects (bucket_id, name) values ('pack-photos', '30000000-0000-0000-0000-00000000000a/x.jpg')$$,
                         '42501', 'at most 300 photo files a day per family member');
rollback;

begin;
select test.check(not has_function_privilege('anon', 'private.is_committee()', 'execute'), 'signed-out visitors can''t run helper functions');
rollback;
begin;
select test.check(has_function_privilege('authenticated', 'private.can_see_event(uuid)', 'execute'), 'signed-in members still can');
rollback;
