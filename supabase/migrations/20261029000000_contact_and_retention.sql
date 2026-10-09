-- 1. The app's contact address is now app@pack361.org (it reaches the app maintainer), in the
--    database's own messages and the pack guide pages.
-- 2. Records of families who left: two years (Pack admin → Pack settings, "left_family_months")
--    after a family leaves, the nightly job clears its adults' contact details and sign-in. Names,
--    scouts and advancement stay for the pack's records. The security log notes that it happened
--    without copying the old email.

begin;

-- 1. Contact address -------------------------------------------------------------------------

create or replace function private.feedback_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    if (select count(*) from public.feedback f
         where f.adult_id = new.adult_id and f.created_at > now() - interval '1 day') >= 10 then
        raise exception 'That''s a lot of messages today. Email app@pack361.org instead.' using errcode = '54000';
    end if;
    return new;
end;
$$;
revoke execute on function private.feedback_limit() from public, anon, authenticated;

create or replace function private.join_request_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    new.user_id := auth.uid();
    if new.user_id is null then
        raise exception 'Sign in first' using errcode = '42501';
    end if;
    select lower(u.email) into new.email from auth.users u where u.id = new.user_id;
    if new.email is null then
        raise exception 'Sign in first' using errcode = '42501';
    end if;
    if exists (select 1 from public.adults a where (a.user_id = new.user_id or a.email = new.email) and a.is_active) then
        raise exception 'You are already on the roster' using errcode = '23505';
    end if;
    if (select count(*) from public.join_requests r
         where r.user_id = new.user_id and r.created_at > now() - interval '30 days') >= 3 then
        raise exception 'Too many requests. Email app@pack361.org instead.' using errcode = '54000';
    end if;
    if (select count(*) from public.join_requests r where r.status = 'pending') >= 50 then
        raise exception 'Too many requests are waiting. Email app@pack361.org instead.' using errcode = '54000';
    end if;
    new.first_name := trim(new.first_name);
    new.last_name := trim(new.last_name);
    new.phone := nullif(trim(new.phone), '');
    new.relationship := nullif(trim(new.relationship), '');
    new.note := nullif(trim(new.note), '');
    new.status := 'pending';
    new.decline_reason := null;
    new.family_id := null;
    new.decided_by := null;
    new.decided_at := null;
    new.created_at := now();
    return new;
end;
$$;
revoke execute on function private.join_request_insert() from public, anon, authenticated;

update public.guide_pages
   set body = replace(body, 'info@pack361.org', 'app@pack361.org')
 where body like '%info@pack361.org%';

-- 2. Records of families who left ------------------------------------------------------------

insert into public.pack_settings (key, value) values ('left_family_months', '24')
on conflict (key) do nothing;

-- The security log notes a clearing without keeping the old email.
create or replace function private.log_adult_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
    who text := coalesce(case when tg_op = 'DELETE' then old.first_name || ' ' || old.last_name
                              else new.first_name || ' ' || new.last_name end, 'Unknown');
    changes jsonb := '{}'::jsonb;
begin
    if tg_op = 'INSERT' then
        perform private.log_security('adult.added', who, jsonb_build_object('role', new.role, 'family_id', new.family_id));
    elsif tg_op = 'DELETE' then
        perform private.log_security('adult.removed', who, jsonb_build_object('role', old.role, 'family_id', old.family_id));
    elsif new.email like 'removed-%@left.invalid' and old.email not like 'removed-%@left.invalid' then
        perform private.log_security('adult.contact_cleared', who, jsonb_build_object('left_on', new.left_on));
    else
        if new.role is distinct from old.role then
            changes := changes || jsonb_build_object('role', jsonb_build_array(old.role, new.role));
        end if;
        if new.position_title is distinct from old.position_title then
            changes := changes || jsonb_build_object('position', jsonb_build_array(old.position_title, new.position_title));
        end if;
        if new.is_active is distinct from old.is_active then
            changes := changes || jsonb_build_object('active', jsonb_build_array(old.is_active, new.is_active));
        end if;
        if new.family_id is distinct from old.family_id then
            changes := changes || jsonb_build_object('family_id', jsonb_build_array(old.family_id, new.family_id));
        end if;
        if lower(coalesce(new.email, '')) is distinct from lower(coalesce(old.email, '')) then
            changes := changes || jsonb_build_object('email', jsonb_build_array(old.email, new.email));
        end if;
        if new.user_id is distinct from old.user_id and old.user_id is not null then
            changes := changes || jsonb_build_object('sign_in', 'reset');
        end if;
        if changes <> '{}'::jsonb then
            perform private.log_security('adult.changed', who, changes);
        end if;
    end if;
    return null;
end $$;

-- Adults who are off, in a family that's off (or no family), who left more than the set number of
-- months ago: email, phone, other names and sign-in are cleared and their calendar link stops
-- working. Their sign-in account is deleted too. Returns how many adults were cleared.
create or replace function public.purge_left_families()
returns int language plpgsql security definer set search_path = '' as $$
declare
    months int := nullif(regexp_replace(coalesce(
        (select value from public.pack_settings where key = 'left_family_months'), ''), '\D', '', 'g'), '')::int;
    users uuid[];
    n int;
begin
    if months is null or months < 1 then
        return 0;
    end if;
    with gone as (
        select a.id, a.user_id
          from public.adults a
          left join public.families f on f.id = a.family_id
         where not a.is_active
           and coalesce(f.is_active, false) = false
           and coalesce(a.left_on, f.left_on) is not null
           and coalesce(a.left_on, f.left_on) < current_date - make_interval(months => months)
           and a.email not like 'removed-%@left.invalid'
    ), cleared as (
        update public.adults a
           set email = 'removed-' || a.id::text || '@left.invalid',
               phone = null,
               other_names = '{}',
               relationship = null,
               user_id = null,
               calendar_token = gen_random_uuid()
          from gone
         where a.id = gone.id
        returning gone.user_id
    )
    select array_agg(user_id) filter (where user_id is not null), count(*) into users, n from cleared;
    if users is not null then
        delete from auth.users u where u.id = any (users);
    end if;
    return coalesce(n, 0);
end $$;
revoke execute on function public.purge_left_families() from public, anon, authenticated;
grant execute on function public.purge_left_families() to service_role;

commit;
