-- Awards still owed: on the awards night sheet a leader taps "Not here" for a scout who missed
-- the ceremony. Their awards are kept here until a leader taps "Given", even after they're marked
-- awarded in Scoutbook (which takes them off the awards lists at the next import).
-- Kept by label (the award's name as the sheets print it), because each Scoutbook import
-- replaces a scout's advancement rows.

begin;

create table if not exists public.awards_owed (
    id            uuid primary key default gen_random_uuid(),
    scout_id      uuid not null references public.scouts(id) on delete cascade,
    label         text not null check (length(label) between 1 and 200),
    kind          text not null check (kind in ('rank', 'adventure', 'award')),
    completed_on  date,
    noted_at      timestamptz not null default now(),
    noted_by      uuid references public.adults(id) on delete set null,
    given_at      timestamptz,
    given_by      uuid references public.adults(id) on delete set null
);
-- One open entry per scout and award.
create unique index if not exists awards_owed_open_key on public.awards_owed(scout_id, label) where given_at is null;
create index if not exists awards_owed_scout_idx on public.awards_owed(scout_id);

alter table public.awards_owed enable row level security;
revoke all on public.awards_owed from anon;
grant select, insert, update, delete on public.awards_owed to authenticated;

-- The same leaders who see and approve a scout's advancement: the scout's den leaders, key
-- leaders and the advancement chair (each with two-step sign-in).
drop policy if exists awards_owed_read on public.awards_owed;
create policy awards_owed_read on public.awards_owed for select to authenticated
    using ((select private.is_committee()) or (select private.is_advancement()) or scout_id in (select private.reviewable_scout_ids()));
drop policy if exists awards_owed_add on public.awards_owed;
create policy awards_owed_add on public.awards_owed for insert to authenticated
    with check ((select private.is_committee()) or (select private.is_advancement()) or scout_id in (select private.reviewable_scout_ids()));
drop policy if exists awards_owed_change on public.awards_owed;
create policy awards_owed_change on public.awards_owed for update to authenticated
    using ((select private.is_committee()) or (select private.is_advancement()) or scout_id in (select private.reviewable_scout_ids()))
    with check ((select private.is_committee()) or (select private.is_advancement()) or scout_id in (select private.reviewable_scout_ids()));
drop policy if exists awards_owed_remove on public.awards_owed;
create policy awards_owed_remove on public.awards_owed for delete to authenticated
    using ((select private.is_committee()) or (select private.is_advancement()) or scout_id in (select private.reviewable_scout_ids()));

-- Who noted it and who gave it are stamped here; the award itself never changes.
create or replace function private.awards_owed_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    if tg_op = 'INSERT' then
        new.noted_at := now();
        new.noted_by := private.current_adult_id();
        new.given_at := null;
        new.given_by := null;
    else
        new.scout_id     := old.scout_id;
        new.label        := old.label;
        new.kind         := old.kind;
        new.completed_on := old.completed_on;
        new.noted_at     := old.noted_at;
        new.noted_by     := old.noted_by;
        if new.given_at is null then
            new.given_by := null;
        elsif old.given_at is null then
            new.given_at := now();
            new.given_by := private.current_adult_id();
        else
            new.given_at := old.given_at;
            new.given_by := old.given_by;
        end if;
    end if;
    return new;
end
$$;
revoke execute on function private.awards_owed_guard() from public, anon, authenticated;
drop trigger if exists awards_owed_guard on public.awards_owed;
create trigger awards_owed_guard before insert or update on public.awards_owed
    for each row execute function private.awards_owed_guard();

commit;
