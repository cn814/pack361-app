-- Awards already bought: after shopping, a leader taps "Mark all as bought" on the Scout Shop
-- shopping list. The next Scoutbook import's new awards then show as "To buy" and the ones
-- already bought fold away. Kept by label (the award's name as the lists print it), because
-- each import replaces a scout's advancement rows.

begin;

create table if not exists public.awards_bought (
    id         uuid primary key default gen_random_uuid(),
    scout_id   uuid not null references public.scouts(id) on delete cascade,
    label      text not null check (length(label) between 1 and 200),
    bought_at  timestamptz not null default now(),
    bought_by  uuid references public.adults(id) on delete set null,
    unique (scout_id, label)
);

alter table public.awards_bought enable row level security;
revoke all on public.awards_bought from anon;
grant select, insert, delete on public.awards_bought to authenticated;

-- The same leaders who see the awards lists: the scout's den leaders, key leaders and the
-- advancement chair (each with two-step sign-in). Nothing is edited, only added or taken off.
drop policy if exists awards_bought_read on public.awards_bought;
create policy awards_bought_read on public.awards_bought for select to authenticated
    using ((select private.is_committee()) or (select private.is_advancement()) or scout_id in (select private.reviewable_scout_ids()));
drop policy if exists awards_bought_add on public.awards_bought;
create policy awards_bought_add on public.awards_bought for insert to authenticated
    with check ((select private.is_committee()) or (select private.is_advancement()) or scout_id in (select private.reviewable_scout_ids()));
drop policy if exists awards_bought_remove on public.awards_bought;
create policy awards_bought_remove on public.awards_bought for delete to authenticated
    using ((select private.is_committee()) or (select private.is_advancement()) or scout_id in (select private.reviewable_scout_ids()));

-- Who bought it and when are stamped here.
create or replace function private.awards_bought_stamp()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    new.bought_at := now();
    new.bought_by := private.current_adult_id();
    return new;
end
$$;
revoke execute on function private.awards_bought_stamp() from public, anon, authenticated;
drop trigger if exists awards_bought_stamp on public.awards_bought;
create trigger awards_bought_stamp before insert on public.awards_bought
    for each row execute function private.awards_bought_stamp();

commit;
