-- Move the RLS helper functions out of the API-exposed "public" schema (Supabase Security
-- Advisor: "Signed-In Users Can Execute SECURITY DEFINER Function").
-- Supabase's Data API only exposes listed schemas (public by default), so functions in
-- "private" can't be called as /rest/v1/rpc/... endpoints. RLS policies keep working:
-- they reference functions by internal id, which doesn't change when a function moves.
-- Functions whose bodies call a helper by name are recreated with the new name.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

alter function public.current_adult_id()      set schema private;
alter function public.is_member()             set schema private;
alter function public.is_leader()             set schema private;
alter function public.is_admin()              set schema private;
alter function public.my_family_id()          set schema private;
alter function public.is_my_scout(uuid)       set schema private;
alter function public.can_review_scout(uuid)  set schema private;

-- Trigger functions don't need to be in the API schema either.
alter function public.link_auth_user_to_roster()  set schema private;
alter function public.link_roster_to_auth_user()  set schema private;
alter function public.enforce_slot_capacity()     set schema private;
alter function public.stamp_review()              set schema private;

-- Bodies that referenced helpers as public.<name>:
create or replace function private.stamp_review()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    if new.status is distinct from old.status then
        if new.status::text in ('submitted', 'pending_review') then
            new.reviewed_by := null;
            new.reviewed_at := null;
        else
            new.reviewed_by := private.current_adult_id();
            new.reviewed_at := now();
        end if;
    end if;
    return new;
end;
$$;

-- leader_directory stays in public: it is the one function the app calls as an RPC.
create or replace function public.leader_directory()
returns table (adult_id uuid, name text, position_title text, role public.app_role,
               email text, phone text, dens text)
language sql stable security definer set search_path = '' as $$
    select a.id,
           coalesce(a.preferred_name, a.first_name) || ' ' || a.last_name,
           a.position_title,
           a.role,
           a.email,
           a.phone,
           (select string_agg(d.name || ' ' || dl.title, ', ' order by d.rank, d.number)
              from public.den_leaders dl join public.dens d on d.id = dl.den_id
             where dl.adult_id = a.id)
      from public.adults a
     where private.is_member()
       and a.is_active
       and (a.role <> 'parent' or a.position_title is not null
            or exists (select 1 from public.den_leaders dl where dl.adult_id = a.id))
     order by a.role desc, a.last_name
$$;
revoke execute on function public.leader_directory() from public, anon;
grant execute on function public.leader_directory() to authenticated;

-- Storage policies referenced helpers by id too; nothing to change there.

-- Supabase's own event-trigger helper (created with new projects). Event triggers fire
-- regardless of EXECUTE grants, so nobody needs to call it directly.
do $$ begin
    if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname = 'rls_auto_enable') then
        execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
    end if;
end $$;
