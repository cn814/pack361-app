-- Leader training, part 2:
--   1. More courses: Chartered Organization Representative, IOLS, Wood Badge, CPR / First Aid,
--      Climb On Safely, Trek Safely (alongside the existing keys, which keep working).
--   2. BSA member IDs: each adult can set their own with set_my_member_id(text). Admins
--      still edit anyone's in the roster forms. Scouts already have bsa_member_id.
--   3. import_trainings(jsonb, jsonb): applies a my.scouting training report that was parsed
--      and matched in the browser. Runs as the caller, so Row Level Security still decides
--      what can be written; only dates newer than what the app has are applied.

-- -----------------------------------------------------------------------------
-- 1. Courses
-- -----------------------------------------------------------------------------
alter table public.adult_trainings drop constraint if exists adult_trainings_course_check;
alter table public.adult_trainings add constraint adult_trainings_course_check check (course in
    ('ypt', 'position', 'cor', 'hazardous_weather', 'baloo', 'safe_swim', 'safety_afloat',
     'climb_on_safely', 'trek_safely', 'iols', 'wood_badge', 'cpr_first_aid'));

-- -----------------------------------------------------------------------------
-- 2. Member IDs
-- -----------------------------------------------------------------------------
create index if not exists adults_bsa_member_idx on public.adults (bsa_member_id) where bsa_member_id is not null;

-- Set (or clear, with an empty value) the signed-in adult's own BSA member ID.
create or replace function public.set_my_member_id(p_member_id text)
returns text language plpgsql security definer set search_path = '' as $$
declare
    v_me  uuid := private.current_adult_id();
    v_id  text := nullif(btrim(coalesce(p_member_id, '')), '');
begin
    if v_me is null then
        raise exception 'Not on the pack roster' using errcode = '42501';
    end if;
    if v_id is not null and v_id !~ '^[0-9]{1,12}$' then
        raise exception 'A member ID is digits only, up to 12' using errcode = '22023';
    end if;
    if v_id is not null and exists (select 1 from public.adults a
                                     where a.bsa_member_id = v_id and a.id <> v_me) then
        raise exception 'That member ID is on another adult''s record. Ask a pack admin.' using errcode = '23505';
    end if;
    update public.adults set bsa_member_id = v_id where id = v_me;
    return v_id;
end;
$$;
revoke execute on function public.set_my_member_id(text) from public, anon;
grant execute on function public.set_my_member_id(text) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Import from a my.scouting training report
-- -----------------------------------------------------------------------------
-- p_rows:       [{adult_id, course, completed_on, expires_on}]
-- p_member_ids: [{adult_id, member_id}]  (only fills in adults who have none yet)
-- A row is applied when the app has nothing for that course, or the report's completion
-- date is newer, or (reports with only an expiration date) its expiration date is later.
create or replace function public.import_trainings(p_rows jsonb, p_member_ids jsonb default '[]')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
    v_trainings int;
    v_adults    int;
    v_ids       int;
begin
    if not private.is_admin() then
        raise exception 'Only pack admins can import training' using errcode = '42501';
    end if;
    if jsonb_typeof(coalesce(p_rows, '[]')) <> 'array' or jsonb_array_length(coalesce(p_rows, '[]')) > 2000
       or jsonb_typeof(coalesce(p_member_ids, '[]')) <> 'array' or jsonb_array_length(coalesce(p_member_ids, '[]')) > 2000 then
        raise exception 'Send at most 2000 rows' using errcode = '22023';
    end if;

    with incoming as (
        select distinct on (x.adult_id, x.course) x.adult_id, x.course, x.completed_on, x.expires_on
          from jsonb_to_recordset(coalesce(p_rows, '[]')) as x(adult_id uuid, course text, completed_on date, expires_on date)
         where x.adult_id is not null
           and (x.completed_on is not null or x.expires_on is not null)
           and (x.completed_on is null or x.completed_on <= current_date + 1)
           and (x.completed_on is null or x.expires_on is null or x.expires_on >= x.completed_on)
         order by x.adult_id, x.course, x.completed_on desc nulls last, x.expires_on desc nulls last
    ), applied as (
        insert into public.adult_trainings as t (adult_id, course, completed_on, expires_on)
        select i.adult_id, i.course, i.completed_on, i.expires_on from incoming i
        on conflict (adult_id, course) do update
           set completed_on = excluded.completed_on, expires_on = excluded.expires_on
         where (t.completed_on is null and t.expires_on is null)
            or (excluded.completed_on is not null
                and (t.completed_on is null or excluded.completed_on > t.completed_on))
            or (excluded.completed_on is null and excluded.expires_on is not null
                and (t.expires_on is null or excluded.expires_on > t.expires_on))
        returning t.adult_id
    )
    select count(*), count(distinct adult_id) into v_trainings, v_adults from applied;

    with ids as (
        select distinct on (x.adult_id) x.adult_id, btrim(x.member_id) as member_id
          from jsonb_to_recordset(coalesce(p_member_ids, '[]')) as x(adult_id uuid, member_id text)
         where btrim(x.member_id) ~ '^[0-9]{1,12}$'
    ), unique_ids as (
        select * from ids i where (select count(*) from ids j where j.member_id = i.member_id) = 1
    ), saved as (
        update public.adults a set bsa_member_id = u.member_id
          from unique_ids u
         where a.id = u.adult_id
           and a.bsa_member_id is null
           and not exists (select 1 from public.adults o where o.bsa_member_id = u.member_id and o.id <> a.id)
        returning a.id
    )
    select count(*) into v_ids from saved;

    return jsonb_build_object('trainings', v_trainings, 'adults', v_adults, 'member_ids', v_ids);
end;
$$;
revoke execute on function public.import_trainings(jsonb, jsonb) from public, anon;
grant execute on function public.import_trainings(jsonb, jsonb) to authenticated;
