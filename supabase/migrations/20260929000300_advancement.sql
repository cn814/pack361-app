-- Advancement: adventure catalog, Scoutbook import, and the report -> approve -> record flow.
--
--   adventures           2024 Cub Scout program: required + elective adventures per rank.
--   scout_advancement    Snapshot of Scoutbook Plus "Quick Export -> Advancements" (redesigned;
--                        the first version was never loaded). Scoutbook stays the official record;
--                        an admin re-imports the CSV and each scout's rows are replaced.
--   advancement_imports  Who imported what, and which Scoutbook member IDs didn't match the roster.
--   advancement_submissions gains rank + "recorded" stamps; approved submissions that show up in
--                        an import are marked recorded automatically.
--
-- Access: families see their own scouts; den leaders their den; committee / cubmaster / admin
-- everyone (private.can_review_scout). Only admins import.

-- -----------------------------------------------------------------------------
-- 1. Adventure catalog
-- -----------------------------------------------------------------------------
create table public.adventures (
    rank        public.den_rank not null,
    name        text not null,
    required    boolean not null,
    req_count   int  not null check (req_count > 0),
    special     boolean not null default false,  -- Archery / BB Gun / Slingshot: council events only
    sort_order  int  not null,
    primary key (rank, name)
);

-- -----------------------------------------------------------------------------
-- 2. Scoutbook snapshot (replaces the unused first version)
-- -----------------------------------------------------------------------------
drop table public.scout_advancement;

create table public.advancement_imports (
    id              uuid primary key default gen_random_uuid(),
    imported_by     uuid references public.adults(id) on delete set null,
    imported_at     timestamptz not null default now(),
    file_name       text,
    row_count       int not null default 0,     -- rows saved
    scout_count     int not null default 0,     -- roster scouts updated
    unmatched       jsonb not null default '[]' -- [{member_id, name}] in Scoutbook but not on the roster
);

create table public.scout_advancement (
    id              uuid primary key default gen_random_uuid(),
    scout_id        uuid not null references public.scouts(id) on delete cascade,
    kind            text not null check (kind in ('rank', 'adventure', 'requirement', 'award')),
    rank            public.den_rank,   -- rank it counts toward, when known
    adventure       text,              -- catalog adventure name (adventures + their requirements)
    item            text not null,     -- rank / adventure / award name, or requirement number
    version         text not null default '',
    completed_on    date,
    approved        boolean not null default false,  -- leader approved in Scoutbook
    awarded         boolean not null default false,  -- patch / pin handed out
    awarded_on      date,
    source_type     text not null,     -- Scoutbook "Advancement Type", as exported
    source_name     text not null,     -- Scoutbook "Advancement", as exported
    import_id       uuid references public.advancement_imports(id) on delete set null,
    imported_at     timestamptz not null default now(),
    unique (scout_id, source_type, source_name, version)
);
create index scout_advancement_scout_idx on public.scout_advancement(scout_id);

-- -----------------------------------------------------------------------------
-- 3. Submissions: which rank, and who recorded it in Scoutbook
-- -----------------------------------------------------------------------------
alter table public.advancement_submissions
    add column rank        public.den_rank,
    add column recorded_by uuid references public.adults(id),
    add column recorded_at timestamptz;

-- "recorded" keeps the den leader's approval stamp; the recorder gets their own columns.
create or replace function private.stamp_review()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    if new.status is distinct from old.status then
        if new.status::text in ('submitted', 'pending_review') then
            new.reviewed_by := null;
            new.reviewed_at := null;
        elsif new.status::text <> 'recorded' then
            new.reviewed_by := private.current_adult_id();
            new.reviewed_at := now();
        end if;
    end if;
    return new;
end;
$$;

create or replace function private.stamp_recorded()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    if new.status = 'recorded' then
        if old.status is distinct from 'recorded' then
            new.recorded_by := private.current_adult_id();
            new.recorded_at := now();
        else
            new.recorded_by := old.recorded_by;
            new.recorded_at := old.recorded_at;
        end if;
    else
        new.recorded_by := null;
        new.recorded_at := null;
    end if;
    return new;
end;
$$;
revoke execute on function private.stamp_recorded() from public, anon, authenticated;

create trigger advancement_stamp_recorded
    before update on public.advancement_submissions
    for each row execute function private.stamp_recorded();

-- Reviewer / recorder columns are stamped by triggers only.
revoke update on public.advancement_submissions from authenticated;
grant update (rank, adventure, requirement, completed_on, notes, evidence_path, status, review_note)
    on public.advancement_submissions to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Privileges and Row Level Security
-- -----------------------------------------------------------------------------
revoke all on public.adventures, public.scout_advancement, public.advancement_imports from anon;
revoke all on public.adventures, public.scout_advancement, public.advancement_imports from authenticated;
grant select on public.adventures, public.scout_advancement, public.advancement_imports to authenticated;
grant insert, update, delete on public.adventures to authenticated;
grant insert, delete on public.scout_advancement to authenticated;
grant insert on public.advancement_imports to authenticated;

alter table public.adventures          enable row level security;
alter table public.scout_advancement   enable row level security;
alter table public.advancement_imports enable row level security;

create policy adventures_read on public.adventures for select to authenticated
    using (private.is_member());
create policy adventures_write on public.adventures for all to authenticated
    using (private.is_admin()) with check (private.is_admin());

create policy scout_adv_read on public.scout_advancement for select to authenticated
    using (private.is_my_scout(scout_id) or private.can_review_scout(scout_id));
create policy scout_adv_import on public.scout_advancement for insert to authenticated
    with check (private.is_admin());
create policy scout_adv_replace on public.scout_advancement for delete to authenticated
    using (private.is_admin());

create policy adv_imports_read on public.advancement_imports for select to authenticated
    using (private.is_leader());
create policy adv_imports_insert on public.advancement_imports for insert to authenticated
    with check (private.is_admin() and imported_by = private.current_adult_id());

-- -----------------------------------------------------------------------------
-- 5. Import (SECURITY INVOKER: runs as the signed-in admin, so the policies above apply)
--    p_rows: parsed CSV rows from the app, one object per Scoutbook line:
--    {member_id, name, kind, rank, adventure, item, version, completed_on,
--     approved, awarded, awarded_on, source_type, source_name}
-- -----------------------------------------------------------------------------
create or replace function public.import_scout_advancement(p_file_name text, p_rows jsonb)
returns public.advancement_imports
language plpgsql security invoker set search_path = '' as $$
declare
    v_import public.advancement_imports;
begin
    if not private.is_admin() then
        raise exception 'Only pack admins can import advancement' using errcode = '42501';
    end if;

    with x as (
        select x.member_id, x.name, s.id as scout_id
          from jsonb_to_recordset(p_rows) as x(member_id text, name text)
          left join public.scouts s on s.bsa_member_id = x.member_id
    )
    insert into public.advancement_imports (imported_by, file_name, row_count, scout_count, unmatched)
    select private.current_adult_id(), p_file_name,
           count(scout_id),
           count(distinct scout_id),
           coalesce((select jsonb_agg(jsonb_build_object('member_id', u.member_id, 'name', u.name)
                                      order by u.name)
                       from (select distinct member_id, name from x where scout_id is null) u),
                    '[]'::jsonb)
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

-- -----------------------------------------------------------------------------
-- 6. Catalog: 2024 Cub Scout adventures (scouting.org rank pages; every rank needs all
--    6 required adventures + 2 electives). Admins can correct counts in the table editor.
-- -----------------------------------------------------------------------------
insert into public.adventures (rank, name, required, req_count, special, sort_order) values
    ('lion', 'Bobcat', true, 4, false, 1),
    ('lion', 'Mountain Lion', true, 4, false, 2),
    ('lion', 'Fun on the Run', true, 4, false, 3),
    ('lion', 'King of the Jungle', true, 4, false, 4),
    ('lion', 'Lion''s Roar', true, 4, false, 5),
    ('lion', 'Lion''s Pride', true, 3, false, 6),
    ('lion', 'Build It Up, Knock It Down', false, 3, false, 7),
    ('lion', 'Champions for Nature', false, 4, false, 8),
    ('lion', 'Count on Me', false, 3, false, 9),
    ('lion', 'Everyday Tech', false, 3, false, 10),
    ('lion', 'Gizmos and Gadgets', false, 3, false, 11),
    ('lion', 'Go Fish', false, 3, false, 12),
    ('lion', 'I''ll Do It Myself', false, 3, false, 13),
    ('lion', 'Let''s Camp', false, 4, false, 14),
    ('lion', 'On a Roll', false, 3, false, 15),
    ('lion', 'On Your Mark', false, 3, false, 16),
    ('lion', 'Pick My Path', false, 3, false, 17),
    ('lion', 'Race Time', false, 4, false, 18),
    ('lion', 'Ready, Set, Grow', false, 3, false, 19),
    ('lion', 'Time to Swim', false, 5, false, 20),
    ('lion', 'Archery', false, 8, true, 21),
    ('lion', 'Slingshot', false, 7, true, 22),
    ('tiger', 'Bobcat', true, 6, false, 1),
    ('tiger', 'Tigers in the Wild', true, 5, false, 2),
    ('tiger', 'Tiger Bites', true, 4, false, 3),
    ('tiger', 'Team Tiger', true, 4, false, 4),
    ('tiger', 'Tiger''s Roar', true, 4, false, 5),
    ('tiger', 'Tiger Circles', true, 3, false, 6),
    ('tiger', 'Champions for Nature', false, 4, false, 7),
    ('tiger', 'Curiosity, Intrigue, and Magical Mysteries', false, 4, false, 8),
    ('tiger', 'Designed by Tiger', false, 5, false, 9),
    ('tiger', 'Fish On', false, 4, false, 10),
    ('tiger', 'Floats and Boats', false, 4, false, 11),
    ('tiger', 'Good Knights', false, 4, false, 12),
    ('tiger', 'Let''s Camp', false, 5, false, 13),
    ('tiger', 'Race Time', false, 4, false, 14),
    ('tiger', 'Rolling Tigers', false, 5, false, 15),
    ('tiger', 'Safe and Smart', false, 7, false, 16),
    ('tiger', 'Sky Is the Limit', false, 4, false, 17),
    ('tiger', 'Stories in Shapes', false, 4, false, 18),
    ('tiger', 'Summertime Fun', false, 1, false, 19),
    ('tiger', 'Tech All Around', false, 4, false, 20),
    ('tiger', 'Tiger Tag', false, 4, false, 21),
    ('tiger', 'Tiger-iffic!', false, 4, false, 22),
    ('tiger', 'Tigers in the Water', false, 6, false, 23),
    ('tiger', 'Archery', false, 8, true, 24),
    ('tiger', 'BB Gun', false, 8, true, 25),
    ('tiger', 'Slingshot', false, 7, true, 26),
    ('wolf', 'Bobcat', true, 7, false, 1),
    ('wolf', 'Paws on the Path', true, 5, false, 2),
    ('wolf', 'Running with the Pack', true, 6, false, 3),
    ('wolf', 'Council Fire', true, 6, false, 4),
    ('wolf', 'Safety in Numbers', true, 4, false, 5),
    ('wolf', 'Footsteps', true, 4, false, 6),
    ('wolf', 'A Wolf Goes Fishing', false, 5, false, 7),
    ('wolf', 'Adventures in Coins', false, 4, false, 8),
    ('wolf', 'Air of the Wolf', false, 4, false, 9),
    ('wolf', 'Champions for Nature', false, 4, false, 10),
    ('wolf', 'Code of the Wolf', false, 4, false, 11),
    ('wolf', 'Computing Wolves', false, 4, false, 12),
    ('wolf', 'Cubs Who Care', false, 4, false, 13),
    ('wolf', 'Digging in the Past', false, 4, false, 14),
    ('wolf', 'Finding Your Way', false, 5, false, 15),
    ('wolf', 'Germs Alive!', false, 5, false, 16),
    ('wolf', 'Let''s Camp', false, 5, false, 17),
    ('wolf', 'Paws for Water', false, 6, false, 18),
    ('wolf', 'Paws of Skill', false, 3, false, 19),
    ('wolf', 'Pedal With the Pack', false, 6, false, 20),
    ('wolf', 'Race Time', false, 5, false, 21),
    ('wolf', 'Spirit of the Water', false, 4, false, 22),
    ('wolf', 'Summertime Fun', false, 1, false, 23),
    ('wolf', 'Archery', false, 8, true, 24),
    ('wolf', 'BB Gun', false, 8, true, 25),
    ('wolf', 'Slingshot', false, 7, true, 26),
    ('bear', 'Bobcat', true, 8, false, 1),
    ('bear', 'Bear Habitat', true, 9, false, 2),
    ('bear', 'Bear Strong', true, 5, false, 3),
    ('bear', 'Paws for Action', true, 4, false, 4),
    ('bear', 'Standing Tall', true, 4, false, 5),
    ('bear', 'Fellowship', true, 4, false, 6),
    ('bear', 'A Bear Goes Fishing', false, 6, false, 7),
    ('bear', 'Balancing Bears', false, 4, false, 8),
    ('bear', 'Baloo the Builder', false, 5, false, 9),
    ('bear', 'Bears Afloat', false, 7, false, 10),
    ('bear', 'Bears on Bikes', false, 7, false, 11),
    ('bear', 'Champions for Nature', false, 5, false, 12),
    ('bear', 'Chef Tech', false, 5, false, 13),
    ('bear', 'Critter Care', false, 4, false, 14),
    ('bear', 'Forensics', false, 6, false, 15),
    ('bear', 'Let''s Camp', false, 5, false, 16),
    ('bear', 'Marble Madness', false, 5, false, 17),
    ('bear', 'Race Time', false, 5, false, 18),
    ('bear', 'Roaring Laughter', false, 5, false, 19),
    ('bear', 'Salmon Run', false, 6, false, 20),
    ('bear', 'Summertime Fun', false, 1, false, 21),
    ('bear', 'Super Science', false, 4, false, 22),
    ('bear', 'Whittling', false, 4, false, 23),
    ('bear', 'Archery', false, 8, true, 24),
    ('bear', 'BB Gun', false, 8, true, 25),
    ('bear', 'Slingshot', false, 8, true, 26),
    ('webelos', 'Bobcat', true, 7, false, 1),
    ('webelos', 'Webelos Walkabout', true, 7, false, 2),
    ('webelos', 'Stronger, Faster, Higher', true, 5, false, 3),
    ('webelos', 'My Community', true, 4, false, 4),
    ('webelos', 'My Safety', true, 4, false, 5),
    ('webelos', 'My Family', true, 4, false, 6),
    ('webelos', 'Aquanaut', false, 6, false, 7),
    ('webelos', 'Art Explosion', false, 4, false, 8),
    ('webelos', 'Aware and Care', false, 4, false, 9),
    ('webelos', 'Build It', false, 4, false, 10),
    ('webelos', 'Catch the Big One', false, 7, false, 11),
    ('webelos', 'Champions for Nature', false, 6, false, 12),
    ('webelos', 'Chef''s Knife', false, 4, false, 13),
    ('webelos', 'Earth Rocks!', false, 4, false, 14),
    ('webelos', 'Let''s Camp', false, 9, false, 15),
    ('webelos', 'Math on the Trail', false, 3, false, 16),
    ('webelos', 'Modular Design', false, 6, false, 17),
    ('webelos', 'Paddle Onward', false, 9, false, 18),
    ('webelos', 'Pedal Away', false, 6, false, 19),
    ('webelos', 'Race Time', false, 5, false, 20),
    ('webelos', 'Summertime Fun', false, 1, false, 21),
    ('webelos', 'Tech on the Trail', false, 4, false, 22),
    ('webelos', 'Yo-Yo', false, 7, false, 23),
    ('webelos', 'Archery', false, 8, true, 24),
    ('webelos', 'BB Gun', false, 8, true, 25),
    ('webelos', 'Slingshot', false, 8, true, 26),
    ('aol', 'Bobcat', true, 8, false, 1),
    ('aol', 'Outdoor Adventurer', true, 8, false, 2),
    ('aol', 'Personal Fitness', true, 4, false, 3),
    ('aol', 'Citizenship', true, 2, false, 4),
    ('aol', 'First Aid', true, 7, false, 5),
    ('aol', 'Duty to God', true, 3, false, 6),
    ('aol', 'Champions for Nature', false, 6, false, 7),
    ('aol', 'Cycling', false, 7, false, 8),
    ('aol', 'Engineer', false, 5, false, 9),
    ('aol', 'Estimations', false, 4, false, 10),
    ('aol', 'Fishing', false, 7, false, 11),
    ('aol', 'High Tech Outdoors', false, 4, false, 12),
    ('aol', 'Into the Wild', false, 5, false, 13),
    ('aol', 'Into the Woods', false, 5, false, 14),
    ('aol', 'Knife Safety', false, 5, false, 15),
    ('aol', 'Paddle Craft', false, 9, false, 16),
    ('aol', 'Race Time', false, 5, false, 17),
    ('aol', 'Summertime Fun', false, 1, false, 18),
    ('aol', 'Swimming', false, 4, false, 19),
    ('aol', 'Archery', false, 8, true, 20),
    ('aol', 'BB Gun', false, 8, true, 21),
    ('aol', 'Slingshot', false, 8, true, 22);
