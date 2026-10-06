-- Reports for pack leadership, and events for just some scouts.
--   1. When people leave the roster (left_on), so the roster report can list who was registered
--      up to two years back.
--   2. Who may open the roster and membership reports: a default by role, plus people a pack admin
--      adds (report_access). Both reports are read through functions that check this, so they
--      show only the columns that report needs.
--   3. Events only for some scouts (events.only_scouts): only those scouts' families (and
--      leaders) see them.
-- Training and medical-form reports use what leaders can already read.

begin;

-- -----------------------------------------------------------------------------
-- 1. When people leave
-- -----------------------------------------------------------------------------
alter table public.adults add column if not exists left_on date;
alter table public.scouts add column if not exists left_on date;
alter table public.families add column if not exists left_on date;

create or replace function private.stamp_left_on()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    if new.is_active and not old.is_active then
        new.left_on := null;
    elsif old.is_active and not new.is_active then
        new.left_on := coalesce(new.left_on, (now() at time zone 'America/New_York')::date);
    end if;
    return new;
end $$;
revoke execute on function private.stamp_left_on() from public, anon, authenticated;

drop trigger if exists adults_left_on on public.adults;
create trigger adults_left_on before update of is_active on public.adults
    for each row execute function private.stamp_left_on();
drop trigger if exists scouts_left_on on public.scouts;
create trigger scouts_left_on before update of is_active on public.scouts
    for each row execute function private.stamp_left_on();
drop trigger if exists families_left_on on public.families;
create trigger families_left_on before update of is_active on public.families
    for each row execute function private.stamp_left_on();

-- -----------------------------------------------------------------------------
-- 2. Report access
-- -----------------------------------------------------------------------------
create table if not exists public.report_access (
    report    text not null check (report in ('roster', 'membership')),
    adult_id  uuid not null references public.adults(id) on delete cascade,
    added_by  uuid references public.adults(id) on delete set null,
    added_at  timestamptz not null default now(),
    primary key (report, adult_id)
);
alter table public.report_access enable row level security;
revoke all on public.report_access from anon;
grant select, insert, delete on public.report_access to authenticated;

drop policy if exists report_access_read on public.report_access;
create policy report_access_read on public.report_access for select to authenticated
    using ((select private.is_admin()) or adult_id = (select private.current_adult_id()));
drop policy if exists report_access_add on public.report_access;
create policy report_access_add on public.report_access for insert to authenticated
    with check ((select private.is_admin()));
drop policy if exists report_access_remove on public.report_access;
create policy report_access_remove on public.report_access for delete to authenticated
    using ((select private.is_admin()));

-- Who may open a report: roster = the Cubmaster and admins; membership = key leaders, the
-- Cubmaster and admins; plus anyone a pack admin added. Always with the authenticator code, so
-- only leaders (who sign in with two steps) can be added.
create or replace function private.can_report(p_report text)
returns boolean language sql stable security definer set search_path = '' as $$
    select private.code_entered() and exists (
        select 1 from public.adults a
         where a.user_id = auth.uid() and a.is_active
           and ((p_report = 'roster' and a.role in ('cubmaster', 'admin'))
             or (p_report = 'membership' and a.role in ('committee', 'cubmaster', 'admin'))
             or exists (select 1 from public.report_access r where r.report = p_report and r.adult_id = a.id)))
$$;
revoke execute on function private.can_report(text) from public, anon;
grant execute on function private.can_report(text) to authenticated;

-- The reports this person may open (for the Leaders tab).
create or replace function public.my_reports()
returns text[] language sql stable security definer set search_path = '' as $$
    select array(select r from unnest(array['roster', 'membership']) r where private.can_report(r))
$$;
revoke execute on function public.my_reports() from public, anon;
grant execute on function public.my_reports() to authenticated;

-- Roster: everyone registered now, and everyone who left in the last two years (or whose leaving
-- date isn't known: they left before the app kept it). Contact details, member IDs, roles and
-- registration dates; nothing medical.
create or replace function public.report_roster()
returns table (
    person       text,
    active       boolean,
    left_on      date,
    family       text,
    first_name   text,
    last_name    text,
    goes_by      text,
    den          text,
    role         text,
    positions    text,
    relationship text,
    email        text,
    phone        text,
    member_id    text,
    registration_expires_on date,
    photo_permission text,
    added_on     date
) language plpgsql stable security definer set search_path = '' as $$
declare
    since date := (now() at time zone 'America/New_York')::date - 730;
begin
    if not private.can_report('roster') then
        raise exception 'Not allowed' using errcode = '42501';
    end if;
    return query
    select 'Scout'::text, s.is_active, s.left_on, f.family_name, s.first_name, s.last_name, null::text,
           d.name, null::text, null::text, null::text, null::text, null::text, s.bsa_member_id,
           s.registration_expires_on, s.photo_permission, (s.created_at at time zone 'America/New_York')::date
      from public.scouts s
      left join public.families f on f.id = s.family_id
      left join public.dens d on d.id = s.den_id
     where s.is_active or s.left_on is null or s.left_on >= since
    union all
    select 'Adult'::text, a.is_active, a.left_on, f.family_name, a.first_name, a.last_name, a.preferred_name,
           (select string_agg(d2.name, ', ' order by d2.name) from public.den_leaders dl join public.dens d2 on d2.id = dl.den_id where dl.adult_id = a.id),
           a.role::text,
           nullif(concat_ws(', ', a.position_title,
                  (select string_agg(dl.title || ' (' || d3.name || ')', ', ' order by d3.name)
                     from public.den_leaders dl join public.dens d3 on d3.id = dl.den_id where dl.adult_id = a.id)), ''),
           a.relationship, a.email, a.phone, a.bsa_member_id, a.registration_expires_on, null::text,
           (a.created_at at time zone 'America/New_York')::date
      from public.adults a
      left join public.families f on f.id = a.family_id
     where a.is_active or a.left_on is null or a.left_on >= since;
end $$;
revoke execute on function public.report_roster() from public, anon;
grant execute on function public.report_roster() to authenticated;

-- Membership: who's registered and paid, per active scout and adult. No contact details.
-- Registration fees (national, council): the person's newest charge of that kind. Pack dues:
-- the scout's charge for this season.
create or replace function public.report_membership(p_season text)
returns table (
    person       text,
    name         text,
    den          text,
    family       text,
    role         text,
    registration_expires_on date,
    national_fee text,
    council_fee  text,
    pack_dues    text
) language plpgsql stable security definer set search_path = '' as $$
begin
    if not private.can_report('membership') then
        raise exception 'Not allowed' using errcode = '42501';
    end if;
    return query
    select 'Scout'::text, s.first_name || ' ' || s.last_name, d.name, f.family_name, null::text, s.registration_expires_on,
           (select c.status from public.charges c where c.scout_id = s.id and c.kind = 'national' and c.status <> 'canceled' order by c.created_at desc limit 1),
           (select c.status from public.charges c where c.scout_id = s.id and c.kind = 'council' and c.status <> 'canceled' order by c.created_at desc limit 1),
           (select c.status from public.charges c where c.scout_id = s.id and c.kind = 'dues' and c.season = p_season and c.status <> 'canceled' order by c.created_at desc limit 1)
      from public.scouts s
      left join public.families f on f.id = s.family_id
      left join public.dens d on d.id = s.den_id
     where s.is_active
    union all
    select 'Adult'::text, coalesce(a.preferred_name, a.first_name) || ' ' || a.last_name, null::text, f.family_name, a.role::text, a.registration_expires_on,
           (select c.status from public.charges c where c.adult_id = a.id and c.scout_id is null and c.kind = 'national' and c.status <> 'canceled' order by c.created_at desc limit 1),
           (select c.status from public.charges c where c.adult_id = a.id and c.scout_id is null and c.kind = 'council' and c.status <> 'canceled' order by c.created_at desc limit 1),
           null::text
      from public.adults a
      left join public.families f on f.id = a.family_id
     where a.is_active and (a.role <> 'parent' or a.registration_expires_on is not null or a.bsa_member_id is not null);
end $$;
revoke execute on function public.report_membership(text) from public, anon;
grant execute on function public.report_membership(text) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Events only for some scouts
-- -----------------------------------------------------------------------------
alter table public.events add column if not exists only_scouts uuid[];
alter table public.events drop constraint if exists events_only_scouts_not_empty;
alter table public.events add constraint events_only_scouts_not_empty check (only_scouts is null or cardinality(only_scouts) > 0);

alter policy events_read on public.events
    using (((select private.is_member())
            and ((not leaders_only) or (select private.is_leader()))
            and (only_scouts is null or (select private.is_leader()) or only_scouts && array(select private.my_scout_ids()))));

create or replace function private.can_see_event(p_event_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (
        select 1 from public.events e
         where e.id = p_event_id and private.is_member()
           and (not e.leaders_only or private.is_leader())
           and (e.only_scouts is null or private.is_leader() or e.only_scouts && array(select private.my_scout_ids())))
$$;

-- -----------------------------------------------------------------------------
-- 4. Den-meeting notices for some ranks ("Bears-Only: No Den Meeting") from TroopWebHost were
--    shown to every family. The sync now keeps the ranks a title names; fix the upcoming ones.
-- -----------------------------------------------------------------------------
update public.events e
   set ranks = r.ranks
  from (
    select x.id,
           array_remove(array[
               case when x.title ~* '(^|[^a-z])lions?([^a-z]|$)' then 'lion' end,
               case when x.title ~* '(^|[^a-z])tigers?([^a-z]|$)' then 'tiger' end,
               case when x.title ~* '(^|[^a-z])(wolf|wolves)([^a-z]|$)' then 'wolf' end,
               case when x.title ~* '(^|[^a-z])bears?([^a-z]|$)' then 'bear' end,
               case when x.title ~* '(^|[^a-z])webelos([^a-z]|$)' then 'webelos' end,
               case when x.title ~* '(^|[^a-z])aols?([^a-z]|$)|arrow of light' then 'aol' end
           ]::text[], null)::public.den_rank[] as ranks
      from public.events x
     where x.source = 'troopwebhost' and x.category = 'Den Meeting' and x.den_id is null and x.ranks is null
       and x.archived_at is null and x.starts_at > now() - interval '1 day'
  ) r
 where e.id = r.id and cardinality(r.ranks) between 1 and 5;

commit;
