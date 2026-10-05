-- Leader notes for a meeting: a shared notes box for the leaders running it (what came up,
-- what to follow up on, who brought snacks). Families never see them.
--   A den meeting's notes are kept by den and day, so they can be written before the meeting is
--   recorded: that den's leaders and pack leadership.
--   An event's notes (a pack meeting, a hike): every leader who can see the event.

begin;

create table if not exists public.meeting_notes (
    id          uuid primary key default gen_random_uuid(),
    event_id    uuid references public.events(id) on delete cascade,
    den_id      uuid references public.dens(id) on delete cascade,
    meets_on    date,
    body        text not null default '' check (length(body) <= 20000),
    updated_by  uuid references public.adults(id) on delete set null,
    updated_at  timestamptz not null default now(),
    constraint meeting_notes_one_target check (
        (event_id is not null and den_id is null and meets_on is null)
        or (event_id is null and den_id is not null and meets_on is not null))
);
create unique index if not exists meeting_notes_event_key on public.meeting_notes(event_id) where event_id is not null;
create unique index if not exists meeting_notes_den_day_key on public.meeting_notes(den_id, meets_on) where den_id is not null;

alter table public.meeting_notes enable row level security;
revoke all on public.meeting_notes from anon;
grant select, insert, update, delete on public.meeting_notes to authenticated;

create or replace function private.can_note(p_event_id uuid, p_den_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
    select case
        when p_den_id is not null then private.leads_den(p_den_id)
        when p_event_id is not null then private.is_leader() and private.can_see_event(p_event_id)
        else false
    end
$$;
revoke execute on function private.can_note(uuid, uuid) from public, anon;
grant execute on function private.can_note(uuid, uuid) to authenticated;

drop policy if exists meeting_notes_read on public.meeting_notes;
create policy meeting_notes_read on public.meeting_notes for select to authenticated
    using (private.can_note(event_id, den_id));
drop policy if exists meeting_notes_add on public.meeting_notes;
create policy meeting_notes_add on public.meeting_notes for insert to authenticated
    with check (private.can_note(event_id, den_id));
drop policy if exists meeting_notes_change on public.meeting_notes;
create policy meeting_notes_change on public.meeting_notes for update to authenticated
    using (private.can_note(event_id, den_id))
    with check (private.can_note(event_id, den_id));
drop policy if exists meeting_notes_remove on public.meeting_notes;
create policy meeting_notes_remove on public.meeting_notes for delete to authenticated
    using (private.can_note(event_id, den_id));

-- Who wrote last and when, set here (not by the app).
drop trigger if exists meeting_notes_stamp on public.meeting_notes;
create trigger meeting_notes_stamp before insert or update on public.meeting_notes
    for each row execute function private.stamp_updated();

commit;
