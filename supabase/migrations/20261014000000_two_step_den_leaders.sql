-- Two-step sign-in for den leaders too. RUN ONLY AFTER the app release that asks den leaders for
-- their authenticator code is live (version 3.0.2); see docs/RELEASES.md.
--
-- Den leaders can see every family's contact details and every scout, so an email inbox alone
-- shouldn't be enough to reach that. Until a den leader enters the code from their authenticator
-- app this session (Supabase marks the session "aal2"), the database treats them as a parent,
-- the same as pack leadership, the Cubmaster and admins.

begin;

-- Anyone listed as leading a den gets at least the den-leader role (as Pack admin does when a
-- den leader is added), so the app asks them for the code instead of quietly hiding their den.
update public.adults a
   set role = 'den_leader'
 where a.role = 'parent'
   and exists (select 1 from public.den_leaders dl where dl.adult_id = a.id);

create or replace function private.is_leader()
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (
        select 1 from public.adults a
        where a.user_id = auth.uid() and a.is_active
          and a.role in ('den_leader', 'committee', 'cubmaster', 'admin'))
       and private.code_entered()
$$;

-- Den leaders of the scout's den, plus pack leadership (with their code).
create or replace function private.can_review_scout(p_scout_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
    select private.is_committee()
    or (private.code_entered() and exists (
        select 1 from public.scouts s
        join public.den_leaders dl on dl.den_id = s.den_id
        join public.adults a on a.id = dl.adult_id
        where s.id = p_scout_id and a.user_id = auth.uid() and a.is_active))
$$;

create or replace function private.leads_den(p_den_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
    select private.is_committee()
    or (private.code_entered() and exists (
        select 1 from public.den_leaders dl
          join public.adults a on a.id = dl.adult_id
         where dl.den_id = p_den_id and a.user_id = auth.uid() and a.is_active))
$$;

-- Dens I am a den leader of (with my code). Not the committee branch of private.leads_den():
-- policies check (select private.is_committee()) alongside it.
create or replace function private.my_led_den_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
    select dl.den_id from public.den_leaders dl
      join public.adults a on a.id = dl.adult_id
     where a.user_id = auth.uid() and a.is_active and private.code_entered()
$$;

-- Den meetings of dens I am a den leader of (with my code).
create or replace function private.led_meeting_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
    select m.id from public.den_meetings m
      join public.den_leaders dl on dl.den_id = m.den_id
      join public.adults a on a.id = dl.adult_id
     where a.user_id = auth.uid() and a.is_active and private.code_entered()
$$;

-- Scouts in dens I am a den leader of (with my code).
create or replace function private.reviewable_scout_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
    select s.id from public.scouts s
      join public.den_leaders dl on dl.den_id = s.den_id
      join public.adults a on a.id = dl.adult_id
     where a.user_id = auth.uid() and a.is_active and private.code_entered()
$$;

commit;
