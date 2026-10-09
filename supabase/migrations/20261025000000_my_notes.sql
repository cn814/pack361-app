-- A private notepad for every account: one general notepad (Me → My notepad) and a page of notes
-- per meeting (committee meetings and online meetings: "Take notes"). Only the person who wrote
-- them can read them: not leaders, not admins. Each adult's notes go when the adult does.

begin;

create table if not exists public.my_notes (
    id          uuid primary key default gen_random_uuid(),
    adult_id    uuid not null references public.adults(id) on delete cascade,
    event_id    uuid references public.events(id) on delete cascade,  -- null: the general notepad
    body        text not null default '' check (length(body) <= 50000),
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);
create unique index if not exists my_notes_pad_key on public.my_notes(adult_id) where event_id is null;
create unique index if not exists my_notes_event_key on public.my_notes(adult_id, event_id) where event_id is not null;
create index if not exists my_notes_event_idx on public.my_notes(event_id) where event_id is not null;

alter table public.my_notes enable row level security;
revoke all on public.my_notes from anon;
grant select, insert, update, delete on public.my_notes to authenticated;

-- Always your own; a meeting's notes only for a meeting you can see.
drop policy if exists my_notes_read on public.my_notes;
create policy my_notes_read on public.my_notes for select to authenticated
    using (adult_id = (select private.current_adult_id()));
drop policy if exists my_notes_add on public.my_notes;
create policy my_notes_add on public.my_notes for insert to authenticated
    with check (adult_id = (select private.current_adult_id())
                and (event_id is null or private.can_see_event(event_id)));
drop policy if exists my_notes_change on public.my_notes;
create policy my_notes_change on public.my_notes for update to authenticated
    using (adult_id = (select private.current_adult_id()))
    with check (adult_id = (select private.current_adult_id()));
drop policy if exists my_notes_remove on public.my_notes;
create policy my_notes_remove on public.my_notes for delete to authenticated
    using (adult_id = (select private.current_adult_id()));

-- The owner and the meeting never change, and the times are set here.
create or replace function private.my_notes_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    if tg_op = 'INSERT' then
        new.created_at := now();
    else
        new.adult_id   := old.adult_id;
        new.event_id   := old.event_id;
        new.created_at := old.created_at;
    end if;
    new.updated_at := now();
    return new;
end
$$;
drop trigger if exists my_notes_guard on public.my_notes;
create trigger my_notes_guard before insert or update on public.my_notes
    for each row execute function private.my_notes_guard();

commit;
