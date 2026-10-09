-- Security log: a record of who changed access and who downloaded pack data.
--
-- What's logged (one row each):
--   * an adult added, removed, turned on or off, moved to another family, or their app role,
--     pack position or email changed
--   * a scout added, removed, turned on or off, or moved to another family
--   * someone made or unmade a den leader, or given or denied a report
--   * a family turned on or off
--   * a spreadsheet download (roster, membership and dues, training, medical forms, attendance,
--     money), through public.log_download()
-- Who did it is the signed-in adult; empty for the app's own jobs (Scoutbook import, nightly jobs).
--
-- Only admins (and the Cubmaster) can read it, after their two-step code. Nobody can change or
-- delete a row through the app, not even an admin: only the nightly job clears rows older than
-- two years. No medical details, notes or payments are copied into it.

begin;

create table if not exists public.security_log (
    id          bigint generated always as identity primary key,
    at          timestamptz not null default now(),
    actor_id    uuid,          -- no link to adults, so the record stays when someone leaves
    actor_name  text,
    action      text not null check (length(action) <= 60),
    subject     text check (length(subject) <= 200),
    detail      jsonb not null default '{}'::jsonb
);
create index if not exists security_log_at_idx on public.security_log(at desc);

alter table public.security_log enable row level security;
revoke all on public.security_log from anon, authenticated;
grant select on public.security_log to authenticated;

drop policy if exists security_log_read on public.security_log;
create policy security_log_read on public.security_log for select to authenticated
    using ((select private.is_admin()));
-- No insert, update or delete policies: rows only come from the functions below.

create or replace function private.log_security(p_action text, p_subject text, p_detail jsonb)
returns void language sql security definer set search_path = '' as $$
    insert into public.security_log (actor_id, actor_name, action, subject, detail)
    select me.id, me.first_name || ' ' || me.last_name, p_action, left(p_subject, 200), coalesce(p_detail, '{}'::jsonb)
      from (select private.current_adult_id() as aid) x
      left join public.adults me on me.id = x.aid;
$$;
revoke execute on function private.log_security(text, text, jsonb) from public, anon, authenticated;

-- Adults: added, removed, and changes to who they are or what they can reach.
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
drop trigger if exists adults_security_log on public.adults;
create trigger adults_security_log after insert or update or delete on public.adults
    for each row execute function private.log_adult_change();

-- Scouts: added, removed, turned on or off, moved to another family.
create or replace function private.log_scout_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
    who text := case when tg_op = 'DELETE' then old.first_name || ' ' || left(old.last_name, 1) || '.'
                     else new.first_name || ' ' || left(new.last_name, 1) || '.' end;
    changes jsonb := '{}'::jsonb;
begin
    if tg_op = 'INSERT' then
        perform private.log_security('scout.added', who, jsonb_build_object('family_id', new.family_id));
    elsif tg_op = 'DELETE' then
        perform private.log_security('scout.removed', who, jsonb_build_object('family_id', old.family_id));
    else
        if new.is_active is distinct from old.is_active then
            changes := changes || jsonb_build_object('active', jsonb_build_array(old.is_active, new.is_active));
        end if;
        if new.family_id is distinct from old.family_id then
            changes := changes || jsonb_build_object('family_id', jsonb_build_array(old.family_id, new.family_id));
        end if;
        if changes <> '{}'::jsonb then
            perform private.log_security('scout.changed', who, changes);
        end if;
    end if;
    return null;
end $$;
drop trigger if exists scouts_security_log on public.scouts;
create trigger scouts_security_log after insert or update or delete on public.scouts
    for each row execute function private.log_scout_change();

-- Families turned on or off.
create or replace function private.log_family_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
    if tg_op = 'UPDATE' and new.is_active is distinct from old.is_active then
        perform private.log_security(case when new.is_active then 'family.on' else 'family.off' end,
                                     new.family_name || ' family', '{}'::jsonb);
    elsif tg_op = 'DELETE' then
        perform private.log_security('family.removed', old.family_name || ' family', '{}'::jsonb);
    end if;
    return null;
end $$;
drop trigger if exists families_security_log on public.families;
create trigger families_security_log after update or delete on public.families
    for each row execute function private.log_family_change();

-- Den leaders made or unmade.
create or replace function private.log_den_leader_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
    r record := case when tg_op = 'DELETE' then old else new end;
    who text := (select a.first_name || ' ' || a.last_name from public.adults a where a.id = r.adult_id);
    den text := (select d.name from public.dens d where d.id = r.den_id);
begin
    perform private.log_security(case when tg_op = 'DELETE' then 'den_leader.removed' else 'den_leader.added' end,
                                 coalesce(who, 'Unknown'), jsonb_build_object('den', den));
    return null;
end $$;
drop trigger if exists den_leaders_security_log on public.den_leaders;
create trigger den_leaders_security_log after insert or delete on public.den_leaders
    for each row execute function private.log_den_leader_change();

-- Report access given or taken away.
create or replace function private.log_report_access_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
    r record := case when tg_op = 'DELETE' then old else new end;
    who text := (select a.first_name || ' ' || a.last_name from public.adults a where a.id = r.adult_id);
begin
    perform private.log_security(case when tg_op = 'DELETE' then 'report_access.removed' else 'report_access.added' end,
                                 coalesce(who, 'Unknown'), jsonb_build_object('report', r.report));
    return null;
end $$;
drop trigger if exists report_access_security_log on public.report_access;
create trigger report_access_security_log after insert or delete on public.report_access
    for each row execute function private.log_report_access_change();

-- Spreadsheet downloads: the app calls this before sending the file.
create or replace function public.log_download(p_what text)
returns void language plpgsql security definer set search_path = '' as $$
begin
    if not private.is_member() then
        raise exception 'Sign in first' using errcode = '42501';
    end if;
    if p_what is null or p_what !~ '^[a-z_]{1,40}$' then
        raise exception 'Unknown download' using errcode = '22023';
    end if;
    perform private.log_security('download', p_what, '{}'::jsonb);
end $$;
revoke execute on function public.log_download(text) from public, anon;
grant execute on function public.log_download(text) to authenticated;

-- Keep two years: the nightly job (secret key only) clears older rows.
create or replace function public.purge_security_log()
returns int language sql security definer set search_path = '' as $$
    with gone as (delete from public.security_log where at < now() - interval '2 years' returning 1)
    select count(*)::int from gone;
$$;
revoke execute on function public.purge_security_log() from public, anon, authenticated;
grant execute on function public.purge_security_log() to service_role;

commit;
