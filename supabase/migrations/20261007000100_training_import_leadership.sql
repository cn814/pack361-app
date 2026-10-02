-- Training import for pack leadership (the Committee Chair keeps everyone's training current),
-- and a record of when it last ran, for the monthly reminder.
--
-- import_trainings now runs with the function owner's rights (security definer), so it can write
-- other adults' training for pack leadership without widening the table rules. It checks the
-- caller itself and only writes training dates and missing member IDs.

create or replace function public.import_trainings(p_rows jsonb, p_member_ids jsonb default '[]')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_trainings int;
    v_adults    int;
    v_ids       int;
begin
    if not private.is_committee() then
        raise exception 'Only pack leadership can import training' using errcode = '42501';
    end if;
    if jsonb_typeof(coalesce(p_rows, '[]')) <> 'array' or jsonb_array_length(coalesce(p_rows, '[]')) > 2000
       or jsonb_typeof(coalesce(p_member_ids, '[]')) <> 'array' or jsonb_array_length(coalesce(p_member_ids, '[]')) > 2000 then
        raise exception 'Send at most 2000 rows' using errcode = '22023';
    end if;

    with incoming as (
        select distinct on (x.adult_id, x.course) x.adult_id, x.course, x.completed_on, x.expires_on
          from jsonb_to_recordset(coalesce(p_rows, '[]')) as x(adult_id uuid, course text, completed_on date, expires_on date)
          join public.adults a on a.id = x.adult_id
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

    -- When the pack's training was last brought up to date (the monthly reminder reads this).
    insert into public.pack_settings (key, value, updated_at) values ('training_last_import', now()::text, now())
    on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;

    return jsonb_build_object('trainings', v_trainings, 'adults', v_adults, 'member_ids', v_ids);
end;
$$;
revoke execute on function public.import_trainings(jsonb, jsonb) from public, anon;
grant execute on function public.import_trainings(jsonb, jsonb) to authenticated;
