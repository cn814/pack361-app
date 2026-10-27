-- Gear closet: two more kinds of gear, Activities and Recruitment (asked for by the quartermaster).
-- RUN THIS BEFORE the release that adds them to the app, or saving an item as one of them fails.

begin;

alter table public.gear_items drop constraint if exists gear_items_category_check;
alter table public.gear_items add constraint gear_items_category_check
    check (category in ('Tents', 'Sleeping', 'Cooking', 'Activities', 'Recruitment', 'Uniforms', 'Other'));

commit;
