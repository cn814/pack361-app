-- Awarded at awards night: a leader taps "Awarded" for each scout as they get their awards.
-- When the night is over, "Finish awards night" puts what nobody marked awarded on the Still owed
-- list (public.awards_owed). Kept by label (the award's name as the lists print it), because
-- each Scoutbook import replaces a scout's advancement rows.

begin;

create table if not exists public.awards_given (
    id        uuid primary key default gen_random_uuid(),
    scout_id  uuid not null references public.scouts(id) on delete cascade,
    label     text not null check (length(label) between 1 and 200),
    given_at  timestamptz not null default now(),
    given_by  uuid references public.adults(id) on delete set null,
    unique (scout_id, label)
);

alter table public.awards_given enable row level security;
revoke all on public.awards_given from anon;
grant select, insert, delete on public.awards_given to authenticated;

-- The same leaders who see the awards lists: the scout's den leaders, key leaders and the
-- advancement chair (each with two-step sign-in). Nothing is edited, only added or taken off.
drop policy if exists awards_given_read on public.awards_given;
create policy awards_given_read on public.awards_given for select to authenticated
    using ((select private.is_committee()) or (select private.is_advancement()) or scout_id in (select private.reviewable_scout_ids()));
drop policy if exists awards_given_add on public.awards_given;
create policy awards_given_add on public.awards_given for insert to authenticated
    with check ((select private.is_committee()) or (select private.is_advancement()) or scout_id in (select private.reviewable_scout_ids()));
drop policy if exists awards_given_remove on public.awards_given;
create policy awards_given_remove on public.awards_given for delete to authenticated
    using ((select private.is_committee()) or (select private.is_advancement()) or scout_id in (select private.reviewable_scout_ids()));

-- Who marked it and when are stamped here.
create or replace function private.awards_given_stamp()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    new.given_at := now();
    new.given_by := private.current_adult_id();
    return new;
end
$$;
revoke execute on function private.awards_given_stamp() from public, anon, authenticated;
drop trigger if exists awards_given_stamp on public.awards_given;
create trigger awards_given_stamp before insert on public.awards_given
    for each row execute function private.awards_given_stamp();

commit;
