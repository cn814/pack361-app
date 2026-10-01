-- Permission slips (2026-10-05). A leader marks an event as needing a permission slip, with the
-- wording families agree to (and, optionally, a printable form from Pack documents). A parent
-- signs for each of their scouts by typing their name; the wording they agreed to is kept with
-- the signature. A leader can record a paper slip instead. One slip per scout per event.

alter table public.events
    add column slip_required    boolean not null default false,
    add column slip_text        text check (length(slip_text) <= 4000),
    add column slip_document_id uuid references public.documents(id) on delete set null,
    add column slip_due         date;

create table public.permission_slips (
    id            uuid primary key default gen_random_uuid(),
    event_id      uuid not null references public.events(id) on delete cascade,
    scout_id      uuid not null references public.scouts(id) on delete cascade,
    kind          text not null check (kind in ('signed', 'paper')),
    signed_by     uuid references public.adults(id) on delete set null,     -- the parent, when signed in the app
    signed_name   text check (length(signed_name) <= 120),                  -- the name they typed
    signed_text   text check (length(signed_text) <= 4000),                 -- the wording they agreed to
    contact       text check (length(contact) <= 200),                      -- how to reach them during the event
    recorded_by   uuid references public.adults(id) on delete set null,     -- the leader, for a paper slip
    created_at    timestamptz not null default now(),
    unique (event_id, scout_id)
);
create index permission_slips_scout_idx on public.permission_slips(scout_id);

create or replace function private.permission_slip_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
    e public.events;
begin
    select * into e from public.events where id = new.event_id;
    if e.id is null or not e.slip_required then
        raise exception 'This event does not need a permission slip' using errcode = '23514';
    end if;
    new.created_at := now();
    if new.kind = 'signed' then
        if not private.is_my_scout(new.scout_id) then
            raise exception 'Only a parent can sign for their scout' using errcode = '42501';
        end if;
        if coalesce(e.ends_at, e.starts_at) < now() - interval '1 day' then
            raise exception 'This event is over' using errcode = '23514';
        end if;
        new.signed_name := nullif(trim(new.signed_name), '');
        if new.signed_name is null or length(new.signed_name) < 2 then
            raise exception 'Type your name to sign' using errcode = '23514';
        end if;
        new.signed_by := private.current_adult_id();
        new.signed_text := e.slip_text;
        new.contact := nullif(trim(new.contact), '');
        new.recorded_by := null;
    else
        if not private.is_leader() then
            raise exception 'Only leaders record paper slips' using errcode = '42501';
        end if;
        new.recorded_by := private.current_adult_id();
        new.signed_by := null;
        new.signed_name := null;
        new.signed_text := null;
        new.contact := null;
    end if;
    return new;
end;
$$;

create trigger permission_slips_insert
    before insert on public.permission_slips
    for each row execute function private.permission_slip_insert();

revoke all on public.permission_slips from anon, authenticated;
grant select, insert, delete on public.permission_slips to authenticated;
alter table public.permission_slips enable row level security;

create policy permission_slips_read on public.permission_slips for select to authenticated
    using (private.is_my_scout(scout_id) or private.is_leader());
create policy permission_slips_insert on public.permission_slips for insert to authenticated
    with check (private.is_member() and private.can_see_event(event_id) and (private.is_my_scout(scout_id) or private.is_leader()));
-- Parents can take back their own signature (to correct it); leaders can remove any slip.
create policy permission_slips_delete on public.permission_slips for delete to authenticated
    using ((kind = 'signed' and private.is_my_scout(scout_id)) or private.is_leader());
