-- A parent who is the pack quartermaster runs the gear closet; items say where they're kept.
-- G = Gil Gearkeep (parent, Quartermaster, family QM1), F = Fay Family (parent, family QM2).
\set QUIET on
set client_min_messages = notice;

insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-000000004901', 'gil.qm@example.com'),
 ('00000000-0000-0000-0000-000000004902', 'fay.qm@example.com');
insert into public.families (id, family_name) values
 ('20000000-0000-0000-0000-000000004901', 'QM1'),
 ('20000000-0000-0000-0000-000000004902', 'QM2');
insert into public.adults (id, family_id, first_name, last_name, email, role, position_title) values
 ('30000000-0000-0000-0000-000000004901', '20000000-0000-0000-0000-000000004901', 'Gil', 'Gearkeep', 'gil.qm@example.com', 'parent', 'Quartermaster'),
 ('30000000-0000-0000-0000-000000004902', '20000000-0000-0000-0000-000000004902', 'Fay', 'Family', 'fay.qm@example.com', 'parent', null);

create function test.as49(who text) returns void language sql as $$
    select set_config('request.jwt.claims', json_build_object('sub', case who
        when 'G' then '00000000-0000-0000-0000-000000004901'
        when 'F' then '00000000-0000-0000-0000-000000004902' end, 'aal', 'aal1')::text, true)
$$;
grant execute on function test.as49(text) to authenticated;

\echo '== Quartermaster: the gear closet'
begin; set local role authenticated; select test.as49('F');
select test.expect_error($$insert into public.gear_items (name, category) values ('Lantern', 'Other')$$, '42501',
                         'a parent who is not the quartermaster cannot add gear');
rollback;

begin; set local role authenticated; select test.as49('G');
select test.expect_rows($$insert into public.gear_items (id, name, category, quantity, location)
                          values ('49000000-0000-0000-0000-000000000001', 'Dining fly', 'Cooking', 2, 'Pack shed')$$, 1,
                        'the quartermaster adds gear, with where it is kept');
select test.expect_error($$update public.gear_items set location = repeat('x', 121) where id = '49000000-0000-0000-0000-000000000001'$$, '23514',
                         'a location is at most 120 characters');
select test.expect_rows($$update public.gear_items set location = 'At the Gearkeep house' where id = '49000000-0000-0000-0000-000000000001'$$, 1,
                        'and moves it');
commit;

begin; set local role authenticated; select test.as49('F');
insert into public.gear_loans (id, item_id, family_id, adult_id, quantity, due_on)
values ('49000000-0000-0000-0000-0000000000a1', '49000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000004902',
        '30000000-0000-0000-0000-000000004902', 1, current_date + 7);
select test.check((select location from public.gear_items where id = '49000000-0000-0000-0000-000000000001') = 'At the Gearkeep house',
                  'families see where an item is kept');
select test.check(test.count($$select * from public.gear_borrowers(array['49000000-0000-0000-0000-0000000000a1']::uuid[])$$) = 0,
                  'a family cannot look up who borrowed what');
commit;

begin; set local role authenticated; select test.as49('G');
select test.check(test.count($$select * from public.gear_loans where id = '49000000-0000-0000-0000-0000000000a1'$$) = 1,
                  'the quartermaster sees another family''s request');
select test.check((select family_name = 'QM2' and first_name = 'Fay' from public.gear_borrowers(array['49000000-0000-0000-0000-0000000000a1']::uuid[])),
                  'with the family''s name and who asked');
select test.expect_rows($$update public.gear_loans set status = 'approved' where id = '49000000-0000-0000-0000-0000000000a1'$$, 1,
                        'and approves it');
select test.expect_rows($$update public.gear_loans set status = 'out' where id = '49000000-0000-0000-0000-0000000000a1'$$, 1,
                        'and hands it out');
commit;

begin; set local role authenticated; select test.as49('F');
select test.expect_rows($$update public.gear_loans set status = 'returned' where id = '49000000-0000-0000-0000-0000000000a1'$$, 0,
                        'a family cannot check its own gear back in');
rollback;
