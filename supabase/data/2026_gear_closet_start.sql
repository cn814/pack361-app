-- Starts the pack gear closet with the camp kitchen gear families are driving to the Fall Campout
-- (the "Transport ..." slots on the campout volunteer sign-up). All of it is kept at the Sass house.
-- Counts are placeholders (1 each): the quartermaster sets the real counts under Pack → Gear closet.
-- Run in the Supabase SQL Editor after migration 20261024000000. Safe to re-run: an item already
-- in the closet (same name) is left alone.
begin;

insert into public.gear_items (name, category, description, quantity, location)
select v.name, v.category, v.description, 1, 'Sass house'
  from (values
    ('Coolers',              'Cooking', 'Camp kitchen coolers. Driven to campouts and back by volunteers.'),
    ('Camp stove',           'Cooking', 'Camp kitchen stove.'),
    ('Propane tanks',        'Cooking', 'For the camp stove.'),
    ('Water and juice jugs', 'Cooking', 'Drink jugs for the camp kitchen.'),
    ('Camp kitchen bins',    'Cooking', 'Bins of camp kitchen equipment and supplies.')
  ) as v(name, category, description)
 where not exists (select 1 from public.gear_items g where lower(g.name) = lower(v.name));

select name, category, quantity, location from public.gear_items where location = 'Sass house' order by name;

commit;
