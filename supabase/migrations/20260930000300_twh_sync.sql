-- TroopWebHost calendar sync: remember which TroopWebHost event each app event came from.
alter table public.events
    add column twh_uid       text unique,
    add column twh_synced_at timestamptz;
