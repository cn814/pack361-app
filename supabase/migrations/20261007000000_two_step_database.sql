-- Two-step sign-in, database side. RUN ONLY AFTER release 1.5 is live (it needs the app's
-- two-step pages; the older app has no way to enter the code). See docs/RELEASES.md.
--
-- Pack leadership, the Cubmaster and admins only get their extra access once they've entered the
-- code from their authenticator app this session (Supabase marks the session "aal2"). Until then
-- the database treats them as a parent, the same as the app does, so a stolen email inbox alone
-- can't reach every family's details or the pack's money. Den leaders are unchanged.

create or replace function private.code_entered()
returns boolean language sql stable set search_path = '' as $$
    select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
$$;
revoke execute on function private.code_entered() from public, anon;
grant execute on function private.code_entered() to authenticated;

create or replace function private.is_leader()
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (
        select 1 from public.adults a
        where a.user_id = auth.uid() and a.is_active
          and (a.role = 'den_leader'
               or (a.role in ('committee', 'cubmaster', 'admin') and private.code_entered())))
$$;

create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (
        select 1 from public.adults a
        where a.user_id = auth.uid() and a.is_active
          and a.role in ('cubmaster', 'admin'))
       and private.code_entered()
$$;

create or replace function private.is_committee()
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (
        select 1 from public.adults a
         where a.user_id = auth.uid() and a.is_active
           and a.role in ('committee', 'cubmaster', 'admin'))
       and private.code_entered()
$$;

-- Den leaders of the scout's den, plus pack leadership (with their code).
create or replace function private.can_review_scout(p_scout_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
    select private.is_committee()
    or exists (
        select 1 from public.scouts s
        join public.den_leaders dl on dl.den_id = s.den_id
        join public.adults a on a.id = dl.adult_id
        where s.id = p_scout_id and a.user_id = auth.uid() and a.is_active)
$$;

create or replace function private.leads_den(p_den_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
    select private.is_committee()
    or exists (
        select 1 from public.den_leaders dl
          join public.adults a on a.id = dl.adult_id
         where dl.den_id = p_den_id and a.user_id = auth.uid() and a.is_active)
$$;
