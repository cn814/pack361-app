-- Advancement by pack position, like the quartermaster (20261024000000_quartermaster.sql).
--
--   private.is_advancement(): admins and the Cubmaster (as before), plus any leader whose pack
--   position mentions advancement (Pack admin → Roster → Position; only admins can set it).
--   They need a leader role and two-step sign-in, like every leader.
--
--   They get the advancement tools for the whole pack, not just one den: import the Scoutbook
--   export, read every scout's Scoutbook records, and see, approve, return and mark entered the
--   reports in the Enter in Scoutbook list. Nothing else changes for them (money, roster, roles,
--   attendance and pack admin stay with the roles that had them).
begin;

create or replace function private.is_advancement()
returns boolean language sql stable security definer set search_path = '' as $$
    select private.is_admin()
        or (private.is_leader()
            and exists (select 1 from public.adults a
                         where a.user_id = auth.uid() and a.is_active
                           and a.position_title ilike '%advancement%'))
$$;
revoke execute on function private.is_advancement() from public, anon;
grant execute on function private.is_advancement() to authenticated, service_role;

alter policy scout_adv_read on public.scout_advancement
    using (((scout_id in (select private.my_scout_ids())) OR ((select private.is_committee()) or (select private.is_advancement()) or scout_id in (select private.reviewable_scout_ids()))));
alter policy scout_adv_import on public.scout_advancement
    with check ((select private.is_advancement()));
alter policy scout_adv_replace on public.scout_advancement
    using ((select private.is_advancement()));
alter policy adv_imports_insert on public.advancement_imports
    with check (((select private.is_advancement()) AND (imported_by = (select private.current_adult_id()))));

alter policy adv_sub_read on public.advancement_submissions
    using (((scout_id in (select private.my_scout_ids())) OR ((select private.is_committee()) or (select private.is_advancement()) or scout_id in (select private.reviewable_scout_ids()))));
alter policy adv_sub_review on public.advancement_submissions
    using (((select private.is_committee()) or (select private.is_advancement()) or scout_id in (select private.reviewable_scout_ids())))
    with check (((select private.is_committee()) or (select private.is_advancement()) or scout_id in (select private.reviewable_scout_ids())));

-- The import itself: same as 20261008000200_weekly_scoutbook_import.sql, with is_advancement()
-- in place of is_admin().
create or replace function public.import_scout_advancement(p_file_name text, p_rows jsonb)
returns public.advancement_imports
language plpgsql security invoker set search_path = '' as $$
declare
    v_import  public.advancement_imports;
    v_changes jsonb;
begin
    -- Admins, the advancement chair (by position), or the weekly Scoutbook job (the server's secret key, no person signed in).
    if not (private.is_advancement() or coalesce(auth.role(), '') = 'service_role') then
        raise exception 'Only admins and the advancement chair can import advancement' using errcode = '42501';
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

commit;
