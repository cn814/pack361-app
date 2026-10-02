-- Row Level Security tests for the Pack 361 schema.
-- Run after the migration:  psql -v ON_ERROR_STOP=1 -f 01_rls_tests.sql
-- Every check prints PASS or aborts with FAIL.
\set QUIET on
set client_min_messages = notice;

create schema test;
grant usage on schema test to anon, authenticated;

create function test.check(ok boolean, msg text) returns void language plpgsql as $$
begin
    if ok is true then raise notice 'PASS: %', msg;
    else raise exception 'FAIL: %', msg; end if;
end $$;

create function test.expect_error(p_sql text, p_state text, p_msg text) returns void language plpgsql as $$
begin
    begin
        execute p_sql;
    exception when others then
        if sqlstate = p_state then raise notice 'PASS: % [% %]', p_msg, sqlstate, sqlerrm; return;
        else raise exception 'FAIL: % (got % %)', p_msg, sqlstate, sqlerrm; end if;
    end;
    raise exception 'FAIL: % (no error raised)', p_msg;
end $$;

create function test.expect_rows(p_sql text, p_n int, p_msg text) returns void language plpgsql as $$
declare n int;
begin
    execute p_sql;
    get diagnostics n = row_count;
    perform test.check(n = p_n, p_msg || ' (rows affected: ' || n || ', expected ' || p_n || ')');
end $$;

create function test.count(p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin execute 'select count(*) from (' || p_sql || ') q' into n; return n; end $$;

grant execute on all functions in schema test to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Fixture data (as the postgres superuser, like an import would)
-- ---------------------------------------------------------------------------
-- Auth accounts: A = Smith parent, B = Jones parent, L = Bear den leader,
-- M = admin, X = stranger (not on roster), S = Smith spouse (signs up first)
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-00000000000a', 'alex.smith@example.com'),
 ('00000000-0000-0000-0000-00000000000b', 'Blair.Jones@Example.com'),   -- mixed case on purpose
 ('00000000-0000-0000-0000-00000000000c', 'lee.leader@example.com'),
 ('00000000-0000-0000-0000-00000000000d', 'morgan.admin@example.com'),
 ('00000000-0000-0000-0000-00000000000e', 'stranger@example.com'),
 ('00000000-0000-0000-0000-00000000000f', 'sam.smith@example.com');

insert into public.dens (id, rank, number) values
 ('10000000-0000-0000-0000-000000000001', 'wolf', 1),
 ('10000000-0000-0000-0000-000000000002', 'bear', 1);

insert into public.families (id, family_name) values
 ('20000000-0000-0000-0000-000000000001', 'Smith'),
 ('20000000-0000-0000-0000-000000000002', 'Jones');

insert into public.adults (id, family_id, first_name, last_name, email, phone, role, position_title) values
 ('30000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001', 'Alex',  'Smith',  'alex.smith@example.com',    '410-555-0101', 'parent', null),
 ('30000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-000000000002', 'Blair', 'Jones',  'blair.jones@example.com',   '410-555-0102', 'parent', null),
 ('30000000-0000-0000-0000-00000000000c', null,                                    'Lee',   'Leader', 'LEE.LEADER@example.com ',   '410-555-0103', 'den_leader', null),
 ('30000000-0000-0000-0000-00000000000d', null,                                    'Morgan','Admin',  'morgan.admin@example.com',  '410-555-0104', 'admin', 'Advancement Chair');

insert into public.den_leaders (den_id, adult_id) values
 ('10000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-00000000000c');

insert into public.scouts (id, family_id, den_id, first_name, last_name) values
 ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Sky',  'Smith'),
 ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'River','Smith'),
 ('40000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Jo',   'Jones');

insert into public.events (id, title, category, starts_at, location_name) values
 ('50000000-0000-0000-0000-000000000001', 'Fall Campout', 'Campout', '2026-10-23 19:00-04', 'Broad Creek Memorial Scout Reservation');

insert into public.volunteer_slots (id, event_id, role_title, capacity) values
 ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'Gear trailer driver', 1);

-- ---------------------------------------------------------------------------
\echo '== Roster linking'
select test.check((select user_id from public.adults where first_name = 'Alex') = '00000000-0000-0000-0000-00000000000a',
                  'adult added after sign-up is linked to their login');
select test.check((select email from public.adults where first_name = 'Lee') = 'lee.leader@example.com',
                  'imported email is trimmed and lower-cased');
select test.check((select user_id from public.adults where first_name = 'Blair') = '00000000-0000-0000-0000-00000000000b',
                  'mixed-case login email still matches roster');
-- Sam signed up before being on the roster; adding Sam now links automatically
insert into public.adults (id, family_id, first_name, last_name, email, role)
values ('30000000-0000-0000-0000-00000000000f', '20000000-0000-0000-0000-000000000001', 'Sam', 'Smith', 'sam.smith@example.com', 'parent');
select test.check((select user_id from public.adults where first_name = 'Sam') = '00000000-0000-0000-0000-00000000000f',
                  'spouse added to roster later gets linked');
-- New sign-up after roster row exists
insert into public.adults (family_id, first_name, last_name, email) values (null, 'Casey', 'New', 'casey.new@example.com');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000010', 'casey.new@example.com');
select test.check((select user_id from public.adults where first_name = 'Casey') = '00000000-0000-0000-0000-000000000010',
                  'sign-up trigger links an existing roster row');

-- ---------------------------------------------------------------------------
\echo '== Anonymous visitor'
begin;
set local role anon;
select test.expect_error('select * from public.adults', '42501', 'anon cannot read adults');
select test.expect_error('select * from public.scouts', '42501', 'anon cannot read scouts');
select test.expect_error('select * from public.photos', '42501', 'anon cannot read photos');
select test.expect_error('select * from public.leader_directory()', '42501', 'anon cannot call leader directory');
rollback;

-- ---------------------------------------------------------------------------
\echo '== Signed in but NOT on the roster'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000e","aal":"aal2"}', true);
select test.check(test.count('select * from public.adults') = 0, 'stranger sees no adults');
select test.check(test.count('select * from public.scouts') = 0, 'stranger sees no scouts');
select test.check(test.count('select * from public.events') = 0, 'stranger sees no events');
select test.check(test.count('select * from public.leader_directory()') = 0, 'stranger gets empty leader directory');
select test.expect_error($$insert into public.photos (uploader_id, storage_path) values ('30000000-0000-0000-0000-00000000000a', 'x/y.jpg')$$,
                         '42501', 'stranger cannot upload a photo as someone else');
rollback;

-- ---------------------------------------------------------------------------
\echo '== Parent (Alex Smith)'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal2"}', true);
select test.check(test.count('select * from public.adults') = 2, 'parent reads adults without recursion error; sees self + spouse only');
select test.check(test.count('select * from public.scouts') = 2, 'parent sees only their own two scouts');
select test.check(test.count('select * from public.events') = 1, 'parent sees events');
select test.check(test.count('select * from public.leader_directory()') = 2, 'leader directory lists den leader + admin');
select test.check(not exists (select 1 from public.leader_directory() where name like 'Blair%'),
                  'leader directory does not expose other parents');
select test.expect_rows($$update public.adults set phone = '410-555-9999' where first_name = 'Alex'$$, 1, 'parent can update own phone');
select test.expect_error($$update public.adults set role = 'admin' where first_name = 'Alex'$$, '42501', 'parent cannot promote self to admin');
select test.expect_error($$update public.adults set is_active = true, email = 'hijack@example.com' where first_name = 'Alex'$$, '42501', 'parent cannot change own email/status');
select test.expect_rows($$update public.adults set phone = '000' where first_name = 'Blair'$$, 0, 'parent cannot edit another family');
select test.expect_error($$insert into public.announcements (author_id, title, body) values ('30000000-0000-0000-0000-00000000000a', 'hi', 'x')$$,
                         '42501', 'parent cannot post announcements');
select test.expect_error($$insert into public.scouts (family_id, first_name, last_name) values ('20000000-0000-0000-0000-000000000001', 'Fake', 'Kid')$$,
                         '42501', 'parent cannot add scouts');

-- volunteering
select test.expect_error($$insert into public.volunteer_signups (slot_id, adult_id) values ('60000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000b')$$,
                         '42501', 'parent cannot sign up someone else');
select test.expect_rows($$insert into public.volunteer_signups (slot_id, adult_id) values ('60000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a')$$,
                        1, 'parent signs up for a slot');

-- photos
select test.expect_error($$insert into public.photos (uploader_id, storage_path, status) values ('30000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a/p1.jpg', 'approved')$$,
                         '42501', 'parent cannot self-approve an upload');
select test.expect_rows($$insert into public.photos (id, uploader_id, storage_path) values ('70000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a/p1.jpg')$$,
                        1, 'parent uploads a photo (pending review)');
select test.expect_error($$insert into public.photos (uploader_id, storage_path) values ('30000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000b/p2.jpg')$$,
                         '42501', 'parent cannot write into another adult''s folder');
select test.expect_rows($$update public.photos set status = 'approved'$$, 0, 'parent cannot approve photos');

-- advancement
select test.expect_rows($$insert into public.advancement_submissions (id, scout_id, submitted_by, adventure, requirement, completed_on)
                          values ('80000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-00000000000a', 'Bear Strong', '2', '2026-09-20')$$,
                        1, 'parent submits a home requirement for own scout');
select test.expect_error($$insert into public.advancement_submissions (scout_id, submitted_by, adventure, requirement, completed_on)
                          values ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-00000000000a', 'Bear Strong', '2', '2026-09-20')$$,
                         '42501', 'parent cannot submit for another family''s scout');
select test.expect_error($$update public.advancement_submissions set status = 'approved' where id = '80000000-0000-0000-0000-000000000001'$$,
                         '42501', 'parent cannot approve their own submission');
commit;

\echo '== Parent (Blair Jones) looks at Smith data'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","aal":"aal2"}', true);
select test.check(test.count('select * from public.photos') = 0, 'other parents cannot see a pending photo');
select test.check(test.count('select * from public.advancement_submissions') = 0, 'other parents cannot see Smith advancement');
select test.expect_error($$insert into public.volunteer_signups (slot_id, adult_id) values ('60000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000b')$$,
                         'P0001', 'full volunteer slot rejects a second person');
select test.expect_rows($$delete from public.volunteer_signups where adult_id = '30000000-0000-0000-0000-00000000000a'$$, 0,
                        'parent cannot remove someone else''s signup');
select test.check(test.count('select * from public.volunteer_signups') = 1, 'members can see who signed up');
rollback;

-- ---------------------------------------------------------------------------
\echo '== Bear den leader (Lee)'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);
select test.check(test.count('select * from public.scouts') = 3, 'leader sees all scouts');
select test.check(test.count('select * from public.advancement_submissions') = 1, 'den leader sees submission for a scout in their den');
select test.expect_rows($$update public.advancement_submissions set status = 'approved', review_note = 'Great job' where id = '80000000-0000-0000-0000-000000000001'$$,
                        1, 'den leader approves submission');
select test.check((select reviewed_by from public.advancement_submissions where id = '80000000-0000-0000-0000-000000000001') = '30000000-0000-0000-0000-00000000000c',
                  'reviewer is stamped server-side');
select test.expect_rows($$update public.photos set status = 'approved' where id = '70000000-0000-0000-0000-000000000001'$$, 1, 'leader approves photo');
select test.expect_rows($$insert into public.announcements (author_id, title, body) values ('30000000-0000-0000-0000-00000000000c', 'Den meeting moved', 'See you Thursday')$$,
                        1, 'leader posts announcement');
select test.expect_error($$update public.adults set role = 'admin' where first_name = 'Lee'$$, '42501', 'den leader cannot promote self');
commit;

\echo '== Parent sees approved photo; Wolf-only leader case'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","aal":"aal2"}', true);
select test.check(test.count('select * from public.photos') = 1, 'approved photo is visible to other members');
select test.check(test.count('select * from public.announcements') = 1, 'members read announcements');
rollback;

-- Den leader of a different den can't review: submit for Wolf scout, Lee (Bear) tries
insert into public.advancement_submissions (id, scout_id, submitted_by, adventure, requirement, completed_on)
values ('80000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a', 'Paws on the Path', '1', '2026-09-21');
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);
select test.expect_rows($$update public.advancement_submissions set status = 'approved' where id = '80000000-0000-0000-0000-000000000002'$$, 0,
                        'Bear den leader cannot approve a Wolf scout''s submission');
rollback;

-- ---------------------------------------------------------------------------
\echo '== Admin (Morgan)'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","aal":"aal2"}', true);
select test.expect_rows($$update public.advancement_submissions set status = 'recorded' where id = '80000000-0000-0000-0000-000000000001'$$,
                        1, 'admin marks submission recorded in Scoutbook');
select test.expect_rows($$insert into public.scouts (family_id, first_name, last_name) values ('20000000-0000-0000-0000-000000000002', 'New', 'Jones')$$,
                        1, 'admin can add a scout');
rollback;

-- ---------------------------------------------------------------------------
\echo '== Storage policies'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal2"}', true);
select test.expect_rows($$insert into storage.objects (bucket_id, name) values ('pack-photos', '30000000-0000-0000-0000-00000000000a/p1.jpg')$$,
                        1, 'parent uploads a file into own folder');
select test.expect_error($$insert into storage.objects (bucket_id, name) values ('pack-photos', '30000000-0000-0000-0000-00000000000b/evil.jpg')$$,
                         '42501', 'parent cannot upload into another folder');
commit;
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000e","aal":"aal2"}', true);
select test.check(test.count($$select * from storage.objects where bucket_id = 'pack-photos'$$) = 0, 'stranger cannot read photo files');
rollback;
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","aal":"aal2"}', true);
select test.check(test.count($$select * from storage.objects where bucket_id = 'pack-photos'$$) = 1, 'member can read an approved photo file');
rollback;

\echo '== ALL TESTS PASSED'
