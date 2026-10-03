-- Automatic reminders and family alerts (2026-10-12).
--   event_auto_reminders    one row per event, kind and Eastern day a reminder went out: the
--                           day-before reminder to families going, and the RSVP nudge two days
--                           before the RSVP-by date. The daily job claims the row before sending,
--                           so a rerun never sends the same reminder twice.
--   meeting_family_alerts   one row per den meeting, scout and kind ('worked' or 'missed') once
--                           that scout's family was told, so saving a meeting again doesn't
--                           repeat the alert (a scout added later still gets theirs).
-- Both are written only by the server (secret key). Leaders can see what went out.

begin;

create table if not exists public.event_auto_reminders (
    event_id    uuid not null references public.events(id) on delete cascade,
    kind        text not null check (kind in ('day_before', 'rsvp_nudge')),
    sent_on     date not null,                 -- the Eastern day it went out
    recipients  int not null default 0 check (recipients >= 0),
    sent_at     timestamptz not null default now(),
    primary key (event_id, kind, sent_on)
);

revoke all on public.event_auto_reminders from anon, authenticated;
grant select on public.event_auto_reminders to authenticated;
alter table public.event_auto_reminders enable row level security;
drop policy if exists event_auto_reminders_read on public.event_auto_reminders;
create policy event_auto_reminders_read on public.event_auto_reminders for select to authenticated
    using ((select private.is_leader()));

create table if not exists public.meeting_family_alerts (
    meeting_id  uuid not null references public.den_meetings(id) on delete cascade,
    scout_id    uuid not null references public.scouts(id) on delete cascade,
    kind        text not null check (kind in ('worked', 'missed')),
    sent_at     timestamptz not null default now(),
    primary key (meeting_id, scout_id, kind)
);
create index if not exists meeting_family_alerts_scout_idx on public.meeting_family_alerts(scout_id);

revoke all on public.meeting_family_alerts from anon, authenticated;
grant select on public.meeting_family_alerts to authenticated;
alter table public.meeting_family_alerts enable row level security;
drop policy if exists meeting_family_alerts_read on public.meeting_family_alerts;
create policy meeting_family_alerts_read on public.meeting_family_alerts for select to authenticated
    using ((select private.is_leader()));

grant select, insert, update, delete on public.event_auto_reminders, public.meeting_family_alerts to service_role;

commit;
