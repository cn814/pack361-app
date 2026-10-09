-- The public join page shows only each event's name, date and the leader's note: no time and no
-- place. Visitors who want to come ask the pack (info@pack361.org) for the details.
--
-- Same columns as before, so the app keeps working while it updates: starts_at and ends_at are
-- now midnight Eastern on the event's first and last day, all_day is always true, and
-- location_name is always empty.

begin;

create or replace function public.join_page_events()
returns table (title text, category text, starts_at timestamptz, ends_at timestamptz, all_day boolean,
               location_name text, public_blurb text)
language sql stable security definer set search_path = '' as $$
    select e.title,
           e.category,
           ((e.starts_at at time zone 'America/New_York')::date)::timestamp at time zone 'America/New_York',
           case when e.ends_at is null then null
                else ((e.ends_at at time zone 'America/New_York')::date)::timestamp at time zone 'America/New_York' end,
           true,
           null::text,
           e.public_blurb
      from public.events e
     where e.public_on_join
       and e.archived_at is null
       and not e.leaders_only
       and coalesce(e.ends_at, e.starts_at) >= now()
     order by e.starts_at
     limit 6
$$;
revoke execute on function public.join_page_events() from public;
grant execute on function public.join_page_events() to anon, authenticated;

commit;
