-- Terms of use: every adult agrees to the pack's terms of use and data policy the first time they
-- sign in, and again when the version goes up (the text and version live in the app,
-- src/lib/policies.ts). Each adult's row records the version they agreed to and when.
--
-- Members can't set these columns directly (the adult row guard only lets them change their phone
-- and the name they go by); they record their own agreement through public.accept_terms().

begin;

alter table public.adults
    add column if not exists terms_version int,
    add column if not exists terms_accepted_at timestamptz;

create or replace function public.accept_terms(p_version int)
returns void language plpgsql security definer set search_path = '' as $$
begin
    if p_version is null or p_version < 1 or p_version > 1000 then
        raise exception 'Unknown terms version' using errcode = '22023';
    end if;
    update public.adults
       set terms_version = p_version, terms_accepted_at = now()
     where user_id = auth.uid() and is_active;
    if not found then
        raise exception 'Not on the pack roster' using errcode = '42501';
    end if;
end $$;
revoke execute on function public.accept_terms(int) from public, anon;
grant execute on function public.accept_terms(int) to authenticated;

commit;
