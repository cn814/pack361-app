-- Signal group for an event: leaders paste the event's Signal group invite link, and families
-- who answered "yes" see a "Join the Signal group" button on the event page. Kept in its own
-- table so the link is only readable by leaders and by the families going (anyone with a Signal
-- invite link can ask to join the group).

create table if not exists public.event_signal (
    event_id    uuid primary key references public.events(id) on delete cascade,
    url         text not null check (length(url) <= 500 and url ~ '^https://signal[.]group/#[A-Za-z0-9_=-]{8,}$'),
    updated_at  timestamptz not null default now(),
    updated_by  uuid references public.adults(id) on delete set null
);

-- Is the signed-in person's family (or the person, with no family) going to this event?
create or replace function private.going_to_event(p_event_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (
        select 1 from public.event_rsvps r
         where r.event_id = p_event_id and r.status = 'yes'
           and ((r.family_id is not null and r.family_id = private.my_family_id())
                or (r.family_id is null and r.adult_id = private.current_adult_id())))
$$;
grant execute on function private.going_to_event(uuid) to authenticated;

revoke all on public.event_signal from anon, authenticated;
grant select, insert, update, delete on public.event_signal to authenticated;
alter table public.event_signal enable row level security;

drop policy if exists event_signal_read on public.event_signal;
create policy event_signal_read on public.event_signal for select to authenticated
    using (private.is_leader() or (private.can_see_event(event_id) and private.going_to_event(event_id)));

drop policy if exists event_signal_write on public.event_signal;
create policy event_signal_write on public.event_signal for all to authenticated
    using (private.is_leader()) with check (private.is_leader());

-- Does this event have a Signal group? (Yes or no only, for anyone who can see the event, so the
-- page can say "RSVP yes to get the Signal group link" without showing the link.)
create or replace function public.event_has_signal(p_event_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
    select private.can_see_event(p_event_id)
           and exists (select 1 from public.event_signal s where s.event_id = p_event_id)
$$;
revoke execute on function public.event_has_signal(uuid) from public, anon;
grant execute on function public.event_has_signal(uuid) to authenticated;
