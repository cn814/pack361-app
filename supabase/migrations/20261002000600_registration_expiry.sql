-- Scouting America registration expiry tracking.
-- Families renew and pay national and council registration themselves at my.scouting.org; the
-- pack doesn't collect it. The pack keeps each scout's and registered adult's expiration date so
-- families get a reminder (30, 7 and 0 days before) and leaders can see who is due.
--   1. scouts / adults   registration_expires_on, and which reminder went out last
--   2. set_registration_expiry()   committee and admins set or clear dates (one or many)
--   3. registration_billing   pack setting: show the old "bill registration through the pack"
--                             tools on the Money page (off by default). The national / council
--                             charge kinds and their functions stay as they are.
-- Families read their own scouts' and their own dates through the existing select policies
-- (scouts_read, adults_read). They can't change them: the row guards on scouts and adults only
-- let families change the photo answer, phone and preferred name.

-- -----------------------------------------------------------------------------
-- 1. Columns
-- -----------------------------------------------------------------------------
alter table public.scouts
    add column registration_expires_on    date,
    add column registration_reminded_days int;   -- smallest "days before" reminder already sent (30, 7, 0)
alter table public.adults
    add column registration_expires_on    date,
    add column registration_reminded_days int;

-- A new date starts the reminders over, however it was changed (this function or the roster forms).
create or replace function private.reset_registration_reminders()
returns trigger language plpgsql set search_path = '' as $$
begin
    if new.registration_expires_on is distinct from old.registration_expires_on then
        new.registration_reminded_days := null;
    end if;
    return new;
end;
$$;
revoke execute on function private.reset_registration_reminders() from public, anon, authenticated;
create trigger scouts_registration_reminders before update of registration_expires_on on public.scouts
    for each row execute function private.reset_registration_reminders();
create trigger adults_registration_reminders before update of registration_expires_on on public.adults
    for each row execute function private.reset_registration_reminders();

-- -----------------------------------------------------------------------------
-- 2. Committee: set (or, with null, clear) the expiration date for scouts and adults
-- -----------------------------------------------------------------------------
create or replace function public.set_registration_expiry(p_scout_ids uuid[], p_adult_ids uuid[], p_on date)
returns int language plpgsql security definer set search_path = '' as $$
declare
    n int;
    m int;
begin
    if not private.is_committee() then raise exception 'Committee only' using errcode = '42501'; end if;
    if p_on is not null and (p_on < date '2000-01-01' or p_on > date '2100-12-31') then
        raise exception 'Pick a real date' using errcode = '22023';
    end if;
    update public.scouts set registration_expires_on = p_on
     where id = any (coalesce(p_scout_ids, '{}')) and registration_expires_on is distinct from p_on;
    get diagnostics n = row_count;
    update public.adults set registration_expires_on = p_on
     where id = any (coalesce(p_adult_ids, '{}')) and registration_expires_on is distinct from p_on;
    get diagnostics m = row_count;
    return n + m;
end;
$$;
revoke execute on function public.set_registration_expiry(uuid[], uuid[], date) from public, anon;
grant execute on function public.set_registration_expiry(uuid[], uuid[], date) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Settings: registration_billing (on / off)
-- -----------------------------------------------------------------------------
insert into public.pack_settings (key, value) values ('registration_billing', 'off') on conflict (key) do nothing;

-- Same as before (20261002000500_givebutter_dues.sql), plus registration_billing.
create or replace function public.save_pay_settings(p_values jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
    k text;
    v text;
begin
    if not private.is_committee() then raise exception 'Committee only' using errcode = '42501'; end if;
    for k, v in select key, value from jsonb_each_text(p_values) loop
        if k not in ('dues_season', 'registration_year', 'dues_amount_cents', 'national_youth_cents', 'national_adult_cents',
                     'council_youth_cents', 'council_adult_cents', 'pay_other_how',
                     'dues_givebutter_campaign_id', 'dues_sibling_discount_cents', 'registration_billing') then
            raise exception 'Not a payment setting: %', k using errcode = '22023';
        end if;
        if k like '%_cents' and (v !~ '^\d{1,6}$' or v::int > 100000) then
            raise exception 'Amounts must be $0 to $1,000' using errcode = '22023';
        end if;
        if k = 'dues_season' and v !~ '^\d{4}-\d{2}$' then raise exception 'Write the season like 2026-27' using errcode = '22023'; end if;
        if k = 'registration_year' and v !~ '^(\d{4})?$' then raise exception 'Write the year like 2027' using errcode = '22023'; end if;
        if k = 'pay_other_how' and length(v) > 600 then raise exception 'Keep it under 600 characters' using errcode = '22023'; end if;
        if k = 'dues_givebutter_campaign_id' and v <> ''
           and (v !~ '^\d{1,18}$' or not exists (select 1 from public.givebutter_campaigns c where c.id = v::bigint)) then
            raise exception 'Pick one of the synced Givebutter campaigns' using errcode = '22023';
        end if;
        if k = 'registration_billing' and v not in ('on', 'off') then
            raise exception 'Registration billing is on or off' using errcode = '22023';
        end if;
        insert into public.pack_settings (key, value, updated_at) values (k, v, now())
        on conflict (key) do update set value = excluded.value, updated_at = now();
    end loop;
end;
$$;
revoke execute on function public.save_pay_settings(jsonb) from public, anon;
grant execute on function public.save_pay_settings(jsonb) to authenticated;
