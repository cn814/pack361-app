-- Den leaders run the Pack guide, Help wanted and council events too (Chris, Oct 3 2026).
-- Before this, only key leaders (role committee), the Cubmaster and admins could. Money,
-- expenses, key-leaders-only documents and pack-wide advancement approval stay with key leaders.
-- Leaders still need their two-step code (private.is_leader() checks it).

begin;

-- Pack guide: leaders write pages (everyone reads published ones, as before).
alter policy guide_write on public.guide_pages
    using ((select private.is_leader())) with check ((select private.is_leader()));

-- Help wanted: leaders add, edit, close and delete jobs, and see who offered.
alter policy pack_roles_read on public.pack_roles
    using ((select private.is_member()) and (open or (select private.is_leader())));
alter policy pack_roles_insert on public.pack_roles
    with check ((select private.is_leader()));
alter policy pack_roles_update on public.pack_roles
    using ((select private.is_leader())) with check ((select private.is_leader()));
alter policy pack_roles_delete on public.pack_roles
    using ((select private.is_leader()));
alter policy role_interest_read on public.role_interest
    using ((adult_id = (select private.current_adult_id())) or (select private.is_leader()));
alter policy role_interest_delete on public.role_interest
    using ((adult_id = (select private.current_adult_id())) or (select private.is_leader()));

-- Council events: leaders pick, skip and undo, and set the council calendar link.
alter policy council_events_update on public.council_events
    using ((select private.is_leader())) with check ((select private.is_leader()));
alter policy settings_council_insert on public.pack_settings
    with check ((key = 'council_calendar_url') and (select private.is_leader()));
alter policy settings_council_update on public.pack_settings
    using ((key = 'council_calendar_url') and (select private.is_leader()))
    with check ((key = 'council_calendar_url') and (select private.is_leader()));

-- Help wanted: volunteer sign-ups per family, for leaders.
create or replace function public.volunteer_load(p_from date, p_to date)
returns table (family_id uuid, family_name text, signups integer, people text)
language sql stable security definer set search_path = '' as $$

    with s as (
        select a.family_id, a.id as adult_id,
               coalesce(a.preferred_name, a.first_name) as first_name,
               a.last_name
          from public.volunteer_signups vs
          join public.volunteer_slots sl on sl.id = vs.slot_id
          left join public.events e on e.id = sl.event_id
          join public.adults a on a.id = vs.adult_id
         where (e.id is null or e.archived_at is null)
           and (coalesce(e.starts_at, vs.created_at) at time zone 'America/New_York')::date
               between p_from and p_to
    ), rows as (
        select f.id as family_id, f.family_name,
               count(s.adult_id)::int as signups,
               string_agg(distinct s.first_name, ', ') as people
          from public.families f
          left join s on s.family_id = f.id
         where f.is_active
         group by f.id, f.family_name
        union all
        select null, min(s.first_name || ' ' || s.last_name), count(*)::int, min(s.first_name)
          from s
         where s.family_id is null
         group by s.adult_id
    )
    select r.family_id, r.family_name, r.signups, r.people
      from rows r
     where private.is_leader()
     order by r.signups desc, r.family_name
$$;

commit;
