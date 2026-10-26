-- Camp kitchen: recipes, a campout menu, appetite weights and the headcount by group.
-- K = Kay Kitchen (parent, Grub Master, family CK1), P = Pat Parent (parent, family CK2, a Lion and a Bear).
-- Family CK3 has no scouts on the roster.
\set QUIET on
set client_min_messages = notice;

insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-000000005601', 'kay.ck@example.com'),
 ('00000000-0000-0000-0000-000000005602', 'pat.ck@example.com');
insert into public.families (id, family_name) values
 ('20000000-0000-0000-0000-000000005601', 'CK1'),
 ('20000000-0000-0000-0000-000000005602', 'CK2'),
 ('20000000-0000-0000-0000-000000005603', 'CK3');
insert into public.adults (id, family_id, first_name, last_name, email, role, position_title) values
 ('30000000-0000-0000-0000-000000005601', '20000000-0000-0000-0000-000000005601', 'Kay', 'Kitchen', 'kay.ck@example.com', 'parent', 'Grub Master'),
 ('30000000-0000-0000-0000-000000005602', '20000000-0000-0000-0000-000000005602', 'Pat', 'Parent', 'pat.ck@example.com', 'parent', null);
insert into public.dens (id, rank, number) values
 ('56000000-0000-0000-0000-0000000000d1', 'bear', 56),
 ('56000000-0000-0000-0000-0000000000d2', 'lion', 56);
-- The Lion was added first; the count still fills the oldest den first.
insert into public.scouts (id, family_id, den_id, first_name, last_name, created_at) values
 ('56000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000005602', '56000000-0000-0000-0000-0000000000d2', 'Lio', 'Parent', now() - interval '2 days'),
 ('56000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-000000005602', '56000000-0000-0000-0000-0000000000d1', 'Bea', 'Parent', now() - interval '1 day');
insert into public.events (id, title, category, starts_at, rsvp_enabled) values
 ('56000000-0000-0000-0000-0000000000e1', 'Kitchen Campout', 'Campout', now() + interval '20 days', true);

create function test.as56(who text) returns void language sql as $$
    select set_config('request.jwt.claims', json_build_object('sub', case who
        when 'K' then '00000000-0000-0000-0000-000000005601'
        when 'P' then '00000000-0000-0000-0000-000000005602' end, 'aal', 'aal1')::text, true)
$$;
grant execute on function test.as56(text) to authenticated;

-- How many of a group are coming, as Kay sees it.
create function test.n56(p_grp text) returns int language sql as $$
    select people from public.event_eater_counts('56000000-0000-0000-0000-0000000000e1') where grp = p_grp
$$;
grant execute on function test.n56(text) to authenticated;

\echo '== Camp kitchen: the pack''s recipes'
select test.check((select count(*) from public.recipes) >= 10, 'the pack''s recipes are loaded');
select test.check((select count(*) from public.recipe_ingredients where recipe_id = 'c0000000-0000-4000-8000-000000000006') = 9,
                  'with their ingredients (mac and cheese)');

begin; set local role authenticated; select test.as56('P');
select test.check(test.count($$select * from public.recipes$$) >= 10, 'any member can read the recipes');
select test.check(test.count($$select * from public.recipe_ingredients$$) > 50, 'and their ingredients');
select test.expect_error($$insert into public.recipes (title) values ('Walking tacos')$$, '42501',
                         'a parent who doesn''t cook cannot add a recipe');
select test.expect_rows($$update public.recipes set title = 'Mine' where id = 'c0000000-0000-4000-8000-000000000001'$$, 0,
                        'or change one');
select test.expect_rows($$delete from public.recipe_ingredients where recipe_id = 'c0000000-0000-4000-8000-000000000001'$$, 0,
                        'or remove its ingredients');
select test.check(test.count($$select * from public.food_appetites$$) = 0, 'appetite weights are for the cooks');
select test.expect_error($$select * from public.event_eater_counts('56000000-0000-0000-0000-0000000000e1')$$, '42501',
                         'and so is the headcount by group');
select test.expect_error($$insert into public.event_menu_items (event_id, meal_label, recipe_id)
                           values ('56000000-0000-0000-0000-0000000000e1', 'Saturday dinner', 'c0000000-0000-4000-8000-000000000004')$$, '42501',
                         'a parent cannot plan the menu');
select test.expect_error($$insert into public.event_shopping_checks (event_id, item_key) values ('56000000-0000-0000-0000-0000000000e1', 'eggs')$$, '42501',
                         'or tick off the shopping list');
rollback;

\echo '== Camp kitchen: a cook'
begin; set local role authenticated; select test.as56('K');
select test.expect_rows($$insert into public.recipes (id, title, meal, servings) values ('56000000-0000-0000-0000-0000000000b1', 'Walking tacos', 'Dinner', 10)$$, 1,
                        'the Grub Master adds a recipe');
select test.check((select created_by = '30000000-0000-0000-0000-000000005601' and updated_by = created_by
                     from public.recipes where id = '56000000-0000-0000-0000-0000000000b1'), 'and it says who added it');
select test.expect_rows($$insert into public.recipe_ingredients (recipe_id, position, name, amount, unit, pack_size, pack_unit)
                          values ('56000000-0000-0000-0000-0000000000b1', 1, 'Fritos', 10, '1-oz bags', 10, 'variety box')$$, 1,
                        'with ingredients');
select test.expect_error($$insert into public.recipes (title, meal) values ('Odd', 'Brunch')$$, '23514', 'meals are from the list');
select test.expect_error($$insert into public.recipes (title, servings) values ('Zero', 0)$$, '23514', 'a recipe serves someone');
select test.expect_error($$insert into public.recipe_ingredients (recipe_id, name, share) values ('56000000-0000-0000-0000-0000000000b1', 'X', 0)$$, '23514',
                         'an ingredient''s share is more than nothing');
select test.expect_rows($$update public.recipes set steps = 'Open the bag. Add chili.' where id = 'c0000000-0000-4000-8000-000000000005'$$, 1,
                        'she edits one of the pack''s recipes');
select test.check((select updated_by = '30000000-0000-0000-0000-000000005601' from public.recipes where id = 'c0000000-0000-4000-8000-000000000005'),
                  'and it says who changed it');
select test.expect_rows($$update public.recipes set active = false where id = '56000000-0000-0000-0000-0000000000b1'$$, 1,
                        'and puts a recipe away');
select test.expect_rows($$delete from public.recipes where id = '56000000-0000-0000-0000-0000000000b1'$$, 0,
                        'recipes are put away, not deleted');
select test.expect_rows($$insert into public.event_menu_items (event_id, meal_label, position, recipe_id, people_share)
                          values ('56000000-0000-0000-0000-0000000000e1', 'Saturday dinner', 1, 'c0000000-0000-4000-8000-000000000004', 1)$$, 1,
                        'plans the campout''s menu');
select test.expect_error($$insert into public.event_menu_items (event_id, meal_label, recipe_id, people_share)
                           values ('56000000-0000-0000-0000-0000000000e1', 'Sunday', 'c0000000-0000-4000-8000-000000000008', 0)$$, '23514',
                         'a meal is for some of the group');
select test.check(test.count($$select * from public.food_appetites$$) = 14, 'sees the appetite weights');
select test.expect_rows($$update public.food_appetites set weight = 0.75 where grp = 'bear'$$, 1, 'and tunes one');
select test.expect_error($$update public.food_appetites set weight = 4 where grp = 'bear'$$, '23514', 'within reason');
select test.expect_rows($$insert into public.event_food_counts (event_id, grp, count) values ('56000000-0000-0000-0000-0000000000e1', 'adult', 30)$$, 1,
                        'sets her own count for a group');
select test.expect_error($$insert into public.event_food_counts (event_id, grp, count) values ('56000000-0000-0000-0000-0000000000e1', 'giant', 1)$$, '23514',
                         'only for the known groups');
select test.expect_rows($$insert into public.event_shopping_checks (event_id, item_key) values ('56000000-0000-0000-0000-0000000000e1', 'eggs|eggs|dozen')$$, 1,
                        'and ticks off the shopping list');
rollback;

begin; set local role authenticated; select test.as56('P');
select test.check(test.count($$select * from public.event_menu_items$$) = 0, 'nothing a rolled-back cook wrote is left');
rollback;

\echo '== Camp kitchen: who is coming, by group'
set role service_role;
select test.check((select added = 1 from public.sync_givebutter_rsvps(array['56000000-0000-0000-0000-0000000000e1']::uuid[],
    '[{"event_id":"56000000-0000-0000-0000-0000000000e1","family_id":"20000000-0000-0000-0000-000000005602","scouts":2,"siblings":1,"adults":1,
       "eaters":{"adult":1,"bear":1,"lion":1,"sib_4_6":1},"paid_at":"2026-10-01T12:00:00Z"}]')),
    'the sync adds an RSVP with who is coming, by group');
reset role;
select test.check((select eaters = '{"adult":1,"bear":1,"lion":1,"sib_4_6":1}'::jsonb from public.event_rsvps
                    where event_id = '56000000-0000-0000-0000-0000000000e1' and family_id = '20000000-0000-0000-0000-000000005602'),
                  'counts only, no names');
insert into public.event_rsvps (event_id, family_id, status, scouts, siblings, adults)
values ('56000000-0000-0000-0000-0000000000e1', '20000000-0000-0000-0000-000000005603', 'yes', 1, 1, 2);
select test.expect_error($$update public.event_rsvps set eaters = '{"wizard":1}' where family_id = '20000000-0000-0000-0000-000000005603'$$, '23514',
                         'an RSVP''s groups are the known ones');
select test.expect_error($$update public.event_rsvps set eaters = '{"adult":1.5}' where family_id = '20000000-0000-0000-0000-000000005603'$$, '23514',
                         'in whole people');

begin; set local role authenticated; select test.as56('K');
select test.check(test.n56('adult') = 3, 'adults: 1 from Givebutter, 2 answered in the app');
select test.check(test.n56('bear') = 1 and test.n56('lion') = 1 and test.n56('sib_4_6') = 1, 'the Givebutter family by den and age');
select test.check(test.n56('scout') = 1 and test.n56('sib') = 1, 'a family with no scouts on the roster: scout and sibling, unknown');
select test.check(test.count($$select * from public.event_eater_counts('56000000-0000-0000-0000-0000000000e1')$$) = 14, 'every group, even empty ones');
rollback;

-- The family changes its numbers in the app: the sync's breakdown no longer fits, so the roster fills in.
update public.event_rsvps set scouts = 1, updated_at = now()
 where event_id = '56000000-0000-0000-0000-0000000000e1' and family_id = '20000000-0000-0000-0000-000000005602';
select test.check((select eaters is null from public.event_rsvps
                    where event_id = '56000000-0000-0000-0000-0000000000e1' and family_id = '20000000-0000-0000-0000-000000005602'),
                  'a family''s own change clears the Givebutter breakdown');
begin; set local role authenticated; select test.as56('K');
select test.check(test.n56('bear') = 1 and test.n56('lion') = 0, 'and its one scout counts in the oldest den on the roster');
select test.check(test.n56('sib') = 2 and test.n56('sib_4_6') = 0, 'siblings with no age are "sib"');
rollback;

set role service_role;
select test.check((select updated = 1 from public.sync_givebutter_rsvps(array['56000000-0000-0000-0000-0000000000e1']::uuid[],
    jsonb_build_array(jsonb_build_object('event_id','56000000-0000-0000-0000-0000000000e1','family_id','20000000-0000-0000-0000-000000005602',
        'scouts',2,'siblings',0,'adults',2,'eaters',jsonb_build_object('adult',2,'wizard',2),'paid_at', now() + interval '1 minute')))),
    'a newer order with a breakdown that doesn''t fit the rules');
reset role;
select test.check((select eaters is null and adults = 2 from public.event_rsvps
                    where event_id = '56000000-0000-0000-0000-0000000000e1' and family_id = '20000000-0000-0000-0000-000000005602'),
                  'still updates the numbers, without the breakdown');
set role service_role;
select test.check((select updated = 1 from public.sync_givebutter_rsvps(array['56000000-0000-0000-0000-0000000000e1']::uuid[],
    jsonb_build_array(jsonb_build_object('event_id','56000000-0000-0000-0000-0000000000e1','family_id','20000000-0000-0000-0000-000000005602',
        'scouts',2,'siblings',0,'adults',2,'eaters',jsonb_build_object('adult',2,'bear',1,'lion',1),'paid_at', now() + interval '2 minutes')))),
    'the next sync with a good breakdown');
reset role;
select test.check((select eaters = '{"adult":2,"bear":1,"lion":1}'::jsonb from public.event_rsvps
                    where event_id = '56000000-0000-0000-0000-0000000000e1' and family_id = '20000000-0000-0000-0000-000000005602'),
                  'writes it, even with the same numbers');

-- Leave the shared fixtures as they were for later files.
delete from public.event_rsvps where event_id = '56000000-0000-0000-0000-0000000000e1';
update public.food_appetites set weight = 0.7 where grp = 'bear';
