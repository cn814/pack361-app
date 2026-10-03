-- Weekly Scoutbook job: the server (with its secret key, no person signed in) may run the same
-- advancement and training imports that admins and pack leadership run by hand. Same rules:
-- only newer training dates; advancement replaced only for scouts Scoutbook answered for.
-- Nothing else about either function changes. The secret key is only on the server.

-- The pack's own helper checks (is_admin, current_adult_id...) live in the private schema; the
-- server's role needs to reach them to run these functions.
grant usage on schema private to service_role;

create or replace function public.import_scout_advancement(p_file_name text, p_rows jsonb)
returns public.advancement_imports
language plpgsql security invoker set search_path = '' as $$
declare
    v_import  public.advancement_imports;
    v_changes jsonb;
begin
    -- Pack admins, or the weekly Scoutbook job (the server's secret key, no person signed in).
    if not (private.is_admin() or coalesce(auth.role(), '') = 'service_role') then
        raise exception 'Only pack admins can import advancement' using errcode = '42501';
    end if;

    -- What this file changes, compared with what the app has for the same scouts: records that
    -- are new, records whose dates or approved / awarded status changed, and records no longer in
    -- Scoutbook. Same key as the table (scout, type, name, version); a repeated key counts once.
    with incoming as (
        select distinct on (s.id, x.source_type, x.source_name, coalesce(x.version, ''))
               s.id as scout_id, x.kind, x.rank, x.adventure, x.item, coalesce(x.version, '') as version,
               x.completed_on, coalesce(x.approved, false) as approved, coalesce(x.awarded, false) as awarded,
               x.awarded_on, x.source_type, x.source_name
          from jsonb_to_recordset(p_rows) as x(member_id text, kind text, rank public.den_rank,
                   adventure text, item text, version text, completed_on date, approved boolean,
                   awarded boolean, awarded_on date, source_type text, source_name text)
          join public.scouts s on s.bsa_member_id = x.member_id
    ), old as (
        select sa.* from public.scout_advancement sa
         where sa.scout_id in (select scout_id from incoming)
    ), cmp as (
        select i.kind, o.scout_id is null as is_new,
               o.scout_id is not null
                 and (i.kind, i.rank, i.adventure, i.item, i.completed_on, i.approved, i.awarded, i.awarded_on)
                     is distinct from
                     (o.kind, o.rank, o.adventure, o.item, o.completed_on, o.approved, o.awarded, o.awarded_on) as is_changed
          from incoming i
          left join old o on o.scout_id = i.scout_id and o.source_type = i.source_type
                         and o.source_name = i.source_name and o.version = i.version
    )
    select jsonb_build_object(
               'new', (select count(*) from cmp where is_new),
               'changed', (select count(*) from cmp where is_changed),
               'removed', (select count(*) from old o
                            where not exists (select 1 from incoming i
                                               where i.scout_id = o.scout_id and i.source_type = o.source_type
                                                 and i.source_name = o.source_name and i.version = o.version)),
               'new_by_kind', coalesce((select jsonb_object_agg(kind, n)
                                          from (select kind, count(*) as n from cmp where is_new group by kind) k), '{}'::jsonb))
      into v_changes;

    with x as (
        select x.member_id, x.name, s.id as scout_id
          from jsonb_to_recordset(p_rows) as x(member_id text, name text)
          left join public.scouts s on s.bsa_member_id = x.member_id
    )
    insert into public.advancement_imports (imported_by, file_name, row_count, scout_count, unmatched, changes)
    select private.current_adult_id(), p_file_name,
           count(scout_id),
           count(distinct scout_id),
           coalesce((select jsonb_agg(jsonb_build_object('member_id', u.member_id, 'name', u.name)
                                      order by u.name)
                       from (select distinct member_id, name from x where scout_id is null) u),
                    '[]'::jsonb),
           v_changes
      from x
    returning * into v_import;

    with r as (
        select * from jsonb_to_recordset(p_rows) as x(member_id text, name text)
    ), matched as (
        select distinct s.id from r join public.scouts s on s.bsa_member_id = r.member_id
    )
    delete from public.scout_advancement sa using matched m where sa.scout_id = m.id;

    insert into public.scout_advancement
        (scout_id, kind, rank, adventure, item, version, completed_on, approved, awarded,
         awarded_on, source_type, source_name, import_id)
    select s.id, x.kind, x.rank, x.adventure, x.item, coalesce(x.version, ''), x.completed_on,
           coalesce(x.approved, false), coalesce(x.awarded, false), x.awarded_on,
           x.source_type, x.source_name, v_import.id
      from jsonb_to_recordset(p_rows) as x(member_id text, kind text, rank public.den_rank,
               adventure text, item text, version text, completed_on date, approved boolean,
               awarded boolean, awarded_on date, source_type text, source_name text)
      join public.scouts s on s.bsa_member_id = x.member_id
    on conflict (scout_id, source_type, source_name, version) do nothing;

    -- Approved in the app and now in Scoutbook: mark recorded.
    update public.advancement_submissions sub
       set status = 'recorded'
     where sub.status = 'approved'
       and exists (
           select 1 from public.scout_advancement sa
            where sa.scout_id = sub.scout_id
              and sa.version = '2024'
              and (sub.rank is null or sa.rank = sub.rank)
              and lower(sa.adventure) = lower(sub.adventure)
              and (sa.kind = 'adventure'
                   or (sa.kind = 'requirement'
                       -- "2" also matches Scoutbook's sub-parts "2a", "2b"
                       and (sa.item = sub.requirement
                            or substring(sa.item from '^[0-9]+') = sub.requirement))));

    return v_import;
end;
$$;
revoke execute on function public.import_scout_advancement(text, jsonb) from public, anon;
grant execute on function public.import_scout_advancement(text, jsonb) to authenticated, service_role;

create or replace function public.import_trainings(p_rows jsonb, p_member_ids jsonb default '[]')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_trainings int;
    v_adults    int;
    v_ids       int;
begin
    -- Pack leadership, or the weekly Scoutbook job (the server's secret key, no person signed in).
    if not (private.is_committee() or coalesce(auth.role(), '') = 'service_role') then
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
grant execute on function public.import_trainings(jsonb, jsonb) to authenticated, service_role;
