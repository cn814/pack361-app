-- Easy den meetings (2026-10-03)
--   den_meetings.work        every adventure a meeting covered: [{adventure, requirements[], skip{scout: [req]}}].
--                            adventure / requirements stay as a copy of the first item for older readers.
--   advancement_submissions  one row per meeting + scout + adventure + requirement (a double tap can't double it)
--   record_den_meeting()     one Save: attendance + requirements for everyone here, in one transaction
--   den_meeting_rsvps        families say going / not going per scout for a planned den meeting

-- -----------------------------------------------------------------------------
-- 1. Several adventures per meeting
-- -----------------------------------------------------------------------------
alter table public.den_meetings
    add column work jsonb not null default '[]'::jsonb check (jsonb_typeof(work) = 'array');

update public.den_meetings
   set work = jsonb_build_array(jsonb_build_object('adventure', adventure, 'requirements', to_jsonb(requirements)))
 where adventure is not null;

-- Keep adventure / requirements and work in step, whichever one a writer sets.
create or replace function private.sync_meeting_work()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    if tg_op = 'INSERT' then
        if new.work = '[]'::jsonb and new.adventure is not null then
            new.work := jsonb_build_array(jsonb_build_object('adventure', new.adventure, 'requirements', to_jsonb(new.requirements)));
        end if;
    elsif new.work is not distinct from old.work
          and (new.adventure is distinct from old.adventure or new.requirements is distinct from old.requirements) then
        new.work := case when new.adventure is null then '[]'::jsonb
                         else jsonb_build_array(jsonb_build_object('adventure', new.adventure, 'requirements', to_jsonb(new.requirements))) end;
    end if;
    new.adventure := nullif(new.work -> 0 ->> 'adventure', '');
    new.requirements := coalesce(
        (select array_agg(r order by length(r), r) from jsonb_array_elements_text(coalesce(new.work -> 0 -> 'requirements', '[]'::jsonb)) r), '{}');
    return new;
end;
$$;
revoke execute on function private.sync_meeting_work() from public, anon, authenticated;

create trigger den_meetings_sync_work
    before insert or update on public.den_meetings
    for each row execute function private.sync_meeting_work();

-- -----------------------------------------------------------------------------
-- 2. Never the same requirement twice from one meeting
-- -----------------------------------------------------------------------------
-- Older reports could (rarely) repeat a row after a "returned" one; keep the first, unlink the rest.
update public.advancement_submissions s
   set meeting_id = null
 where s.meeting_id is not null and s.status <> 'returned'
   and exists (select 1 from public.advancement_submissions o
                where o.meeting_id = s.meeting_id and o.scout_id = s.scout_id and o.adventure = s.adventure
                  and o.requirement = s.requirement and o.status <> 'returned'
                  and (o.created_at, o.id) < (s.created_at, s.id));
create unique index advancement_submissions_meeting_key
    on public.advancement_submissions(meeting_id, scout_id, adventure, requirement)
    where meeting_id is not null and status <> 'returned';
create index if not exists advancement_submissions_meeting_idx on public.advancement_submissions(meeting_id);

-- -----------------------------------------------------------------------------
-- 3. Record a den meeting in one step
-- -----------------------------------------------------------------------------
-- p_work: [{"adventure": "Bear Claws", "requirements": ["1","2"], "skip": {"<scout id>": ["2"]}}]
-- Uses the meeting given, else the den's meeting on that day, else makes one. Then:
--   attendance  = p_present (scouts in this den)
--   requirements: approved Scoutbook-list rows for each scout here, minus skips, minus anything
--                 Scoutbook or the app already has. Rows this meeting made earlier that are no longer
--                 wanted are removed unless the advancement chair already entered them in Scoutbook.
-- Running it twice with the same answers changes nothing.
create or replace function public.record_den_meeting(
    p_den_id uuid, p_meeting_id uuid, p_meets_on date, p_present uuid[], p_work jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    me        uuid := private.current_adult_id();
    today     date := (now() at time zone 'America/New_York')::date;
    d         public.dens;
    m         public.den_meetings;
    v_work    jsonb := '[]'::jsonb;
    item      jsonb;
    adv       public.adventures;
    reqs      text[];
    v_present uuid[];
    n_added   int := 0;
    n_removed int := 0;
    n_done    int := 0;
    entered   jsonb;
begin
    if me is null or p_den_id is null or not private.leads_den(p_den_id) then
        raise exception 'Only this den''s leaders can record its meetings' using errcode = '42501';
    end if;
    select * into d from public.dens where id = p_den_id;
    if not found then raise exception 'Den not found' using errcode = 'P0002'; end if;
    if p_meets_on is null then raise exception 'Pick the meeting day' using errcode = '22023'; end if;
    if p_meets_on > today then raise exception 'You can save a meeting on the day or after' using errcode = '22023'; end if;

    -- One save at a time per den and day, so a double tap can't make two meetings.
    perform pg_advisory_xact_lock(hashtextextended('den_meeting:' || p_den_id::text || ':' || p_meets_on::text, 0));

    if p_meeting_id is not null then
        select * into m from public.den_meetings where id = p_meeting_id and den_id = p_den_id for update;
        if not found then raise exception 'Meeting not found' using errcode = 'P0002'; end if;
    else
        select * into m from public.den_meetings where den_id = p_den_id and meets_on = p_meets_on
         order by created_at, id limit 1 for update;
    end if;

    -- Clean the work list: real adventures for this den's rank, requirement numbers in range.
    for item in select * from jsonb_array_elements(case when jsonb_typeof(p_work) = 'array' then p_work else '[]'::jsonb end) loop
        select * into adv from public.adventures a where a.rank = d.rank and a.name = item ->> 'adventure';
        if not found then raise exception 'Unknown adventure: %', item ->> 'adventure' using errcode = '22023'; end if;
        if v_work @> jsonb_build_array(jsonb_build_object('adventure', adv.name)) then continue; end if;
        select coalesce(array_agg(distinct r order by r), '{}') into reqs
          from jsonb_array_elements_text(coalesce(item -> 'requirements', '[]'::jsonb)) r
         where r ~ '^\d{1,2}$' and r::int between 1 and adv.req_count;
        if cardinality(reqs) = 0 then continue; end if;
        v_work := v_work || jsonb_build_array(jsonb_build_object(
            'adventure', adv.name,
            'requirements', (select jsonb_agg(r order by r::int) from unnest(reqs) r),
            'skip', coalesce((select jsonb_object_agg(k, v) from jsonb_each(coalesce(item -> 'skip', '{}'::jsonb)) s(k, v)
                               where jsonb_typeof(v) = 'array' and jsonb_array_length(v) > 0
                                 and k ~ '^[0-9a-f-]{36}$'), '{}'::jsonb)));
    end loop;

    if m.id is null then
        insert into public.den_meetings (den_id, meets_on, title, rank, work, created_by)
        values (p_den_id, p_meets_on, coalesce(v_work -> 0 ->> 'adventure', 'Den meeting'), d.rank, v_work, me)
        returning * into m;
    else
        update public.den_meetings set meets_on = p_meets_on, rank = coalesce(rank, d.rank), work = v_work
         where id = m.id returning * into m;
    end if;

    -- Who was here: active scouts of this den (or already on this meeting's list).
    select coalesce(array_agg(s.id), '{}') into v_present
      from public.scouts s
     where s.id = any(coalesce(p_present, '{}'))
       and ((s.den_id = p_den_id and s.is_active)
            or exists (select 1 from public.den_meeting_attendance x where x.meeting_id = m.id and x.scout_id = s.id));
    delete from public.den_meeting_attendance where meeting_id = m.id and not (scout_id = any(v_present));
    insert into public.den_meeting_attendance (meeting_id, scout_id)
    select m.id, unnest(v_present) on conflict do nothing;

    -- What this meeting should have on the Scoutbook list.
    create temporary table if not exists pg_temp.want (scout_id uuid, adventure text, requirement text) on commit drop;
    truncate pg_temp.want;
    insert into pg_temp.want
    select distinct p.scout_id, w ->> 'adventure', r
      from unnest(v_present) p(scout_id)
     cross join jsonb_array_elements(v_work) w
     cross join jsonb_array_elements_text(w -> 'requirements') r
     where not coalesce((w -> 'skip' -> p.scout_id::text) ? r, false);

    -- Already entered in Scoutbook but no longer wanted: can't undo here.
    select coalesce(jsonb_agg(jsonb_build_object(
               'scout', sc.first_name || ' ' || left(sc.last_name, 1) || '.', 'adventure', s.adventure, 'requirement', s.requirement)
               order by sc.first_name, s.adventure, s.requirement), '[]'::jsonb)
      into entered
      from public.advancement_submissions s
      join public.scouts sc on sc.id = s.scout_id
     where s.meeting_id = m.id and s.status = 'recorded'
       and not exists (select 1 from pg_temp.want w
                        where w.scout_id = s.scout_id and w.adventure = s.adventure and w.requirement = s.requirement);

    delete from public.advancement_submissions s
     where s.meeting_id = m.id and s.status in ('submitted', 'approved')
       and not exists (select 1 from pg_temp.want w
                        where w.scout_id = s.scout_id and w.adventure = s.adventure and w.requirement = s.requirement);
    get diagnostics n_removed = row_count;

    update public.advancement_submissions s set completed_on = m.meets_on
     where s.meeting_id = m.id and s.status in ('submitted', 'approved') and s.completed_on <> m.meets_on;

    -- Skip what Scoutbook already shows, or what's already on the list from anywhere.
    select count(*) into n_done from pg_temp.want w
     where exists (select 1 from public.scout_advancement r
                    where r.scout_id = w.scout_id and lower(r.adventure) = lower(w.adventure)
                      and (r.kind = 'adventure'
                           or (r.kind = 'requirement' and (r.item = w.requirement or substring(r.item from '^\d+') = w.requirement))))
        or exists (select 1 from public.advancement_submissions s
                    where s.scout_id = w.scout_id and s.adventure = w.adventure and s.requirement = w.requirement
                      and s.status <> 'returned' and s.meeting_id is distinct from m.id);

    insert into public.advancement_submissions
        (scout_id, submitted_by, rank, adventure, requirement, completed_on, notes, status, meeting_id)
    select w.scout_id, me, d.rank, w.adventure, w.requirement, m.meets_on, 'Den meeting: ' || m.title, 'approved', m.id
      from pg_temp.want w
     where not exists (select 1 from public.scout_advancement r
                        where r.scout_id = w.scout_id and lower(r.adventure) = lower(w.adventure)
                          and (r.kind = 'adventure'
                               or (r.kind = 'requirement' and (r.item = w.requirement or substring(r.item from '^\d+') = w.requirement))))
       and not exists (select 1 from public.advancement_submissions s
                        where s.scout_id = w.scout_id and s.adventure = w.adventure and s.requirement = w.requirement
                          and s.status <> 'returned')
    on conflict do nothing;
    get diagnostics n_added = row_count;

    update public.den_meetings set recorded_at = now(), recorded_by = me where id = m.id;

    return jsonb_build_object(
        'meeting_id', m.id,
        'meets_on', m.meets_on,
        'present', cardinality(v_present),
        'requirements', (select count(*) from jsonb_array_elements(v_work) w, jsonb_array_elements(w -> 'requirements')),
        'on_list', (select count(*) from public.advancement_submissions s where s.meeting_id = m.id and s.status <> 'returned'),
        'added', n_added,
        'removed', n_removed,
        'already_done', n_done,
        'entered', entered);
end;
$$;
revoke execute on function public.record_den_meeting(uuid, uuid, date, uuid[], jsonb) from public, anon;
grant execute on function public.record_den_meeting(uuid, uuid, date, uuid[], jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. RSVP for den meetings planned in the app (per scout: going or not)
-- -----------------------------------------------------------------------------
create table public.den_meeting_rsvps (
    meeting_id  uuid not null references public.den_meetings(id) on delete cascade,
    scout_id    uuid not null references public.scouts(id) on delete cascade,
    going       boolean not null,
    set_by      uuid references public.adults(id) on delete set null,
    updated_at  timestamptz not null default now(),
    primary key (meeting_id, scout_id)
);
create index den_meeting_rsvps_scout_idx on public.den_meeting_rsvps(scout_id);

-- A family answers for their own scout in that den, up to the meeting day.
create or replace function public.set_den_meeting_rsvp(p_meeting_id uuid, p_scout_id uuid, p_going boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
    m public.den_meetings;
begin
    if private.current_adult_id() is null then raise exception 'Not on the pack roster' using errcode = '42501'; end if;
    if p_going is null then raise exception 'Pick going or not going' using errcode = '22023'; end if;
    if not private.is_my_scout(p_scout_id) then raise exception 'You can answer only for your own scouts' using errcode = '42501'; end if;
    select * into m from public.den_meetings where id = p_meeting_id;
    if not found or not exists (select 1 from public.scouts s where s.id = p_scout_id and s.den_id = m.den_id and s.is_active) then
        raise exception 'Meeting not found' using errcode = 'P0002';
    end if;
    if m.meets_on < (now() at time zone 'America/New_York')::date then
        raise exception 'This meeting already happened' using errcode = '22023';
    end if;
    insert into public.den_meeting_rsvps (meeting_id, scout_id, going, set_by)
    values (p_meeting_id, p_scout_id, p_going, private.current_adult_id())
    on conflict (meeting_id, scout_id)
    do update set going = excluded.going, set_by = excluded.set_by, updated_at = now();
end;
$$;
revoke execute on function public.set_den_meeting_rsvp(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_den_meeting_rsvp(uuid, uuid, boolean) to authenticated;

revoke all on public.den_meeting_rsvps from anon, authenticated;
grant select on public.den_meeting_rsvps to authenticated;   -- answers go through set_den_meeting_rsvp()
alter table public.den_meeting_rsvps enable row level security;
-- A family sees their own scouts' answers; the den's leaders see the whole den.
create policy den_rsvps_read on public.den_meeting_rsvps for select to authenticated
    using (private.is_my_scout(scout_id) or private.leads_den(private.meeting_den(meeting_id)));
