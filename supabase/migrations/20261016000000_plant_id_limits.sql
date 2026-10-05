-- Plant ID (Pl@ntNet) daily limits. Pl@ntNet's free plan allows 500 identifications a day for the
-- whole pack, so each adult gets up to 25 a day and the pack stops at 450, keeping room to spare.
-- Only counts are kept: no photos and no results.

begin;

create table if not exists public.plant_id_uses (
    adult_id  uuid not null references public.adults(id) on delete cascade,
    day       date not null,
    uses      integer not null default 0 check (uses >= 0),
    primary key (adult_id, day)
);
revoke all on public.plant_id_uses from anon, authenticated;
alter table public.plant_id_uses enable row level security;
-- No policies: only claim_plant_id() below touches it.

-- Count one identification for the signed-in adult, or refuse (errcode 54000) when they or the
-- pack are at the day's limit. Returns how many the adult has left today.
create or replace function public.claim_plant_id()
returns integer language plpgsql security definer set search_path = '' as $$
declare
    me uuid := private.current_adult_id();
    today date := (now() at time zone 'America/New_York')::date;
    mine integer;
    pack integer;
begin
    if me is null or not private.is_member() then
        raise exception 'Members only' using errcode = '42501';
    end if;
    -- One at a time per pack, so two people can't both take the last one.
    perform pg_advisory_xact_lock(hashtext('plant_id_uses'));
    select coalesce(sum(uses), 0) into pack from public.plant_id_uses where day = today;
    select coalesce(uses, 0) into mine from public.plant_id_uses where adult_id = me and day = today;
    mine := coalesce(mine, 0);
    if mine >= 25 then
        raise exception 'You''ve used today''s 25 plant IDs' using errcode = '54000';
    end if;
    if pack >= 450 then
        raise exception 'The pack has used today''s plant IDs' using errcode = '54000';
    end if;
    insert into public.plant_id_uses (adult_id, day, uses) values (me, today, 1)
        on conflict (adult_id, day) do update set uses = public.plant_id_uses.uses + 1;
    -- Keep only the last two weeks of counts.
    delete from public.plant_id_uses where day < today - 14;
    return 25 - (mine + 1);
end $$;
revoke execute on function public.claim_plant_id() from public, anon;
grant execute on function public.claim_plant_id() to authenticated;

commit;
