-- Council events: the committee picks which Baltimore Area Council and district events go on
-- the pack calendar.
--   council_events   a copy of the council's calendar feed, refreshed by the daily job (secret
--                    key). Rows are never deleted: an event that leaves the feed gets removed_at.
--                    status: new (nobody has decided), added (on our calendar), skipped.
--   pack_settings    council_calendar_url (the feed link; the committee can change it) and
--                    council_last_sync (what the last check did, written by the sync).
--   events.source    'council' for pack events made from a council event. The sync keeps their
--                    title, time and place in step with the council; editing one in the app
--                    makes it 'manual' and the sync leaves it alone. (events.source has no check
--                    constraint, so nothing to change there.)

create table public.council_events (
    uid            text primary key,
    title          text not null,
    starts_at      timestamptz not null,
    ends_at        timestamptz,
    all_day        boolean not null default false,
    location       text,
    url            text,                                   -- registration or detail page
    description    text check (length(description) <= 1500),
    categories     text,
    first_seen_at  timestamptz not null default now(),
    last_seen_at   timestamptz not null default now(),
    removed_at     timestamptz,                            -- no longer in the council's feed
    status         text not null default 'new' check (status in ('new', 'added', 'skipped')),
    event_id       uuid references public.events(id) on delete set null,
    decided_by     uuid references public.adults(id) on delete set null,
    decided_at     timestamptz
);
create index council_events_starts_at_idx on public.council_events(starts_at);
create index council_events_event_id_idx on public.council_events(event_id) where event_id is not null;

-- Who decided (added, skipped or undid) and when.
create or replace function private.stamp_council_decision()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    if new.status is distinct from old.status then
        new.decided_by := private.current_adult_id();
        new.decided_at := now();
    end if;
    return new;
end;
$$;
revoke execute on function private.stamp_council_decision() from public, anon, authenticated;
create trigger council_events_decision before update on public.council_events
    for each row execute function private.stamp_council_decision();

-- Leaders read; the committee only changes the decision columns. The sync adds and refreshes
-- rows with the secret key. Nobody deletes.
revoke all on public.council_events from anon, authenticated;
grant select on public.council_events to authenticated;
grant update (status, event_id) on public.council_events to authenticated;

alter table public.council_events enable row level security;

create policy council_events_read on public.council_events for select to authenticated
    using (private.is_leader());
create policy council_events_update on public.council_events for update to authenticated
    using (private.is_committee()) with check (private.is_committee());

-- -----------------------------------------------------------------------------
-- Settings: the feed link. Admins already change every setting; the committee can change
-- this one.
-- -----------------------------------------------------------------------------
insert into public.pack_settings (key, value) values ('council_calendar_url', '')
on conflict (key) do nothing;

create policy settings_council_insert on public.pack_settings for insert to authenticated
    with check (key = 'council_calendar_url' and private.is_committee());
create policy settings_council_update on public.pack_settings for update to authenticated
    using (key = 'council_calendar_url' and private.is_committee())
    with check (key = 'council_calendar_url' and private.is_committee());
