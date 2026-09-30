-- Den-aware calendar (2026-09-30)
--   den_meetings  + start/end time and street address (off-site meetings)
--   events        + ranks (e.g. {webelos,aol} for Webelos & AOL events; null = whole pack)
--                 + all_day (sale windows, council weekends)
--                 + leaders_only (committee meetings, Roundtable): hidden from parents by RLS

alter table public.den_meetings
    add column start_time time,
    add column end_time   time,
    add column address    text;

alter table public.events
    add column ranks        public.den_rank[],
    add column all_day      boolean not null default false,
    add column leaders_only boolean not null default false;

drop policy if exists events_read on public.events;
create policy events_read on public.events for select to authenticated
    using (private.is_member() and (not leaders_only or private.is_leader()));
