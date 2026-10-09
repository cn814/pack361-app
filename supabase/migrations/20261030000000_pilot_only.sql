-- Pilot only: until the pack committee adopts the app, only leaders (den leaders, key leaders,
-- the Cubmaster and admins) and the people an admin picks can use it. Everyone else who signs in
-- sees a "not approved yet" page, and the app's emails and phone alerts skip them.
-- Pack admin → Pilot only turns it off after the vote.
--
--   pilot_only    'on' while the pilot runs; '' (or anything else) once the app is open to all
--   pilot_people  comma-separated adult ids allowed in besides leaders (e.g. a reviewer's test parent)
--
-- Changing either one is written to the security log.

begin;

insert into public.pack_settings (key, value) values ('pilot_only', 'on'), ('pilot_people', '')
on conflict (key) do nothing;

create or replace function private.log_pilot_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
    k text := case when tg_op = 'DELETE' then old.key else new.key end;
    v text := case when tg_op = 'DELETE' then '' else coalesce(new.value, '') end;
begin
    if k not in ('pilot_only', 'pilot_people') then return null; end if;
    if tg_op = 'UPDATE' and old.value is not distinct from new.value then return null; end if;
    if k = 'pilot_only' then
        perform private.log_security('access.pilot_only', case when v = 'on' then 'Pilot only turned on' else 'Pilot only turned off' end,
                                     '{}'::jsonb);
    else
        perform private.log_security('access.pilot_people', 'Pilot people changed',
                                     jsonb_build_object('count', cardinality(array_remove(string_to_array(v, ','), ''))));
    end if;
    return null;
end $$;
revoke execute on function private.log_pilot_change() from public, anon, authenticated;

drop trigger if exists pack_settings_pilot_log on public.pack_settings;
create trigger pack_settings_pilot_log after insert or update or delete on public.pack_settings
    for each row execute function private.log_pilot_change();

commit;
