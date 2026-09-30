-- The pack's one-stop shop, part 1:
--   1. Pack guide: pages of pack info that committee members keep up to date.
--   2. Paperwork: which scouts and adults have a current medical form (Parts A & B), and
--      which families have paid dues. Only "on file" and dates are stored, never anything medical.
--   3. Den messages: announcements for one den's families (push + email).
--   4. Quick polls.

-- Committee members, the Cubmaster and admins (not den leaders or parents).
create or replace function private.is_committee()
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (
        select 1 from public.adults a
         where a.user_id = auth.uid() and a.is_active
           and a.role in ('committee', 'cubmaster', 'admin'))
$$;

-- Is this adult in the signed-in person's family (or the person themselves)?
create or replace function private.adult_in_my_family(p_adult_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (
        select 1 from public.adults me
          join public.adults other on other.id = p_adult_id
         where me.user_id = auth.uid() and me.is_active
           and (other.id = me.id or (me.family_id is not null and other.family_id = me.family_id)))
$$;
grant execute on function private.is_committee(), private.adult_in_my_family(uuid) to authenticated;

-- Stamp who changed a row and when.
create or replace function private.stamp_updated()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    new.updated_at := now();
    new.updated_by := private.current_adult_id();
    return new;
end;
$$;
revoke execute on function private.stamp_updated() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 1. Pack guide
-- -----------------------------------------------------------------------------
create table public.guide_pages (
    id            uuid primary key default gen_random_uuid(),
    slug          text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 60),
    section       text not null default 'Getting started',
    title         text not null check (length(title) between 1 and 120),
    summary       text check (length(summary) <= 300),
    body          text not null default '' check (length(body) <= 30000),
    sort_order    int  not null default 100,
    is_published  boolean not null default false,   -- drafts: leaders only
    updated_at    timestamptz not null default now(),
    updated_by    uuid references public.adults(id) on delete set null
);
create trigger guide_pages_stamp before insert or update on public.guide_pages
    for each row execute function private.stamp_updated();

-- -----------------------------------------------------------------------------
-- 2. Paperwork
-- -----------------------------------------------------------------------------
-- One row per person: the Annual Health and Medical Record, Parts A and B. A family marks
-- "turned in" (submitted); a leader marks it received (on_file). Expires a year after the
-- date on the form.
create table public.health_forms (
    id           uuid primary key default gen_random_uuid(),
    scout_id     uuid references public.scouts(id) on delete cascade,
    adult_id     uuid references public.adults(id) on delete cascade,
    status       text not null check (status in ('submitted', 'on_file')),
    form_date    date,
    expires_on   date,
    updated_at   timestamptz not null default now(),
    updated_by   uuid references public.adults(id) on delete set null,
    check (num_nonnulls(scout_id, adult_id) = 1)
);
create unique index health_forms_scout_key on public.health_forms(scout_id) where scout_id is not null;
create unique index health_forms_adult_key on public.health_forms(adult_id) where adult_id is not null;

create or replace function private.health_form_defaults()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    if new.form_date is not null and new.expires_on is null then
        new.expires_on := new.form_date + interval '1 year' - interval '1 day';
    end if;
    return new;
end;
$$;
revoke execute on function private.health_form_defaults() from public, anon, authenticated;
create trigger health_forms_defaults before insert or update on public.health_forms
    for each row execute function private.health_form_defaults();
create trigger health_forms_stamp before insert or update on public.health_forms
    for each row execute function private.stamp_updated();

-- Dues, one row per family per season ("2026-27"). Families can say "we paid"; a leader
-- confirms.
create table public.dues_payments (
    family_id   uuid not null references public.families(id) on delete cascade,
    season      text not null check (season ~ '^\d{4}-\d{2}$'),
    status      text not null check (status in ('submitted', 'paid')),
    paid_on     date,
    note        text check (length(note) <= 200),
    updated_at  timestamptz not null default now(),
    updated_by  uuid references public.adults(id) on delete set null,
    primary key (family_id, season)
);
create trigger dues_payments_stamp before insert or update on public.dues_payments
    for each row execute function private.stamp_updated();

insert into public.pack_settings (key, value) values
    ('dues_season', '2026-27'),
    ('dues_amount', ''),
    ('dues_how', '')
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- 3. Den messages: announcements with a den are only for that den's families (and leaders).
-- -----------------------------------------------------------------------------
alter table public.announcements add column emailed_count int;

drop policy if exists announcements_read on public.announcements;
create policy announcements_read on public.announcements for select to authenticated
    using (private.is_member()
           and (den_id is null or private.is_leader() or private.family_in_den(den_id)));

drop policy if exists announcements_insert on public.announcements;
create policy announcements_insert on public.announcements for insert to authenticated
    with check (private.is_leader() and author_id = private.current_adult_id()
                and (den_id is null or private.leads_den(den_id)));

create index if not exists announcements_den_idx on public.announcements(den_id, created_at);

-- -----------------------------------------------------------------------------
-- 4. Quick polls
-- -----------------------------------------------------------------------------
create table public.polls (
    id               uuid primary key default gen_random_uuid(),
    question         text not null check (length(question) between 1 and 200),
    details          text check (length(details) <= 1000),
    options          text[] not null check (array_length(options, 1) between 2 and 10),
    allow_multiple   boolean not null default false,
    one_per_family   boolean not null default false,
    den_id           uuid references public.dens(id) on delete cascade,   -- null = whole pack
    results_visible  text not null default 'voters' check (results_visible in ('voters', 'leaders')),
    closes_at        timestamptz,
    closed_at        timestamptz,
    created_by       uuid references public.adults(id) on delete set null,
    created_at       timestamptz not null default now()
);
create index polls_created_idx on public.polls(created_at);

create table public.poll_votes (
    poll_id    uuid not null references public.polls(id) on delete cascade,
    adult_id   uuid not null references public.adults(id) on delete cascade,
    choices    int[] not null,
    voted_at   timestamptz not null default now(),
    primary key (poll_id, adult_id)
);
create index poll_votes_adult_idx on public.poll_votes(adult_id);

create or replace function private.can_see_poll(p_poll_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (
        select 1 from public.polls p
         where p.id = p_poll_id and private.is_member()
           and (p.den_id is null or private.is_leader() or private.family_in_den(p.den_id)))
$$;
grant execute on function private.can_see_poll(uuid) to authenticated;

-- Vote (or change your vote). With one_per_family, your vote replaces your family's.
create or replace function public.cast_vote(p_poll_id uuid, p_choices int[])
returns void language plpgsql security definer set search_path = '' as $$
declare
    p public.polls;
    me uuid := private.current_adult_id();
    fam uuid := private.my_family_id();
    c int;
begin
    if me is null then raise exception 'Not on the pack roster' using errcode = '42501'; end if;
    if not private.can_see_poll(p_poll_id) then raise exception 'Poll not found' using errcode = 'P0002'; end if;
    select * into p from public.polls where id = p_poll_id;
    if p.closed_at is not null or (p.closes_at is not null and p.closes_at < now()) then
        raise exception 'This poll is closed' using errcode = '22023';
    end if;
    if coalesce(array_length(p_choices, 1), 0) = 0
       or (not p.allow_multiple and array_length(p_choices, 1) > 1) then
        raise exception 'Pick one answer' using errcode = '22023';
    end if;
    foreach c in array p_choices loop
        if c < 0 or c >= array_length(p.options, 1) then
            raise exception 'Not an answer on this poll' using errcode = '22023';
        end if;
    end loop;
    if p.one_per_family and fam is not null then
        delete from public.poll_votes v
         using public.adults a
         where v.poll_id = p_poll_id and v.adult_id = a.id and a.family_id = fam and a.id <> me;
    end if;
    insert into public.poll_votes (poll_id, adult_id, choices)
    values (p_poll_id, me, (select array_agg(distinct x order by x) from unnest(p_choices) x))
    on conflict (poll_id, adult_id) do update set choices = excluded.choices, voted_at = now();
end;
$$;
revoke execute on function public.cast_vote(uuid, int[]) from public, anon;
grant execute on function public.cast_vote(uuid, int[]) to authenticated;

-- Vote counts per answer. Leaders always see them; others once they've voted (or the poll
-- is closed), unless the poll keeps results to leaders. Never names.
create or replace function public.poll_results(p_poll_id uuid)
returns table (option_index int, votes bigint, voters bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
    p public.polls;
    fam uuid := private.my_family_id();
    voted boolean;
begin
    if not private.can_see_poll(p_poll_id) then return; end if;
    select * into p from public.polls where id = p_poll_id;
    select exists (
        select 1 from public.poll_votes v join public.adults a on a.id = v.adult_id
         where v.poll_id = p_poll_id
           and (v.adult_id = private.current_adult_id() or (p.one_per_family and a.family_id = fam))) into voted;
    if not (private.is_leader()
            or (p.results_visible = 'voters'
                and (voted or p.closed_at is not null or (p.closes_at is not null and p.closes_at < now())))) then
        return;
    end if;
    return query
        select i - 1, count(v.adult_id) filter (where (i - 1) = any (v.choices)),
               (select count(*) from public.poll_votes w where w.poll_id = p_poll_id)
          from generate_series(1, array_length(p.options, 1)) i
          left join public.poll_votes v on v.poll_id = p_poll_id
         group by i
         order by i;
end;
$$;
revoke execute on function public.poll_results(uuid) from public, anon;
grant execute on function public.poll_results(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Privileges and Row Level Security
-- -----------------------------------------------------------------------------
revoke all on public.guide_pages, public.health_forms, public.dues_payments, public.polls, public.poll_votes
    from anon, authenticated;
grant select, insert, update, delete on public.guide_pages to authenticated;
grant select, insert, update, delete on public.health_forms to authenticated;
grant select, insert, update, delete on public.dues_payments to authenticated;
grant select, insert, update, delete on public.polls to authenticated;
grant select on public.poll_votes to authenticated;   -- votes go through cast_vote()

alter table public.guide_pages   enable row level security;
alter table public.health_forms  enable row level security;
alter table public.dues_payments enable row level security;
alter table public.polls         enable row level security;
alter table public.poll_votes    enable row level security;

create policy guide_read on public.guide_pages for select to authenticated
    using (private.is_member() and (is_published or private.is_leader()));
create policy guide_write on public.guide_pages for all to authenticated
    using (private.is_committee()) with check (private.is_committee());

-- Families see and report their own people; leaders see everyone and mark forms received.
create policy health_read on public.health_forms for select to authenticated
    using (private.is_leader()
           or (scout_id is not null and private.is_my_scout(scout_id))
           or (adult_id is not null and private.adult_in_my_family(adult_id)));
create policy health_family_insert on public.health_forms for insert to authenticated
    with check (status = 'submitted'
                and ((scout_id is not null and private.is_my_scout(scout_id))
                     or (adult_id is not null and private.adult_in_my_family(adult_id))));
create policy health_family_update on public.health_forms for update to authenticated
    using ((scout_id is not null and private.is_my_scout(scout_id))
           or (adult_id is not null and private.adult_in_my_family(adult_id)))
    with check (status = 'submitted'
                and ((scout_id is not null and private.is_my_scout(scout_id))
                     or (adult_id is not null and private.adult_in_my_family(adult_id))));
create policy health_leader_write on public.health_forms for all to authenticated
    using (private.is_leader()) with check (private.is_leader());

create policy dues_read on public.dues_payments for select to authenticated
    using (private.is_leader() or family_id = private.my_family_id());
create policy dues_family_insert on public.dues_payments for insert to authenticated
    with check (status = 'submitted' and family_id = private.my_family_id());
create policy dues_family_update on public.dues_payments for update to authenticated
    using (family_id = private.my_family_id() and status = 'submitted')
    with check (status = 'submitted' and family_id = private.my_family_id());
create policy dues_leader_write on public.dues_payments for all to authenticated
    using (private.is_leader()) with check (private.is_leader());

create policy polls_read on public.polls for select to authenticated
    using (private.can_see_poll(id));
create policy polls_insert on public.polls for insert to authenticated
    with check (private.is_leader() and created_by = private.current_adult_id()
                and (den_id is null or private.leads_den(den_id)));
create policy polls_edit on public.polls for update to authenticated
    using (created_by = private.current_adult_id() or private.is_admin())
    with check (created_by = private.current_adult_id() or private.is_admin());
create policy polls_delete on public.polls for delete to authenticated
    using (created_by = private.current_adult_id() or private.is_admin());

create policy poll_votes_read on public.poll_votes for select to authenticated
    using (adult_id = private.current_adult_id() or private.is_leader());

-- -----------------------------------------------------------------------------
-- 5. Notifications: when each adult last opened the notification list (for the badge).
-- -----------------------------------------------------------------------------
create table public.inbox_reads (
    adult_id  uuid primary key references public.adults(id) on delete cascade,
    seen_at   timestamptz not null default now()
);
revoke all on public.inbox_reads from anon, authenticated;
grant select, insert, update on public.inbox_reads to authenticated;
alter table public.inbox_reads enable row level security;
create policy inbox_reads_own on public.inbox_reads for all to authenticated
    using (adult_id = private.current_adult_id()) with check (adult_id = private.current_adult_id());
