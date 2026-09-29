-- Hardening after Supabase Security Advisor review (2026-09-29).
-- Postgres grants EXECUTE on new functions to PUBLIC, so the SECURITY DEFINER helpers
-- were callable by anonymous visitors through the API. They only ever returned
-- "not a member" for anon, but there's no reason to expose them.

-- Access helpers: needed by signed-in users (RLS policies call them), never by anon.
revoke execute on function
    public.current_adult_id(), public.is_member(), public.is_leader(), public.is_admin(),
    public.my_family_id(), public.is_my_scout(uuid), public.can_review_scout(uuid),
    public.leader_directory()
from public, anon;

grant execute on function
    public.current_adult_id(), public.is_member(), public.is_leader(), public.is_admin(),
    public.my_family_id(), public.is_my_scout(uuid), public.can_review_scout(uuid),
    public.leader_directory()
to authenticated;

-- Trigger functions: only ever run by triggers, which don't check EXECUTE at run time.
revoke execute on function
    public.link_auth_user_to_roster(), public.link_roster_to_auth_user(),
    public.enforce_slot_capacity(), public.stamp_review()
from public, anon, authenticated;
