-- Arrow of Light Den 8 bridged to Scouts BSA troops (Sep 2026).
-- Deactivates (does not delete) the den, its scouts, and families with no other active scout.
-- Parents with a scout in another den stay active. Reversible by setting is_active back to true.
begin;
with den8 as (select id from public.dens where rank = 'aol' and number = 8),
s as (
  update public.scouts set is_active = false where den_id in (select id from den8) and is_active returning family_id
),
gone_fams as (
  select distinct s.family_id from s
  where not exists (select 1 from public.scouts x where x.family_id = s.family_id and x.is_active
                    and x.den_id not in (select id from den8))
),
f as (update public.families set is_active = false where id in (select family_id from gone_fams) returning id),
a as (
  update public.adults set is_active = false
   where family_id in (select family_id from gone_fams) and role = 'parent' and position_title is null
     and not exists (select 1 from public.den_leaders dl where dl.adult_id = adults.id and dl.den_id not in (select id from den8))
  returning first_name || ' ' || last_name as name
),
dl as (delete from public.den_leaders where den_id in (select id from den8) returning adult_id),
d as (update public.dens set is_active = false where id in (select id from den8) returning name)
select (select count(*) from s) as scouts_deactivated, (select count(*) from f) as families_deactivated,
       (select string_agg(name, ', ') from a) as adults_deactivated, (select count(*) from dl) as den_leader_links_removed,
       (select string_agg(name, ', ') from d) as den;
commit;
