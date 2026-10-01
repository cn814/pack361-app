-- Recruiting (2026-10-05).
--   events.public_on_join / public_blurb  leaders pick events that families thinking about joining
--                                         can come to (the Pinewood Derby, a campout, a pack
--                                         meeting); they're listed on the public join page.
--   join_page_events()                    what the public page may show of those events: title,
--                                         dates, place name and the short public note. Never the
--                                         address, details, RSVPs or anything about families.
--   pack_settings.public_site_url         the link families share from Invite a family
--                                         (app.pack361.org/join until pack361.org points here).

alter table public.events
    add column public_on_join boolean not null default false,
    add column public_blurb   text check (length(public_blurb) <= 300);

insert into public.pack_settings (key, value) values ('public_site_url', 'https://app.pack361.org/join')
on conflict (key) do nothing;

create or replace function public.join_page_events()
returns table (title text, category text, starts_at timestamptz, ends_at timestamptz, all_day boolean,
               location_name text, public_blurb text)
language sql stable security definer set search_path = '' as $$
    select e.title, e.category, e.starts_at, e.ends_at, e.all_day, e.location_name, e.public_blurb
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
