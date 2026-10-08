-- The quartermaster runs the gear closet, and every item says where it's kept.
--
--   1. private.is_gear_keeper(): leaders (as before) and anyone on the roster whose pack position
--      mentions the quartermaster (Pack admin → Roster → Position; only admins can set it). They
--      add and edit gear, see every request and loan, and approve, hand out and check gear back in.
--   2. gear_items.location: where the item is kept ("Pack shed", "At the Greenspoon house").
--   3. public.gear_borrowers(ids): the family name and who asked, for the loans a gear keeper is
--      looking at. A quartermaster who isn't a leader can't read other families' rows, and this
--      shows only those two names, nothing else about the family.
-- Same policies as 20261012000400_gear_and_help.sql otherwise.
begin;

create or replace function private.is_gear_keeper()
returns boolean language sql stable security definer set search_path = '' as $$
    select private.is_leader()
        or exists (select 1 from public.adults a
                    where a.user_id = auth.uid() and a.is_active
                      and a.position_title ilike '%quartermaster%')
$$;
revoke execute on function private.is_gear_keeper() from public, anon;
grant execute on function private.is_gear_keeper() to authenticated;

alter table public.gear_items add column if not exists location text;
alter table public.gear_items drop constraint if exists gear_items_location_check;
alter table public.gear_items add constraint gear_items_location_check check (length(location) <= 120);

alter policy gear_items_read on public.gear_items
    using ((select private.is_member()) and (active or (select private.is_gear_keeper())));
alter policy gear_items_insert on public.gear_items
    with check ((select private.is_gear_keeper()));
alter policy gear_items_update on public.gear_items
    using ((select private.is_gear_keeper()))
    with check ((select private.is_gear_keeper()));

alter policy gear_loans_read on public.gear_loans
    using (family_id = (select private.my_family_id()) or (select private.is_gear_keeper()));
alter policy gear_loans_update on public.gear_loans
    using ((select private.is_gear_keeper()))
    with check ((select private.is_gear_keeper()));

create or replace function public.gear_borrowers(p_loan_ids uuid[])
returns table (loan_id uuid, family_name text, first_name text, preferred_name text, last_name text)
language sql stable security definer set search_path = '' as $$
    select l.id, f.family_name, a.first_name, a.preferred_name, a.last_name
      from public.gear_loans l
      join public.families f on f.id = l.family_id
      left join public.adults a on a.id = l.adult_id
     where private.is_gear_keeper() and l.id = any(coalesce(p_loan_ids, '{}'))
$$;
revoke execute on function public.gear_borrowers(uuid[]) from public, anon;
grant execute on function public.gear_borrowers(uuid[]) to authenticated;

commit;
