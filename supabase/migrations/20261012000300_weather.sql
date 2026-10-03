-- Weather for events (National Weather Service forecast and alerts).
--  1. Where an event is: coordinates looked up once from its address with the Census geocoder,
--     and the address they came from, so a changed address is looked up again. No coordinates
--     with an address filled in means the geocoder found nothing for that address.
--  2. Which weather alerts leaders have already been sent for an event, so the daily job sends
--     each alert once. Only the server (secret key) reads or writes it.
begin;

alter table public.events
    add column if not exists lat numeric(8, 5),
    add column if not exists lon numeric(9, 5),
    add column if not exists geocoded_address text;

alter table public.events drop constraint if exists events_lat_range;
alter table public.events add constraint events_lat_range check (lat between -90 and 90);
alter table public.events drop constraint if exists events_lon_range;
alter table public.events add constraint events_lon_range check (lon between -180 and 180);
alter table public.events drop constraint if exists events_lat_lon_together;
alter table public.events add constraint events_lat_lon_together check ((lat is null) = (lon is null));
alter table public.events drop constraint if exists events_geocoded_address_length;
alter table public.events add constraint events_geocoded_address_length check (length(geocoded_address) <= 1000);

comment on column public.events.lat is 'Latitude of the event address (Census geocoder), for the weather forecast';
comment on column public.events.lon is 'Longitude of the event address (Census geocoder), for the weather forecast';
comment on column public.events.geocoded_address is 'The place and address lat/lon were looked up for; a different address is looked up again';

create table if not exists public.weather_alerts_sent (
    event_id    uuid not null references public.events(id) on delete cascade,
    alert_id    text not null check (length(alert_id) between 1 and 300),
    alert_event text check (length(alert_event) <= 200),
    sent_at     timestamptz not null default now(),
    primary key (event_id, alert_id)
);

comment on table public.weather_alerts_sent is 'Weather Service alerts already pushed to leaders for an event (daily job, secret key only)';

alter table public.weather_alerts_sent enable row level security;
revoke all on public.weather_alerts_sent from public, anon, authenticated;
grant select, insert, update, delete on public.weather_alerts_sent to service_role;

commit;
