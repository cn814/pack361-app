-- Camp kitchen: the pack's recipes, each campout's menu, and a shopping list sized to who's coming.
--
-- The cooks (Cathy and Cindy for now) keep the pack's camp recipes in the app, plan a menu for a
-- campout from them, and get a shopping list worked out from the RSVPs. Kids eat less than adults
-- and more as they get older, so each den (and each sibling age group) counts as a share of an
-- adult portion: the "appetite" weights below, which the cooks can change.
--
--   1. private.is_camp_cook(): leaders, and anyone on the roster whose pack position mentions
--      cook, chef, grub or kitchen (Pack admin → Roster → Position; only admins can set it). Same
--      idea as the quartermaster (20261024000000_quartermaster.sql).
--   2. recipes and recipe_ingredients: every signed-in member can read them; cooks add and change
--      them. Amounts are for the recipe's servings (one adult-size portion each). An ingredient can
--      say what share of people take it (0.75 = three in four) and how it's sold (a dozen, a 1-lb
--      box) so the list can round up to whole packages, and which store to buy it at.
--   3. event_menu_items: a campout's meals ("Saturday breakfast") and the recipes for each, with
--      how much of the group eats that meal (Friday-only families miss Sunday breakfast).
--      Members can read an event's menu; cooks change it.
--   4. food_appetites: one weight per group (adults 1; Lions eat about half). Cooks only.
--   5. event_food_counts: a cook's own count for a group at one campout replaces the RSVP count
--      (day visitors, a family that told you in person). Cooks only.
--   6. event_shopping_checks: what's been bought for a campout, ticked off the list. Cooks only.
--   7. event_rsvps.eaters: how many of each group a family is bringing ({"adult": 2, "bear": 1,
--      "sib_4_6": 1}), written by the Givebutter sync from the roster (a scout's den) and the
--      sign-up's sibling-ages answer. Counts only: no names, same as the scouts/siblings/adults
--      numbers. Empty for answers given in the app; event_eater_counts() works those out from
--      the family's scouts on the roster.
--   8. sync_givebutter_rsvps(): also writes eaters. Same as 20261023000000_den_leader_attendance.sql
--      otherwise.
--   9. event_eater_counts(event): the totals per group for an event's "yes" answers (not the
--      waitlist). Cooks only; it returns totals, never families.
--  10. The pack's recipes so far, from Cathy's menus and recipe notes (2025-2026).
--
-- Safe to run once on the live database. Run in the Supabase SQL editor.

begin;

-- -----------------------------------------------------------------------------
-- 1. Who cooks
-- -----------------------------------------------------------------------------
create or replace function private.is_camp_cook()
returns boolean language sql stable security definer set search_path = '' as $$
    select private.is_leader()
        or exists (select 1 from public.adults a
                    where a.user_id = auth.uid() and a.is_active
                      and a.position_title ~* '(cook|chef|grub|kitchen)')
$$;
revoke execute on function private.is_camp_cook() from public, anon;
grant execute on function private.is_camp_cook() to authenticated;

-- The groups people are counted in. Scouts by den (den unknown: "scout"); siblings by age
-- (age unknown: "sib").
create or replace function private.eater_groups()
returns text[] language sql immutable set search_path = '' as $$
    select array['adult', 'lion', 'tiger', 'wolf', 'bear', 'webelos', 'aol', 'scout',
                 'sib_0_3', 'sib_4_6', 'sib_7_9', 'sib_10_12', 'sib_13_up', 'sib']
$$;
revoke execute on function private.eater_groups() from public, anon;
grant execute on function private.eater_groups() to authenticated;

-- {"adult": 2, "bear": 1}: known groups, whole numbers 0-20, or nothing at all (null).
create or replace function private.valid_eaters(p jsonb)
returns boolean language sql immutable set search_path = '' as $$
    select p is null or (
        jsonb_typeof(p) = 'object'
        and not exists (
            select 1 from jsonb_each(p) e
             where not (e.key = any(private.eater_groups()))
                or jsonb_typeof(e.value) <> 'number'
                or (e.value)::text !~ '^[0-9]+$'
                or (e.value)::int > 20))
$$;
revoke execute on function private.valid_eaters(jsonb) from public, anon;
grant execute on function private.valid_eaters(jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Recipes
-- -----------------------------------------------------------------------------
create table if not exists public.recipes (
    id          uuid primary key default gen_random_uuid(),
    title       text not null,
    meal        text not null default 'Dinner',
    servings    numeric not null default 8,
    summary     text,
    equipment   text,
    steps       text,
    notes       text,
    active      boolean not null default true,
    created_by  uuid references public.adults(id) on delete set null,
    updated_by  uuid references public.adults(id) on delete set null,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    constraint recipes_title_check check (length(title) between 1 and 120),
    constraint recipes_meal_check check (meal in ('Breakfast', 'Lunch', 'Dinner', 'Dessert', 'Campfire', 'Snack', 'Drinks', 'Kitchen basics')),
    constraint recipes_servings_check check (servings > 0 and servings <= 1000),
    constraint recipes_lengths check (
        coalesce(length(summary), 0) <= 500 and coalesce(length(equipment), 0) <= 2000
        and coalesce(length(steps), 0) <= 10000 and coalesce(length(notes), 0) <= 4000)
);

create table if not exists public.recipe_ingredients (
    id          uuid primary key default gen_random_uuid(),
    recipe_id   uuid not null references public.recipes(id) on delete cascade,
    position    int not null default 0,
    name        text not null,
    amount      numeric,
    unit        text,
    share       numeric not null default 1,
    pack_size   numeric,
    pack_unit   text,
    store       text,
    note        text,
    constraint recipe_ingredients_name_check check (length(name) between 1 and 120),
    constraint recipe_ingredients_amount_check check (amount is null or (amount >= 0 and amount <= 100000)),
    constraint recipe_ingredients_share_check check (share > 0 and share <= 5),
    constraint recipe_ingredients_pack_check check (pack_size is null or (pack_size > 0 and pack_size <= 100000)),
    constraint recipe_ingredients_lengths check (
        coalesce(length(unit), 0) <= 40 and coalesce(length(pack_unit), 0) <= 60
        and coalesce(length(store), 0) <= 40 and coalesce(length(note), 0) <= 300)
);
create index if not exists recipe_ingredients_recipe_idx on public.recipe_ingredients (recipe_id, position);

alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;

drop policy if exists recipes_read on public.recipes;
create policy recipes_read on public.recipes for select to authenticated
    using ((select private.is_member()));
drop policy if exists recipes_insert on public.recipes;
create policy recipes_insert on public.recipes for insert to authenticated
    with check ((select private.is_camp_cook()));
drop policy if exists recipes_update on public.recipes;
create policy recipes_update on public.recipes for update to authenticated
    using ((select private.is_camp_cook())) with check ((select private.is_camp_cook()));
-- Recipes are put away (active = false), not deleted, so old menus keep their meals.

drop policy if exists recipe_ingredients_read on public.recipe_ingredients;
create policy recipe_ingredients_read on public.recipe_ingredients for select to authenticated
    using ((select private.is_member()));
drop policy if exists recipe_ingredients_insert on public.recipe_ingredients;
create policy recipe_ingredients_insert on public.recipe_ingredients for insert to authenticated
    with check ((select private.is_camp_cook()));
drop policy if exists recipe_ingredients_update on public.recipe_ingredients;
create policy recipe_ingredients_update on public.recipe_ingredients for update to authenticated
    using ((select private.is_camp_cook())) with check ((select private.is_camp_cook()));
drop policy if exists recipe_ingredients_delete on public.recipe_ingredients;
create policy recipe_ingredients_delete on public.recipe_ingredients for delete to authenticated
    using ((select private.is_camp_cook()));

-- Who changed a recipe last, and when (the app shows it).
create or replace function private.touch_recipe() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
    new.updated_at := now();
    new.updated_by := coalesce(private.current_adult_id(), new.updated_by);
    if tg_op = 'INSERT' then
        new.created_by := coalesce(private.current_adult_id(), new.created_by);
    end if;
    return new;
end $$;
revoke execute on function private.touch_recipe() from public, anon, authenticated;
drop trigger if exists recipes_touch on public.recipes;
create trigger recipes_touch before insert or update on public.recipes
    for each row execute function private.touch_recipe();

-- -----------------------------------------------------------------------------
-- 3. A campout's menu
-- -----------------------------------------------------------------------------
create table if not exists public.event_menu_items (
    id          uuid primary key default gen_random_uuid(),
    event_id    uuid not null references public.events(id) on delete cascade,
    meal_label  text not null,
    position    int not null default 0,
    recipe_id   uuid not null references public.recipes(id) on delete cascade,
    people_share numeric not null default 1,
    note        text,
    created_at  timestamptz not null default now(),
    constraint event_menu_items_label_check check (length(meal_label) between 1 and 80),
    constraint event_menu_items_share_check check (people_share > 0 and people_share <= 3),
    constraint event_menu_items_note_check check (coalesce(length(note), 0) <= 300)
);
create index if not exists event_menu_items_event_idx on public.event_menu_items (event_id, position);

alter table public.event_menu_items enable row level security;
drop policy if exists event_menu_items_read on public.event_menu_items;
create policy event_menu_items_read on public.event_menu_items for select to authenticated
    using ((select private.is_member()));
drop policy if exists event_menu_items_insert on public.event_menu_items;
create policy event_menu_items_insert on public.event_menu_items for insert to authenticated
    with check ((select private.is_camp_cook()));
drop policy if exists event_menu_items_update on public.event_menu_items;
create policy event_menu_items_update on public.event_menu_items for update to authenticated
    using ((select private.is_camp_cook())) with check ((select private.is_camp_cook()));
drop policy if exists event_menu_items_delete on public.event_menu_items;
create policy event_menu_items_delete on public.event_menu_items for delete to authenticated
    using ((select private.is_camp_cook()));

-- -----------------------------------------------------------------------------
-- 4. Appetite weights (share of an adult portion)
-- -----------------------------------------------------------------------------
create table if not exists public.food_appetites (
    grp         text primary key,
    weight      numeric not null,
    updated_at  timestamptz not null default now(),
    updated_by  uuid references public.adults(id) on delete set null,
    constraint food_appetites_grp_check check (grp = any(private.eater_groups())),
    constraint food_appetites_weight_check check (weight >= 0 and weight <= 3)
);
alter table public.food_appetites enable row level security;
drop policy if exists food_appetites_read on public.food_appetites;
create policy food_appetites_read on public.food_appetites for select to authenticated
    using ((select private.is_camp_cook()));
drop policy if exists food_appetites_update on public.food_appetites;
create policy food_appetites_update on public.food_appetites for update to authenticated
    using ((select private.is_camp_cook())) with check ((select private.is_camp_cook()));

-- Starting guesses; the cooks tune them after a campout or two.
insert into public.food_appetites (grp, weight) values
    ('adult', 1), ('lion', 0.5), ('tiger', 0.55), ('wolf', 0.6), ('bear', 0.7), ('webelos', 0.8), ('aol', 0.9),
    ('scout', 0.7), ('sib_0_3', 0.3), ('sib_4_6', 0.5), ('sib_7_9', 0.6), ('sib_10_12', 0.8), ('sib_13_up', 1),
    ('sib', 0.6)
on conflict (grp) do nothing;

-- -----------------------------------------------------------------------------
-- 5. A cook's own counts for one campout
-- -----------------------------------------------------------------------------
create table if not exists public.event_food_counts (
    event_id    uuid not null references public.events(id) on delete cascade,
    grp         text not null,
    count       int not null,
    updated_at  timestamptz not null default now(),
    primary key (event_id, grp),
    constraint event_food_counts_grp_check check (grp = any(private.eater_groups())),
    constraint event_food_counts_count_check check (count between 0 and 500)
);
alter table public.event_food_counts enable row level security;
drop policy if exists event_food_counts_all on public.event_food_counts;
create policy event_food_counts_all on public.event_food_counts for all to authenticated
    using ((select private.is_camp_cook())) with check ((select private.is_camp_cook()));

-- -----------------------------------------------------------------------------
-- 6. Ticked off the shopping list
-- -----------------------------------------------------------------------------
create table if not exists public.event_shopping_checks (
    event_id    uuid not null references public.events(id) on delete cascade,
    item_key    text not null,
    checked_by  uuid references public.adults(id) on delete set null,
    checked_at  timestamptz not null default now(),
    primary key (event_id, item_key),
    constraint event_shopping_checks_key_check check (length(item_key) between 1 and 300)
);
alter table public.event_shopping_checks enable row level security;
drop policy if exists event_shopping_checks_all on public.event_shopping_checks;
create policy event_shopping_checks_all on public.event_shopping_checks for all to authenticated
    using ((select private.is_camp_cook())) with check ((select private.is_camp_cook()));

-- -----------------------------------------------------------------------------
-- 7. Who a family is bringing, by group
-- -----------------------------------------------------------------------------
alter table public.event_rsvps add column if not exists eaters jsonb;
alter table public.event_rsvps drop constraint if exists event_rsvps_eaters_check;
alter table public.event_rsvps add constraint event_rsvps_eaters_check check (private.valid_eaters(eaters));

-- A family's own answer in the app changes the numbers, so the group breakdown the sync wrote no
-- longer fits: drop it (event_eater_counts then works it out from the roster).
create or replace function private.clear_stale_eaters() returns trigger
language plpgsql set search_path = '' as $$
begin
    -- The sync stamps givebutter_at on every write; anything else is a family's or leader's edit.
    if new.eaters is not null and new.eaters is not distinct from old.eaters
       and new.givebutter_at is not distinct from old.givebutter_at
       and (new.scouts, new.siblings, new.adults) is distinct from (old.scouts, old.siblings, old.adults) then
        new.eaters := null;
    end if;
    return new;
end $$;
revoke execute on function private.clear_stale_eaters() from public, anon, authenticated;
drop trigger if exists event_rsvps_clear_eaters on public.event_rsvps;
create trigger event_rsvps_clear_eaters before update on public.event_rsvps
    for each row execute function private.clear_stale_eaters();

-- -----------------------------------------------------------------------------
-- 8. The Givebutter sync writes eaters too
-- -----------------------------------------------------------------------------
create or replace function public.sync_givebutter_rsvps(p_event_ids uuid[], p_rows jsonb)
returns table (added int, updated int, removed int)
language plpgsql security definer set search_path = '' as $$
declare
    r jsonb;
    v_event uuid;
    v_family uuid;
    v_scouts int;
    v_siblings int;
    v_adults int;
    v_eaters jsonb;
    v_paid timestamptz;
    v_soft boolean;
    prev public.event_rsvps;
    n_add int := 0;
    n_up int := 0;
    n_del int := 0;
    keep uuid[] := '{}';
begin
    -- Only the sync (the secret key, no signed-in person) runs this; execute is granted to it alone.
    if auth.uid() is not null then
        raise exception 'Only the Givebutter sync can do this' using errcode = '42501';
    end if;
    if jsonb_typeof(p_rows) is distinct from 'array' then
        raise exception 'Expected a list' using errcode = '22023';
    end if;

    for r in select * from jsonb_array_elements(p_rows) loop
        v_event := (r ->> 'event_id')::uuid;
        v_family := (r ->> 'family_id')::uuid;
        if v_event is null or v_family is null or not (v_event = any(coalesce(p_event_ids, '{}'))) then continue; end if;
        if not exists (select 1 from public.families f where f.id = v_family)
           or not exists (select 1 from public.events e where e.id = v_event) then continue; end if;
        v_scouts := least(greatest(coalesce((r ->> 'scouts')::int, 0), 0), 20);
        v_siblings := least(greatest(coalesce((r ->> 'siblings')::int, 0), 0), 20);
        v_adults := least(greatest(coalesce((r ->> 'adults')::int, 0), 0), 20);
        -- A breakdown that doesn't fit the rules is left out rather than failing the sync.
        v_eaters := case when jsonb_typeof(r -> 'eaters') = 'object' and private.valid_eaters(r -> 'eaters')
                         then r -> 'eaters' end;
        v_paid := coalesce((r ->> 'paid_at')::timestamptz, now());
        v_soft := coalesce((r ->> 'only_if_missing')::boolean, false);

        perform private.lock_event_rsvps(v_event);
        select * into prev from public.event_rsvps where event_id = v_event and family_id = v_family;
        if prev.id is null then
            insert into public.event_rsvps (event_id, family_id, adult_id, status, scouts, siblings, adults, note,
                                            waitlisted, waitlisted_at, updated_at, givebutter_at, eaters)
            values (v_event, v_family, null, 'yes', v_scouts, v_siblings, v_adults, null, false, null, now(), now(),
                    case when v_soft then null else v_eaters end)
            returning id into prev.id;
            n_add := n_add + 1;
        elsif v_soft then
            -- Paid in the app (PayPal, or marked paid): the numbers are a guess, so a family's own
            -- "yes" stands; a "no", "maybe" or waitlist answer older than the payment becomes "yes".
            if (prev.status <> 'yes' or prev.waitlisted) and v_paid > prev.updated_at then
                update public.event_rsvps
                   set status = 'yes', waitlisted = false, waitlisted_at = null,
                       scouts = case when prev.scouts + prev.adults + prev.siblings = 0 then v_scouts else prev.scouts end,
                       siblings = case when prev.scouts + prev.adults + prev.siblings = 0 then v_siblings else prev.siblings end,
                       adults = case when prev.scouts + prev.adults + prev.siblings = 0 then v_adults else prev.adults end,
                       updated_at = now(), givebutter_at = now()
                 where id = prev.id;
                n_up := n_up + 1;
            end if;
        elsif (prev.givebutter_at is not null and prev.updated_at <= prev.givebutter_at) or v_paid > prev.updated_at then
            if prev.status <> 'yes' or prev.waitlisted or prev.scouts <> v_scouts or prev.siblings <> v_siblings
               or prev.adults <> v_adults or prev.givebutter_at is null or prev.updated_at > prev.givebutter_at
               or prev.eaters is distinct from v_eaters then
                update public.event_rsvps
                   set status = 'yes', scouts = v_scouts, siblings = v_siblings, adults = v_adults, eaters = v_eaters,
                       waitlisted = false, waitlisted_at = null, updated_at = now(), givebutter_at = now()
                 where id = prev.id;
                n_up := n_up + 1;
            end if;
        end if;
        keep := keep || prev.id;
    end loop;

    -- Answers the sync wrote whose family no longer has a paid order (refunded, canceled).
    with gone as (
        delete from public.event_rsvps x
         where x.event_id = any(coalesce(p_event_ids, '{}'))
           and x.givebutter_at is not null and x.updated_at <= x.givebutter_at
           and not (x.id = any(keep))
        returning 1)
    select count(*)::int into n_del from gone;

    return query select n_add, n_up, n_del;
end;
$$;
revoke execute on function public.sync_givebutter_rsvps(uuid[], jsonb) from public, anon, authenticated;
grant execute on function public.sync_givebutter_rsvps(uuid[], jsonb) to service_role;

-- -----------------------------------------------------------------------------
-- 9. The totals per group for an event (cooks only)
-- -----------------------------------------------------------------------------
-- Families going ("yes", not waitlisted). An answer with an eaters breakdown that adds up uses
-- it. Otherwise: adults are adults; the family's active scouts on the roster fill the scout count
-- (oldest den first; any left over count as "scout"); siblings are "sib" (age unknown).
create or replace function public.event_eater_counts(p_event_id uuid)
returns table (grp text, people int)
language plpgsql stable security definer set search_path = '' as $$
declare
    x record;
    tally jsonb := '{}'::jsonb;
    k text;
    v int;
    n int;
    ranks text[];
begin
    if not private.is_camp_cook() then
        raise exception 'Only the cooks and leaders can see this' using errcode = '42501';
    end if;
    for x in
        select r.family_id, r.scouts, r.siblings, r.adults, r.eaters
          from public.event_rsvps r
         where r.event_id = p_event_id and r.status = 'yes' and not r.waitlisted
    loop
        if x.eaters is not null
           and (select coalesce(sum(value::int), 0) from jsonb_each_text(x.eaters)) = x.scouts + x.siblings + x.adults then
            for k, v in select key, value::int from jsonb_each_text(x.eaters) loop
                tally := jsonb_set(tally, array[k], to_jsonb(coalesce((tally ->> k)::int, 0) + v));
            end loop;
        else
            tally := jsonb_set(tally, '{adult}', to_jsonb(coalesce((tally ->> 'adult')::int, 0) + x.adults));
            tally := jsonb_set(tally, '{sib}', to_jsonb(coalesce((tally ->> 'sib')::int, 0) + x.siblings));
            ranks := '{}';
            if x.family_id is not null then
                select coalesce(array_agg(d.rank::text order by array_position(
                           array['aol', 'webelos', 'bear', 'wolf', 'tiger', 'lion'], d.rank::text) nulls last, s.created_at), '{}')
                  into ranks
                  from public.scouts s
                  left join public.dens d on d.id = s.den_id
                 where s.family_id = x.family_id and s.is_active;
            end if;
            for n in 1 .. x.scouts loop
                k := coalesce(ranks[n], 'scout');
                tally := jsonb_set(tally, array[k], to_jsonb(coalesce((tally ->> k)::int, 0) + 1));
            end loop;
        end if;
    end loop;
    return query
        select g, coalesce((tally ->> g)::int, 0)
          from unnest(private.eater_groups()) g;
end;
$$;
revoke execute on function public.event_eater_counts(uuid) from public, anon;
grant execute on function public.event_eater_counts(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 10. The pack's recipes so far (Cathy's menus and notes, 2025-2026)
-- -----------------------------------------------------------------------------
-- Fixed ids so running this twice adds nothing. The recipes that "feed 50" are a whole campout's
-- shopping from the Late Spring 2026 menu: 60 people, kids and adults together. With the starting
-- appetites a crowd like that is about 50 adult-size portions, so the same crowd gets the same list
-- and the app scales it for bigger or smaller campouts.
insert into public.recipes (id, title, meal, servings, summary, equipment, steps, notes) values
('c0000000-0000-4000-8000-000000000001', 'Cracker barrel: hot dogs and s''mores', 'Campfire', 50,
 'Friday night around the fire: hot dogs (beef and veggie) and s''mores.',
 'Fire ring with a fire master, water bucket and shovel. Roasting sticks. A light to work by. Camp stove, large pot and ladle if you make a warm drink.',
 'Fire master: tends the fire. Someone must be at the fire at all times until it is completely out.
Stick master: let sticks cool before the next marshmallow, and heat them again to "clean" them between users.
Hot dog masters (2): help scouts put hot dogs on sticks.
Parents supervise kids with flaming marshmallows.',
 'From the Late Spring 2026 menu: 1 beef hot dog for about 3 in 4 people, a veggie hot dog for about 1 in 5. A warm drink (hot chocolate) is optional.'),
('c0000000-0000-4000-8000-000000000002', 'Pancakes, eggs and bacon', 'Breakfast', 50,
 'Saturday breakfast: pancakes, scrambled eggs, bacon (by Cubmaster request) and fruit.',
 'Griddle (the lid of the large Dutch oven works), pots, 2 large camp stoves, tongs, metal and silicone spatulas, heat-proof grilling gloves, coffee pot, water pot, 2 carafes (water and coffee), large bowls, whisk or fork, pitcher or bowl and ladle for pancake batter.',
 'Bacon and pancakes take longer. Start those first.
Pancakes: light the stove before putting the griddle on. Turn it to low, add the griddle and let it heat up; a hot pan doesn''t stick (use the water test). Use plenty of oil.
Bacon: the "Snoop Dogg" method. Dump the bacon in a pot on medium-low heat and stir. A cast iron pot is perfect; a large soup pot works too.
Eggs: a well-seasoned cast iron pot is perfect. Heat some oil in the pot completely. Scramble the eggs in a large bowl with salt and pepper, then cook them with a metal spatula. Don''t be afraid to scrape the bottom.
Serving: someone helps serve the eggs, pancakes and especially the bacon.
Set out pancake syrup and oatmeal packets, and milk, half and half, non-dairy creamer, sugar, sugar substitute and hot chocolate.',
 'Oatmeal packets are the dairy-free option. Krusteaz family-size pancake mix; the pack may already have syrup and mix.'),
('c0000000-0000-4000-8000-000000000003', 'Sandwich lunch', 'Lunch', 50,
 'Saturday lunch: turkey and cheese, PB&J and cheese sandwiches, with chips and apples.',
 'Cutting boards or a clean space to work, food-safe gloves, zip-top bags.',
 'Portion the lunch meat at 2 oz: for a 1-lb pack, put out 8 slices of bread and deal the meat out evenly. One slice of cheese per sandwich.
Be VERY careful with peanut allergies: make the peanut butter sandwiches last. A rubber spatula spreads peanut butter faster than a plastic knife.
Put the sandwiches out in a pile so people can take one. If they''ll sit for a while, bag them (the bread bags work).
Set out mustard, mayonnaise, ketchup and napkins.',
 'Fall 2025 count for about 60: 38 turkey and cheese, 20 PB&J, 5 cheese.'),
('c0000000-0000-4000-8000-000000000004', 'Turkey meat sauce with penne', 'Dinner', 50,
 'Saturday dinner from Late Spring 2026: ground turkey sauce over penne, garlic bread and roasted vegetables.',
 'Pots, 2 camp stoves, silicone and metal spatulas, tongs, knives, cutting boards, large bowls, can opener.',
 'Bring a large pot of water to a boil. Don''t cook too many boxes of pasta at once: if it sticks to the bottom it burns. Toss the cooked pasta with a little oil so it doesn''t stick.
Brown the turkey with the onion, carrot and garlic, add the crushed tomatoes and herbs, and simmer.
Roast or steam the vegetables. Cook or warm the garlic bread.
Set out cheese, salad or vegetables, garlic bread, pasta and sauce. People help serve the hot food.
Clean before you clean: red sauce turns the dishwater red, so have an adult help everyone wipe out their plate first. Garlic bread (or a leftover hot dog bun) is great for wiping up sauce.',
 'Penne, not spaghetti. About 2 oz of meat per person; kids don''t eat that much and many people eat little meat.'),
('c0000000-0000-4000-8000-000000000005', 'Vegetable and turkey chili', 'Dinner', 8,
 'Fall 2025 at Patapsco (chili mac): a bean and vegetable chili, with ground turkey cooked separately.',
 '2 pots, ladle, utensils.',
 'Chop the onions, bell peppers, carrots and celery. Mince the garlic.
Put the pot on the stove and add the oil. Sauté the vegetables (not the garlic) until soft.
Add the garlic and cook 1 minute. Add the tomato paste and cook 1 minute.
Add the tomatoes, broth or water and spices. Bring to a boil, then simmer at least 20 minutes, stirring often. Salt and pepper to taste.
Drain and rinse the beans and add them. Simmer 5 more minutes.
Ground turkey: cook it in the remaining oil, breaking it up, in batches to make it easier.',
 'Volunteers: at least 3 adults (one on chili, one fire tender, one on mac and cheese). Never leave the kitchen empty or the fire unattended.'),
('c0000000-0000-4000-8000-000000000006', 'Dutch oven mac and cheese', 'Dinner', 12,
 'Baked mac and cheese with a crushed potato chip top, for chili mac night.',
 'Dutch ovens (one handles 2 batches), whisk, chimney starters (one per Dutch oven), charcoal, grilling mitts, lid lifter.',
 'Shred the cheese. Start the charcoal in the chimney starters.
In each Dutch oven: melt 2 sticks of butter. Whisk in ½ cup of flour and cook until it starts to brown, whisking constantly.
Add ½ gallon of milk slowly, whisking so the roux mixes in. Cook, stirring now and then, until it thickens a little.
Stir in 2½ to 3 lb of shredded cheese, then ¼ tsp nutmeg, 4 tsp salt and ½ tsp black pepper. Add 2 lb of pasta and stir.
Bake with 6-8 briquettes under and 12-16 on top for 20-25 minutes.
Smash a bag of potato chips, sprinkle on top and bake 10 more minutes.',
 'Don''t plan a full serving per person: it''s rich, and it''s a side with the chili.'),
('c0000000-0000-4000-8000-000000000007', 'Dutch oven dump cake', 'Dessert', 12,
 'Pie filling and cake mix baked over coals. Kids can help with the dumping.',
 'Cast iron Dutch ovens, lid lifter, parchment paper, large grilling tongs, grilling mitts, chimney starter, lighter or matches, newspaper, charcoal briquettes, can opener, spoon, water bucket, shovel.',
 'Only adults light or tend fires at a Cub Scout event. (Older scouts who have made dump cake can share their know-how.)
Line the Dutch oven with parchment paper (it won''t fit perfectly; it makes cleanup easier).
Dump in 2 cans of pie filling. Shake 1 to 1½ boxes of cake mix over it. Dot with 1 stick of butter and sprinkle with cinnamon.
Variation: skip the butter and pour 1 cup of Sprite over the cake mix. Very sweet, and the kids love it.
Coals: fill the chimney with briquettes, crumple newspaper in the bottom and light it. Wait until it''s all red hot, then dump the coals into the fire pit with a mitt.
For about 350°F: scout-size pots 6-8 coals under and 16 on the lid; the large pot 12 under and 16 on top. Put more coals on top than underneath; dump cake has been burning on the bottom.
Bake until the cake part is cooked: 45 minutes to 1½ hours for big batches. Serve with whipped cream (or ice cream).',
 'The fire master can''t leave the fire pit once it''s lit. Kingsford (yellow bag) charcoal burns longer with less ash. If there''s a flag retirement, don''t cook in that fire.'),
('c0000000-0000-4000-8000-000000000008', 'Sunday continental breakfast', 'Breakfast', 50,
 'Quick, no-cook breakfast that uses up leftovers so we can pack up and leave on time.',
 'One stove for coffee and hot water. A table to work at.',
 'Keep one stove out for coffee and hot water.
Set out croissants (one each until everyone has had one), peanut butter, fruit and any leftovers: jelly, cheese, chips, bread, buns. Warming leftovers is fine, but every dish used has to be washed.',
 'Late Spring 2026 swapped croissants for mini muffins.'),
('c0000000-0000-4000-8000-000000000009', 'Drink station: water and lemonade', 'Drinks', 50,
 'Water and lemonade all weekend, and hot chocolate.',
 '2 blue water bins (in the kitchen), 2 orange water coolers (one labeled JUICE).',
 'Fill the 2 blue bins and the 2 orange coolers with water. In the cooler labeled JUICE, add lemonade powder until it tastes like lemonade.
Refill the water all weekend. Don''t worry about the lemonade getting watered down.
A hydrated scout is a happy scout: remind every scout and parent to drink more water.',
 null),
('c0000000-0000-4000-8000-000000000010', 'Dishwashing and kitchen cleanup', 'Kitchen basics', 50,
 'How the pack washes dishes, cares for cast iron and puts the kitchen away.',
 '3 dish pans and one scrap container, sponge, rubber spatula, bleach tablets, salt, canola oil, paper towels.',
 'Dishwashing line: scrap container first (scrape all food off; leftovers make the soapy water dirty), then hot soapy water, then hot rinse water, then cool water with dissolved bleach tablets.
Cast iron: scrape out all food. Put the pot on the stove on medium-low to burn off what''s left. While it''s hot, scour with 2 Tbsp salt. Wipe dry with a towel. With a paper towel, wipe a thin layer of canola oil inside the pot and lid. Let it cool completely.
Saturday night: pack up everything not needed Sunday. Keep a few pieces of cutlery, cups, the small coffee pot, coffee, tea, a hot water pitcher, napkins, 1 stove and propane, and a table.
After the trip: take kitchen pots, pans, utensils, knives and cutting boards home, wash and dry them COMPLETELY, and bring them back to the Sasses'' house for storage.
Water jugs: hose down the outside, rinse the inside, add about ¼ cup of bleach to about 5 gallons of water, shake, let it sit a couple of hours, then dump and rinse several times. Wash and dry the coolers completely.
Bring back right away anything the Webelos-o-ree needs.',
 null)
on conflict (id) do nothing;

-- Only for recipes that have no ingredients yet, so a second run adds nothing.
insert into public.recipe_ingredients (recipe_id, position, name, amount, unit, share, pack_size, pack_unit, store, note)
select v.recipe_id::uuid, v.position, v.name, v.amount, v.unit, v.share, v.pack_size, v.pack_unit, v.store, v.note from (values
-- Cracker barrel (60)
('c0000000-0000-4000-8000-000000000001', 1, 'Graham crackers', 60, 'large rectangles', 1, 27, 'box', null, '9 × 3 per box'),
('c0000000-0000-4000-8000-000000000001', 2, 'Large marshmallows', 60, 'marshmallows', 1, 40, 'bag', null, 'About 40 per bag'),
('c0000000-0000-4000-8000-000000000001', 3, 'Chocolate bars (1.5 oz)', 15, 'bars', 1, null, null, null, 'A quarter bar per s''more'),
('c0000000-0000-4000-8000-000000000001', 4, 'All-beef hot dogs', 45, 'hot dogs', 1, 44, '42-48 count pack', 'Costco', null),
('c0000000-0000-4000-8000-000000000001', 5, 'Veggie hot dogs', 12, 'hot dogs', 1, null, null, null, null),
('c0000000-0000-4000-8000-000000000001', 6, 'Hot dog buns', 60, 'buns', 1, null, null, null, null),
('c0000000-0000-4000-8000-000000000001', 7, 'Ketchup', 30, 'oz', 1, null, null, null, '1 oz for half the people'),
('c0000000-0000-4000-8000-000000000001', 8, 'Mustard', 15, 'oz', 1, 20, 'bottle', null, 'Smallest bottle'),
-- Pancakes, eggs and bacon (60)
('c0000000-0000-4000-8000-000000000002', 1, 'Bacon', 5.625, 'lb', 1, 1, '1-lb pack', null, '2 oz for 3 in 4 people'),
('c0000000-0000-4000-8000-000000000002', 2, 'Eggs', 60, 'eggs', 1, 12, 'dozen', null, 'Scrambled'),
('c0000000-0000-4000-8000-000000000002', 3, 'Pancake mix', 48, 'servings', 1, null, null, null, 'Krusteaz family-size bag; we may have this'),
('c0000000-0000-4000-8000-000000000002', 4, 'Pancake syrup', 1, 'large bottle', 1, null, null, null, 'We may have this'),
('c0000000-0000-4000-8000-000000000002', 5, 'Oatmeal packets', 12, 'packets', 1, null, null, null, 'Dairy-free option'),
('c0000000-0000-4000-8000-000000000002', 6, 'Bananas', 15, 'bananas', 1, null, null, null, null),
('c0000000-0000-4000-8000-000000000002', 7, 'Baby oranges', 3, '3-lb bags', 1, null, null, null, null),
-- Sandwich lunch (60)
('c0000000-0000-4000-8000-000000000003', 1, 'Sandwich bread', 120, 'slices', 1, 20, '20-slice loaf', null, 'Fewer slices per loaf? Buy more loaves'),
('c0000000-0000-4000-8000-000000000003', 2, 'Sliced turkey', 90, 'oz', 1, 16, '1-lb pack', null, '2 oz per sandwich'),
('c0000000-0000-4000-8000-000000000003', 3, 'Sliced provolone', 52, 'slices', 1, null, null, null, 'One 1-oz slice per sandwich'),
('c0000000-0000-4000-8000-000000000003', 4, 'Peanut butter', 48, 'oz', 1, 48, '48-oz jar', null, null),
('c0000000-0000-4000-8000-000000000003', 5, 'Jelly', 24, 'oz', 1, null, null, null, null),
('c0000000-0000-4000-8000-000000000003', 6, 'Potato chips', 30, '1-oz bags', 1, null, null, null, null),
('c0000000-0000-4000-8000-000000000003', 7, 'Assorted chips', 30, '1-oz bags', 1, null, null, null, null),
('c0000000-0000-4000-8000-000000000003', 8, 'Apples', 45, 'apples', 1, null, null, null, 'About 3 in 4 people take one'),
('c0000000-0000-4000-8000-000000000003', 9, 'Mayonnaise', 16, 'oz', 1, 16, 'squeeze bottle', null, null),
-- Turkey meat sauce with penne (60)
('c0000000-0000-4000-8000-000000000004', 1, 'Ground turkey', 6.5, 'lb', 1, null, null, null, 'About 2 oz per person'),
('c0000000-0000-4000-8000-000000000004', 2, 'Crushed tomatoes', 15, '28-oz cans', 1, null, null, null, null),
('c0000000-0000-4000-8000-000000000004', 3, 'Penne pasta', 7.5, '1-lb boxes', 1, 1, '1-lb box', null, 'Not spaghetti'),
('c0000000-0000-4000-8000-000000000004', 4, 'Garlic bread or Texas toast', 7.5, 'loaves', 1, 1, 'loaf', null, null),
('c0000000-0000-4000-8000-000000000004', 5, 'Onions', 3, 'onions', 1, null, null, null, null),
('c0000000-0000-4000-8000-000000000004', 6, 'Garlic', 3, 'heads', 1, null, null, null, null),
('c0000000-0000-4000-8000-000000000004', 7, 'Carrots (for the sauce)', 1, 'lb', 1, null, null, null, null),
('c0000000-0000-4000-8000-000000000004', 8, 'Grated Parmesan cheese', 1, 'container', 1, null, null, 'Costco', null),
('c0000000-0000-4000-8000-000000000004', 9, 'Carrots (to roast)', 3, 'lb', 1, null, null, null, null),
('c0000000-0000-4000-8000-000000000004', 10, 'Brussels sprouts', 2, 'lb', 1, null, null, null, null),
-- Chili (8)
('c0000000-0000-4000-8000-000000000005', 1, 'Oil', 2, 'Tbsp', 1, null, null, null, null),
('c0000000-0000-4000-8000-000000000005', 2, 'Onions', 1, 'onions', 1, null, null, null, null),
('c0000000-0000-4000-8000-000000000005', 3, 'Green bell peppers', 1, 'peppers', 1, null, null, null, null),
('c0000000-0000-4000-8000-000000000005', 4, 'Carrots', 2, 'carrots', 1, null, null, null, null),
('c0000000-0000-4000-8000-000000000005', 5, 'Celery', 2, 'stalks', 1, null, null, null, null),
('c0000000-0000-4000-8000-000000000005', 6, 'Garlic', 2, 'cloves', 1, null, null, null, null),
('c0000000-0000-4000-8000-000000000005', 7, 'Tomato paste', 1, 'Tbsp', 1, null, null, null, null),
('c0000000-0000-4000-8000-000000000005', 8, 'Black beans', 1, '15-oz cans', 1, null, null, null, null),
('c0000000-0000-4000-8000-000000000005', 9, 'Red beans', 1, '15-oz cans', 1, null, null, null, null),
('c0000000-0000-4000-8000-000000000005', 10, 'Kidney beans', 1, '15-oz cans', 1, null, null, null, null),
('c0000000-0000-4000-8000-000000000005', 11, 'Fire-roasted tomatoes', 1, '28-oz cans', 1, null, null, null, null),
('c0000000-0000-4000-8000-000000000005', 12, 'Vegetable broth', 3, 'cups', 1, 4, 'quart', null, null),
('c0000000-0000-4000-8000-000000000005', 13, 'Cumin', 1, 'Tbsp', 1, null, null, null, null),
('c0000000-0000-4000-8000-000000000005', 14, 'Chili powder', 2, 'Tbsp', 1, null, null, null, null),
('c0000000-0000-4000-8000-000000000005', 15, 'Oregano', 2, 'tsp', 1, null, null, null, null),
('c0000000-0000-4000-8000-000000000005', 16, 'Ground turkey', 2, 'lb', 1, null, null, null, 'Cooked separately'),
-- Mac and cheese (12)
('c0000000-0000-4000-8000-000000000006', 1, 'Elbow noodles', 1, 'lb', 1, 1, '1-lb box', null, null),
('c0000000-0000-4000-8000-000000000006', 2, 'Milk', 4, 'cups', 1, 16, 'gallon', null, null),
('c0000000-0000-4000-8000-000000000006', 3, 'Butter', 1, 'sticks', 1, 4, '1-lb box', null, null),
('c0000000-0000-4000-8000-000000000006', 4, 'Flour', 0.25, 'cups', 1, null, null, null, null),
('c0000000-0000-4000-8000-000000000006', 5, 'Cheddar cheese', 24, 'oz', 1, 16, '1-lb block', null, 'Shred it yourself'),
('c0000000-0000-4000-8000-000000000006', 6, 'Salt', 2, 'tsp', 1, null, null, null, null),
('c0000000-0000-4000-8000-000000000006', 7, 'Nutmeg', 0.125, 'tsp', 1, null, null, null, null),
('c0000000-0000-4000-8000-000000000006', 8, 'Black pepper', 0.25, 'tsp', 1, null, null, null, null),
('c0000000-0000-4000-8000-000000000006', 9, 'Potato chips (topping)', 0.5, 'bags', 1, null, null, null, null),
-- Dump cake (12 per Dutch oven)
('c0000000-0000-4000-8000-000000000007', 1, 'Pie filling', 2, '21-oz cans', 1, null, null, null, null),
('c0000000-0000-4000-8000-000000000007', 2, 'Cake mix', 1.5, 'boxes', 1, null, null, null, null),
('c0000000-0000-4000-8000-000000000007', 3, 'Butter', 1, 'sticks', 1, 4, '1-lb box', null, 'Or 1 cup Sprite'),
('c0000000-0000-4000-8000-000000000007', 4, 'Cinnamon', 1, 'tsp', 1, null, null, null, null),
('c0000000-0000-4000-8000-000000000007', 5, 'Whipped cream', 0.5, 'cans', 1, null, null, null, null),
-- Sunday continental (60)
('c0000000-0000-4000-8000-000000000008', 1, 'Croissants or mini muffins', 60, 'each', 1, null, null, 'Costco', null),
('c0000000-0000-4000-8000-000000000008', 2, 'Bananas', 15, 'bananas', 1, null, null, null, null),
('c0000000-0000-4000-8000-000000000008', 3, 'Apples', 15, 'apples', 1, null, null, null, null),
-- Drinks (60, the weekend)
('c0000000-0000-4000-8000-000000000009', 1, 'Lemonade powder', 1, '5-lb containers', 1, null, null, null, null),
('c0000000-0000-4000-8000-000000000009', 2, 'Hot chocolate mix', 1, 'containers', 1, null, null, null, 'We may have this')
) as v (recipe_id, position, name, amount, unit, share, pack_size, pack_unit, store, note)
where not exists (select 1 from public.recipe_ingredients i where i.recipe_id = v.recipe_id::uuid);

commit;
