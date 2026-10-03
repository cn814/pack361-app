-- Advancement import: say what changed. Each import now records how many records are new, how
-- many changed (dates, approved or awarded), and how many are no longer in Scoutbook, compared
-- with what the app had for the same scouts. Shown after an import and on the import page.

alter table public.advancement_imports
    add column if not exists changes jsonb;  -- {new, changed, removed, new_by_kind: {rank: n, ...}}

create or replace function public.import_scout_advancement(p_file_name text, p_rows jsonb)
returns public.advancement_imports
language plpgsql security invoker set search_path = '' as $$
declare
    v_import  public.advancement_imports;
    v_changes jsonb;
begin
    if not private.is_admin() then
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
grant execute on function public.import_scout_advancement(text, jsonb) to authenticated;
