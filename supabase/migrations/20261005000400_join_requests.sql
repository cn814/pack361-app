-- Ask to join (2026-10-05). Someone who signs in with an email that isn't on the roster can ask
-- the pack admins to add them: their name, phone and their scouts' names and grades. An admin
-- approves it (which adds the family, the parent and the scouts in one step, and the parent's
-- login links by email) or declines it with a reason. After the decision the scouts' names, the
-- phone number and the note are cleared from the request: the roster is the only copy.

create or replace function private.valid_join_scouts(s jsonb)
returns boolean language sql immutable set search_path = '' as $$
    select jsonb_typeof(s) = 'array'
       and jsonb_array_length(s) <= 6
       and not exists (
           select 1 from jsonb_array_elements(s) e
            where jsonb_typeof(e) <> 'object'
               or length(trim(coalesce(e->>'first_name', ''))) not between 1 and 60
               or length(trim(coalesce(e->>'last_name', ''))) not between 1 and 60
               or coalesce(e->>'grade', '') not in ('', 'K', '1', '2', '3', '4', '5')
               or (select count(*) from jsonb_object_keys(e)) > 3
               or exists (select 1 from jsonb_object_keys(e) k where k not in ('first_name', 'last_name', 'grade'))
       )
$$;

create table public.join_requests (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid not null references auth.users(id) on delete cascade,
    email           text not null,
    first_name      text not null check (length(first_name) between 1 and 60),
    last_name       text not null check (length(last_name) between 1 and 60),
    phone           text check (length(phone) <= 40),
    relationship    text check (length(relationship) <= 40),
    scouts          jsonb not null default '[]' check (private.valid_join_scouts(scouts)),
    note            text check (length(note) <= 1000),
    status          text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
    decline_reason  text check (length(decline_reason) <= 500),
    family_id       uuid references public.families(id) on delete set null,
    decided_by      uuid references public.adults(id) on delete set null,
    decided_at      timestamptz,
    created_at      timestamptz not null default now()
);
create unique index join_requests_one_open on public.join_requests(user_id) where status = 'pending';
create index join_requests_status_idx on public.join_requests(status, created_at);

-- New requests: always the signed-in person's own, with the email they signed in with, and only
-- for people who aren't on the roster. A few a month per person; a cap on the whole queue.
create or replace function private.join_request_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    new.user_id := auth.uid();
    if new.user_id is null then
        raise exception 'Sign in first' using errcode = '42501';
    end if;
    select lower(u.email) into new.email from auth.users u where u.id = new.user_id;
    if new.email is null then
        raise exception 'Sign in first' using errcode = '42501';
    end if;
    if exists (select 1 from public.adults a where (a.user_id = new.user_id or a.email = new.email) and a.is_active) then
        raise exception 'You are already on the roster' using errcode = '23505';
    end if;
    if (select count(*) from public.join_requests r
         where r.user_id = new.user_id and r.created_at > now() - interval '30 days') >= 3 then
        raise exception 'Too many requests. Email info@pack361.org instead.' using errcode = '54000';
    end if;
    if (select count(*) from public.join_requests r where r.status = 'pending') >= 50 then
        raise exception 'Too many requests are waiting. Email info@pack361.org instead.' using errcode = '54000';
    end if;
    new.first_name := trim(new.first_name);
    new.last_name := trim(new.last_name);
    new.phone := nullif(trim(new.phone), '');
    new.relationship := nullif(trim(new.relationship), '');
    new.note := nullif(trim(new.note), '');
    new.status := 'pending';
    new.decline_reason := null;
    new.family_id := null;
    new.decided_by := null;
    new.decided_at := null;
    new.created_at := now();
    return new;
end;
$$;

create trigger join_requests_insert
    before insert on public.join_requests
    for each row execute function private.join_request_insert();

revoke all on public.join_requests from anon, authenticated;
grant select, insert, delete on public.join_requests to authenticated;
alter table public.join_requests enable row level security;

create policy join_requests_read on public.join_requests for select to authenticated
    using (user_id = auth.uid() or private.is_admin());
create policy join_requests_insert on public.join_requests for insert to authenticated
    with check (user_id = auth.uid());
-- Only admins delete (clearing old ones), so the limit on requests per person holds.
create policy join_requests_delete on public.join_requests for delete to authenticated
    using (private.is_admin());

-- Approve: add the family (or use an existing one), the parent and the scouts the admin kept,
-- each with the den the admin picked. Returns the family's id.
create or replace function public.approve_join_request(
    p_request uuid,
    p_family uuid,
    p_family_name text,
    p_scouts jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
    r public.join_requests;
    fam uuid := p_family;
    s jsonb;
    den uuid;
begin
    if not private.is_admin() then
        raise exception 'Only pack admins can add people to the roster' using errcode = '42501';
    end if;
    select * into r from public.join_requests where id = p_request for update;
    if r.id is null or r.status <> 'pending' then
        raise exception 'That request was already handled' using errcode = 'P0002';
    end if;
    if exists (select 1 from public.adults a where a.email = r.email) then
        raise exception 'Someone on the roster already has that email' using errcode = '23505';
    end if;
    if jsonb_typeof(coalesce(p_scouts, '[]')) <> 'array' or jsonb_array_length(coalesce(p_scouts, '[]')) > 6 then
        raise exception 'Too many scouts' using errcode = '22023';
    end if;

    if fam is null then
        insert into public.families (family_name)
        values (left(coalesce(nullif(trim(p_family_name), ''), r.last_name), 80))
        returning id into fam;
    elsif not exists (select 1 from public.families f where f.id = fam) then
        raise exception 'Unknown family' using errcode = '23503';
    else
        update public.families set is_active = true where id = fam and not is_active;
    end if;

    insert into public.adults (family_id, first_name, last_name, email, phone, relationship, role)
    values (fam, r.first_name, r.last_name, r.email, r.phone, r.relationship, 'parent');

    for s in select * from jsonb_array_elements(coalesce(p_scouts, '[]')) loop
        if length(trim(coalesce(s->>'first_name', ''))) not between 1 and 60
           or length(trim(coalesce(s->>'last_name', ''))) not between 1 and 60 then
            raise exception 'Each scout needs a first and last name' using errcode = '22023';
        end if;
        den := nullif(s->>'den_id', '')::uuid;
        if den is not null and not exists (select 1 from public.dens d where d.id = den) then
            raise exception 'Unknown den' using errcode = '23503';
        end if;
        insert into public.scouts (family_id, den_id, first_name, last_name)
        values (fam, den, trim(s->>'first_name'), trim(s->>'last_name'));
    end loop;

    update public.join_requests
       set status = 'approved', family_id = fam, decided_by = private.current_adult_id(), decided_at = now(),
           scouts = '[]', phone = null, note = null
     where id = r.id;
    return fam;
end;
$$;

create or replace function public.decline_join_request(p_request uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
    if not private.is_admin() then
        raise exception 'Only pack admins can answer requests' using errcode = '42501';
    end if;
    update public.join_requests
       set status = 'declined', decline_reason = left(nullif(trim(p_reason), ''), 500),
           decided_by = private.current_adult_id(), decided_at = now(),
           scouts = '[]', phone = null, note = null
     where id = p_request and status = 'pending';
    if not found then
        raise exception 'That request was already handled' using errcode = 'P0002';
    end if;
end;
$$;

revoke all on function public.approve_join_request(uuid, uuid, text, jsonb) from public, anon;
revoke all on function public.decline_join_request(uuid, text) from public, anon;
grant execute on function public.approve_join_request(uuid, uuid, text, jsonb) to authenticated;
grant execute on function public.decline_join_request(uuid, text) to authenticated;
