-- Other names an adult goes by in Scouting America's records ("Benjamin" for Ben, "Woodrow A
-- Collins"). When pack leadership confirms during a training import that a differently-named
-- report row is the same person, the report's name is saved here, so the next import matches it
-- without asking again.

alter table public.adults
    add column if not exists other_names text[] not null default '{}';

-- Pack leadership saves confirmed names. Only appends names (trimmed, at most 80 characters,
-- at most 10 per adult); never changes anything else.
create or replace function public.remember_adult_names(p_names jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare
    v_count int;
begin
    if not private.is_committee() then
        raise exception 'Only pack leadership can do this' using errcode = '42501';
    end if;
    if jsonb_typeof(coalesce(p_names, '[]')) <> 'array' or jsonb_array_length(coalesce(p_names, '[]')) > 200 then
        raise exception 'Send at most 200 names' using errcode = '22023';
    end if;

    with incoming as (
        select distinct x.adult_id, btrim(regexp_replace(x.name, '[[:space:]]+', ' ', 'g')) as name
          from jsonb_to_recordset(coalesce(p_names, '[]')) as x(adult_id uuid, name text)
         where x.adult_id is not null and length(btrim(coalesce(x.name, ''))) between 2 and 80
    ), saved as (
        update public.adults a
           set other_names = (a.other_names || array(
                   select i.name from incoming i
                    where i.adult_id = a.id
                      and lower(i.name) <> lower(a.first_name || ' ' || a.last_name)
                      and not exists (select 1 from unnest(a.other_names) n where lower(n) = lower(i.name))))[1:10]
         where a.id in (select adult_id from incoming)
           and exists (select 1 from incoming i
                        where i.adult_id = a.id
                          and lower(i.name) <> lower(a.first_name || ' ' || a.last_name)
                          and not exists (select 1 from unnest(a.other_names) n where lower(n) = lower(i.name)))
           and cardinality(a.other_names) < 10
        returning a.id
    )
    select count(*) into v_count from saved;
    return v_count;
end;
$$;
revoke execute on function public.remember_adult_names(jsonb) from public, anon;
grant execute on function public.remember_adult_names(jsonb) to authenticated;
