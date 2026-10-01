-- Weekly family newsletter (2026-10-05). Every Sunday morning each adult gets one email for their
-- family: the next two weeks of events with their RSVP, anything waiting on them (RSVPs, money
-- due, medical forms, registration), the week's announcements and open volunteer jobs. It
-- replaces TroopWebHost's Sunday newsletter.
--   pack_settings.newsletter_mode  'off', 'test' (only the people in newsletter_test_adults get
--                                  it, while TroopWebHost still sends its own) or 'everyone'.
--                                  ('admins' was the first name for testing and means the same.)
--   newsletter_sends               one row per adult per week, so a retry never sends twice.

insert into public.pack_settings (key, value) values ('newsletter_mode', 'admins')
on conflict (key) do nothing;

create table public.newsletter_sends (
    adult_id  uuid not null references public.adults(id) on delete cascade,
    week_of   date not null,                     -- the Sunday it was for (Eastern)
    sent_at   timestamptz not null default now(),
    primary key (adult_id, week_of)
);
create index newsletter_sends_week_idx on public.newsletter_sends(week_of);

-- Written by the Sunday job with the secret key only. Admins can see what went out.
revoke all on public.newsletter_sends from anon, authenticated;
grant select on public.newsletter_sends to authenticated;
alter table public.newsletter_sends enable row level security;
create policy newsletter_sends_read on public.newsletter_sends for select to authenticated
    using (private.is_admin());
