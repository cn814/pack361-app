-- Every event takes RSVPs in the app (den meetings too) unless a leader turns it off on the
-- event. New events, including ones the TroopWebHost and council syncs add, default to on, and
-- every upcoming event is switched on now.
alter table public.events alter column rsvp_enabled set default true;

update public.events
   set rsvp_enabled = true
 where not rsvp_enabled
   and archived_at is null
   and coalesce(ends_at, starts_at) >= now();
