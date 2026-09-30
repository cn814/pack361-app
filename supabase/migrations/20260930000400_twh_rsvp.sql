-- Link back to each event on TroopWebHost, where families RSVP.
alter table public.events add column twh_url text;
