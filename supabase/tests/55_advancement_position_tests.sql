-- A leader whose pack position says Advancement runs advancement for the whole pack.
-- Reuses 01/02 fixtures: Sky (Wolf), River (Bear), Jo (Bear); member IDs 222, 111, 333; test.rows.
-- A = Ada Advance (den leader role, Advancement Chair, leads no den)
-- P = Pia Parent (parent role, position says Advancement)
-- D = Dov Denleader (den leader role, no position, leads no den)
\set QUIET on
set client_min_messages = notice;

insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-000000005501', 'ada.adv@example.com'),
 ('00000000-0000-0000-0000-000000005502', 'pia.adv@example.com'),
 ('00000000-0000-0000-0000-000000005503', 'dov.adv@example.com');
insert into public.families (id, family_name) values
 ('20000000-0000-0000-0000-000000005501', 'ADV1'),
 ('20000000-0000-0000-0000-000000005502', 'ADV2'),
 ('20000000-0000-0000-0000-000000005503', 'ADV3');
insert into public.adults (id, family_id, first_name, last_name, email, role, position_title) values
 ('30000000-0000-0000-0000-000000005501', '20000000-0000-0000-0000-000000005501', 'Ada', 'Advance', 'ada.adv@example.com', 'den_leader', 'Advancement Chair'),
 ('30000000-0000-0000-0000-000000005502', '20000000-0000-0000-0000-000000005502', 'Pia', 'Parent', 'pia.adv@example.com', 'parent', 'Advancement'),
 ('30000000-0000-0000-0000-000000005503', '20000000-0000-0000-0000-000000005503', 'Dov', 'Denleader', 'dov.adv@example.com', 'den_leader', null);

insert into public.advancement_submissions (id, scout_id, submitted_by, adventure, requirement, completed_on, status)
values ('55000000-0000-0000-0000-000000000001',
        (select id from public.scouts where first_name = 'Jo'),
        '30000000-0000-0000-0000-000000005503', 'Fellowship', '1', '2026-09-21', 'approved');

create function test.as55(who text, aal text default 'aal2') returns void language sql as $$
    select set_config('request.jwt.claims', json_build_object('sub', case who
        when 'A' then '00000000-0000-0000-0000-000000005501'
        when 'P' then '00000000-0000-0000-0000-000000005502'
        when 'D' then '00000000-0000-0000-0000-000000005503' end, 'aal', aal)::text, true)
$$;
grant execute on function test.as55(text, text) to authenticated;

\echo '== Advancement by position: who can import'
begin; set local role authenticated; select test.as55('A');
select test.check((select row_count = 5 and scout_count = 3 from public.import_scout_advancement('ada.csv', (select j from test.rows))),
                  'a leader titled Advancement imports the Scoutbook export');
select test.check((select imported_by = '30000000-0000-0000-0000-000000005501' from public.advancement_imports where file_name = 'ada.csv'),
                  'and the import is logged as theirs');
rollback;

begin; set local role authenticated; select test.as55('A', 'aal1');
select test.expect_error($$select public.import_scout_advancement('x.csv', (select j from test.rows))$$, '42501',
                         'not without two-step sign-in');
rollback;

begin; set local role authenticated; select test.as55('P');
select test.expect_error($$select public.import_scout_advancement('x.csv', (select j from test.rows))$$, '42501',
                         'a parent whose position says Advancement cannot import (needs a leader role)');
select test.check(test.count($$select * from public.scout_advancement where scout_id = (select id from public.scouts where first_name = 'Jo')$$) = 0,
                  'nor read another family''s records');
rollback;

begin; set local role authenticated; select test.as55('D');
select test.expect_error($$select public.import_scout_advancement('x.csv', (select j from test.rows))$$, '42501',
                         'a den leader without the position cannot import');
select test.expect_rows($$delete from public.scout_advancement$$, 0, 'nor clear records');
rollback;

\echo '== Advancement by position: whole-pack records and reports'
begin; set local role authenticated; select test.as55('A');
select test.check(test.count($$select distinct scout_id from public.scout_advancement$$) >= 2,
                  'the advancement chair reads Scoutbook records for scouts in every den');
select test.check(test.count($$select * from public.advancement_submissions where id = '55000000-0000-0000-0000-000000000001'$$) = 1,
                  'and sees reports for dens they do not lead');
select test.expect_rows($$update public.advancement_submissions set status = 'recorded' where id = '55000000-0000-0000-0000-000000000001'$$, 1,
                        'and marks them entered in Scoutbook');
select test.expect_rows($$delete from public.advancement_submissions where id = '55000000-0000-0000-0000-000000000001'$$, 0,
                        'but cannot delete them');
select test.expect_error($$update public.adults set role = 'admin' where id = '30000000-0000-0000-0000-000000005501'$$, '42501',
                         'and gains no admin rights (cannot change roles)');
rollback;

begin; set local role authenticated; select test.as55('D');
select test.check(test.count($$select * from public.advancement_submissions where id = '55000000-0000-0000-0000-000000000001'$$) = 0,
                  'a den leader without the position does not see other dens'' reports');
select test.expect_rows($$update public.advancement_submissions set status = 'recorded' where id = '55000000-0000-0000-0000-000000000001'$$, 0,
                        'or mark them entered');
rollback;

delete from public.advancement_submissions where id = '55000000-0000-0000-0000-000000000001';
