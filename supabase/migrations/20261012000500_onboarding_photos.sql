-- Getting started for new families, and pack photos OK unless the family opts out (2026-10-12).
--   1. Photos        the pack decided scouts may appear in pack photos unless their family says
--                    no. photo_permission 'no' = opted out; 'yes' or null (never changed) = OK.
--                    Nothing in the database checked the value, so only the column note changes.
--                    Explicit 'no' answers are kept as they are.
--   2. To-dos        "Hide" on the Getting started card files 'getting-started' in todo_dismissals.
--                    (20261011000000 set the check to polls, jobs and training-import.)
--   3. New families  added in the last 90 days, and not part of the first roster load
--                    (pack_settings 'onboarding_from'; a date an admin can move).
--   4. Functions     the signed-in family's start date (Home card); the committee's list of new
--                    families and where each stands; who has phone alerts on (Welcome emails page).

begin;

-- -----------------------------------------------------------------------------
-- 1. Photos: OK unless the family opts out
-- -----------------------------------------------------------------------------
comment on column public.scouts.photo_permission is
    'Pack photos. no = the family opted out. yes, or null (never changed) = OK to include (pack decision 2026-10-12).';

-- -----------------------------------------------------------------------------
-- 2. To-do dismissals: poll-<id>, job-<id>, training-import, getting-started
-- -----------------------------------------------------------------------------
alter table public.todo_dismissals drop constraint if exists todo_dismissals_key_check;
alter table public.todo_dismissals add constraint todo_dismissals_key_check
    check (key ~ '^((poll|job)-[0-9a-f-]{36}|training-import|getting-started)$');

-- -----------------------------------------------------------------------------
-- 3. Which families are new
-- -----------------------------------------------------------------------------
-- The whole roster was loaded when the app started, so every family looks a few days old.
-- Families added from three days after that first load count as new (on an empty database:
-- from today).
insert into public.pack_settings (key, value)
select 'onboarding_from',
       coalesce((select ((min(f.created_at) at time zone 'America/New_York')::date + 3)::text from public.families f),
                ((now() at time zone 'America/New_York')::date)::text)
on conflict (key) do nothing;

create or replace function private.family_is_new(p_created timestamptz)
returns boolean language sql stable security definer set search_path = '' as $$
    select p_created >= now() - interval '90 days'
       and (p_created at time zone 'America/New_York')::date >=
           case when private.setting('onboarding_from') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
                then private.setting('onboarding_from')::date
                else date '1900-01-01' end
$$;
revoke all on function private.family_is_new(timestamptz) from public, anon;
grant execute on function private.family_is_new(timestamptz) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Functions
-- -----------------------------------------------------------------------------
-- When the signed-in adult's family joined, if it's still new (null otherwise, or no family).
create or replace function public.getting_started_since()
returns timestamptz language sql stable security definer set search_path = '' as $$
    select f.created_at
      from public.adults a
      join public.families f on f.id = a.family_id
     where a.user_id = auth.uid() and a.is_active and f.is_active
       and private.family_is_new(f.created_at)
$$;
revoke all on function public.getting_started_since() from public, anon;
grant execute on function public.getting_started_since() to authenticated;

-- Pack leadership: each new family and which getting-started steps the app can see are done.
-- Same rules as src/lib/onboarding.ts: registration not expired for every scout; a medical form
-- turned in or on file (not expired) for every scout; a dues charge and none still open; phone
-- alerts on for any adult in the family. Calendar, guide and meeting the den leader are ticked
-- on the family's phone, so they aren't here.
create or replace function public.new_family_checklist()
returns table (family_id uuid, family_name text, joined_at timestamptz, adults text, scouts int,
               registered boolean, forms_in boolean, dues_paid boolean, alerts_on boolean, signed_in boolean)
language sql stable security definer set search_path = '' as $$
    with today as (
        select (now() at time zone 'America/New_York')::date as d
    ), fam as (
        select f.id, f.family_name, f.created_at
          from public.families f
         where f.is_active and private.family_is_new(f.created_at) and private.is_committee()
    )
    select fam.id,
           fam.family_name,
           fam.created_at,
           (select string_agg(coalesce(a.preferred_name, a.first_name) || ' ' || a.last_name, ', ' order by a.first_name)
              from public.adults a where a.family_id = fam.id and a.is_active),
           (select count(*)::int from public.scouts s where s.family_id = fam.id and s.is_active),
           not exists (select 1 from public.scouts s, today
                        where s.family_id = fam.id and s.is_active
                          and (s.registration_expires_on is null or s.registration_expires_on < today.d)),
           not exists (select 1 from public.scouts s, today
                        where s.family_id = fam.id and s.is_active
                          and not exists (select 1 from public.health_forms h
                                           where h.scout_id = s.id
                                             and (h.expires_on is null or h.expires_on >= today.d))),
           exists (select 1 from public.charges c
                    where c.family_id = fam.id and c.kind = 'dues' and c.status <> 'canceled')
             and not exists (select 1 from public.charges c
                              where c.family_id = fam.id and c.kind = 'dues' and c.status = 'open' and c.amount_cents > 0),
           exists (select 1 from public.push_subscriptions p
                     join public.adults a on a.id = p.adult_id
                    where a.family_id = fam.id and a.is_active),
           exists (select 1 from public.adults a
                    where a.family_id = fam.id and a.is_active and a.user_id is not null)
      from fam
     order by fam.created_at desc
$$;
revoke all on function public.new_family_checklist() from public, anon;
grant execute on function public.new_family_checklist() to authenticated;

-- Pack leadership: adults with phone alerts on (at least one phone or browser saved).
create or replace function public.adults_with_alerts()
returns table (adult_id uuid) language sql stable security definer set search_path = '' as $$
    select distinct p.adult_id from public.push_subscriptions p where private.is_committee()
$$;
revoke all on function public.adults_with_alerts() from public, anon;
grant execute on function public.adults_with_alerts() to authenticated;

commit;
