-- Security fixes (review 2026-10-13).
--   1. Leaders-only events: their schedule, packing list, volunteer jobs and job sign-ups are
--      readable only by people who can see the event (parents can't sign up for those jobs
--      either). Leaders keep full access; the write policies are unchanged.
--   2. public.register_push_subscription(): a saved device moves to a new login only when it
--      is the same browser subscription (same keys). Otherwise it stays with its owner.
--   3. "I can help" offers can't be moved to a closed role.
--   4. Storage helpers (uploads_today, document_file_in_use, receipt_locked) only answer about
--      the caller's own files (or, for committee, any document or receipt).
--   5. News posts tied to an event are readable only by people who can see that event.
--   6. copy_event(): the copy is not shown on the join page until a leader turns it on.
--   7. Gear: a family can have at most 10 open requests (requested, approved or out).
--   8. Help wanted: public.role_interest_alerts and public.claim_role_interest_alert() so the
--      app alerts committee about an offer at most once a day per person per role.
--   9. public.purge_join_requests(): the daily job deletes decided join requests after 90 days.
-- Safe to run once on the live database. Only old decided join requests are ever deleted,
-- and only when the daily job calls the purge.
-- All or nothing: if any statement fails, nothing changes.
begin;

-- -----------------------------------------------------------------------------
-- 1. Leaders-only events. "event_id in (select e.id from public.events e)" runs under the
--    events policies: members see events that aren't leaders-only, leaders see every event.
--    A packing list or job with no event (the default campout list, standing jobs) stays
--    visible to every member.
-- -----------------------------------------------------------------------------
alter policy itinerary_read on public.itinerary_items
    using (((select private.is_member()) AND (event_id in (select e.id from public.events e))));
alter policy packing_read on public.packing_items
    using (((select private.is_member()) AND ((event_id IS NULL) OR (event_id in (select e.id from public.events e)))));
alter policy slots_read on public.volunteer_slots
    using (((select private.is_member()) AND ((event_id IS NULL) OR (event_id in (select e.id from public.events e)))));
-- Sign-ups follow their job (the job's own read policy above decides).
alter policy signups_read on public.volunteer_signups
    using (((select private.is_member()) AND (slot_id in (select s.id from public.volunteer_slots s))));
alter policy signups_add_self on public.volunteer_signups
    with check (((adult_id = (select private.current_adult_id())) AND (slot_id in (select s.id from public.volunteer_slots s))));

-- -----------------------------------------------------------------------------
-- 2. Save this phone or browser for alerts. A device saved under another login moves to the
--    signed-in adult only when it's the same browser subscription (same keys), as on a shared
--    tablet. Knowing someone's endpoint alone isn't enough to take their alerts.
-- -----------------------------------------------------------------------------
create or replace function public.register_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
    me uuid := private.current_adult_id();
begin
    if me is null then
        raise exception 'Only people on the pack roster can turn on alerts' using errcode = '42501';
    end if;
    if coalesce(p_endpoint, '') !~ '^https://' or length(p_endpoint) > 2000
       or coalesce(trim(p_p256dh), '') = '' or length(p_p256dh) > 500
       or coalesce(trim(p_auth), '') = '' or length(p_auth) > 500 then
        raise exception 'Invalid subscription' using errcode = '22023';
    end if;
    insert into public.push_subscriptions as ps (adult_id, endpoint, p256dh, auth, user_agent)
    values (me, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
    on conflict (endpoint) do update
       set adult_id = excluded.adult_id, p256dh = excluded.p256dh, auth = excluded.auth,
           user_agent = excluded.user_agent, created_at = now()
     where ps.adult_id = excluded.adult_id
        or (ps.p256dh = excluded.p256dh and ps.auth = excluded.auth);
    if not found then
        raise exception 'This device is saved for someone else; turn alerts off there first' using errcode = '42501';
    end if;
end $$;
revoke all on function public.register_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.register_push_subscription(text, text, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. "I can help" offers: an edited offer must still be for an open role (as when offering).
-- -----------------------------------------------------------------------------
alter policy role_interest_update on public.role_interest
    using ((adult_id = (select private.current_adult_id())))
    with check (((adult_id = (select private.current_adult_id()))
                 AND (EXISTS (SELECT 1 FROM public.pack_roles r WHERE ((r.id = role_interest.role_id) AND r.open)))));

-- -----------------------------------------------------------------------------
-- 4. Storage helpers answer only about the caller's own files. The storage policies call
--    them only for the caller's own folder (and, for documents, for committee), so what
--    they allow is unchanged.
-- -----------------------------------------------------------------------------
-- Uploads today in my own photo folder (<my adult id>) or receipt folder (r/<my adult id>).
-- Any other folder counts as 0.
create or replace function private.uploads_today(p_bucket text, p_folder text)
returns bigint language sql stable security definer set search_path = '' as $$
    select case when p_folder in (m.me, 'r/' || m.me)
                then (select count(*) from storage.objects o
                       where o.bucket_id = p_bucket
                         and o.name like p_folder || '/%'
                         and o.created_at > now() - interval '1 day')
                else 0 end
      from (select private.current_adult_id()::text as me) m
$$;

-- Is a document using this file? Answered for leaders about their own docs/<adult id>/ files,
-- and for committee about any file. Otherwise false.
create or replace function private.document_file_in_use(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
    select private.is_leader()
       and (private.is_committee() or p_path like 'docs/' || private.current_adult_id()::text || '/%')
       and exists (select 1 from public.documents d where d.storage_path = p_path)
$$;

-- Is this receipt on a request leadership has acted on? Answered about my own r/<adult id>/
-- receipts, and for committee about any receipt. Otherwise false.
create or replace function private.receipt_locked(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
    select (private.is_committee() or p_path like 'r/' || private.current_adult_id()::text || '/%')
       and exists (select 1 from public.expenses e where e.receipt_path = p_path and e.status <> 'submitted')
$$;

-- -----------------------------------------------------------------------------
-- 5. News posts about an event (event messages) follow the event: a post about a
--    leaders-only event is for leaders only.
-- -----------------------------------------------------------------------------
alter policy announcements_read on public.announcements
    using (((select private.is_member())
            AND ((den_id IS NULL) OR (select private.is_leader()) OR (den_id in (select private.my_den_ids())))
            AND ((event_id IS NULL) OR private.can_see_event(event_id))));

-- -----------------------------------------------------------------------------
-- 6. Copy an event (same as before, except the copy is not shown on the join page and has
--    no join-page note until a leader turns that on for it).
-- -----------------------------------------------------------------------------
create or replace function public.copy_event(p_from uuid, p_start date)
returns uuid language plpgsql set search_path = '' as $$
declare
    v_src   public.events;
    v_day   date;
    v_shift int;
    v_cost  boolean;
    v_new   uuid;
begin
    if not private.is_leader() then
        raise exception 'Only leaders can copy events' using errcode = '42501';
    end if;
    if p_start is null then
        raise exception 'Pick the new date' using errcode = '22023';
    end if;
    select * into v_src from public.events where id = p_from;
    if v_src.id is null then
        raise exception 'Event not found' using errcode = 'P0002';
    end if;
    v_day   := (v_src.starts_at at time zone 'America/New_York')::date;
    v_shift := p_start - v_day;
    v_cost  := private.is_committee();

    insert into public.events (
        title, category, starts_at, ends_at, all_day, location_name, address, details, signup_url,
        den_id, ranks, leaders_only, rsvp_enabled, rsvp_by,
        fee_family_cents, fee_scout_cents, fee_adult_cents, camping_nights,
        public_on_join, public_blurb, slip_required, slip_text, slip_document_id, slip_due,
        links, sections, source, created_by)
    values (
        v_src.title, v_src.category,
        private.shift_local(v_src.starts_at, v_day, p_start),
        case when v_src.ends_at is not null then private.shift_local(v_src.ends_at, v_day, p_start) end,
        v_src.all_day, v_src.location_name, v_src.address, v_src.details, v_src.signup_url,
        v_src.den_id, v_src.ranks, v_src.leaders_only, v_src.rsvp_enabled, v_src.rsvp_by + v_shift,
        case when v_cost then v_src.fee_family_cents end,
        case when v_cost then v_src.fee_scout_cents end,
        case when v_cost then v_src.fee_adult_cents end,
        v_src.camping_nights,
        false, null, v_src.slip_required, v_src.slip_text, v_src.slip_document_id,
        v_src.slip_due + v_shift,
        v_src.links, v_src.sections, 'manual', private.current_adult_id())
    returning id into v_new;

    -- The RSVP limit (added by the RSVP waitlist migration), when that column is there.
    if jsonb_typeof(to_jsonb(v_src) -> 'rsvp_limit') = 'number' then
        execute 'update public.events set rsvp_limit = $1 where id = $2'
          using (to_jsonb(v_src) ->> 'rsvp_limit')::int, v_new;
    end if;

    insert into public.itinerary_items (event_id, starts_at, title, location, notes)
    select v_new, private.shift_local(i.starts_at, v_day, p_start), i.title, i.location, i.notes
      from public.itinerary_items i
     where i.event_id = p_from;

    insert into public.packing_items (event_id, category, label, detail, required, sort_order)
    select v_new, p.category, p.label, p.detail, p.required, p.sort_order
      from public.packing_items p
     where p.event_id = p_from;

    insert into public.volunteer_slots (event_id, role_title, shift_label, starts_at, capacity, is_urgent, notes)
    select v_new, s.role_title, s.shift_label,
           case when s.starts_at is not null then private.shift_local(s.starts_at, v_day, p_start) end,
           s.capacity, s.is_urgent, s.notes
      from public.volunteer_slots s
     where s.event_id = p_from;

    return v_new;
end;
$$;
revoke execute on function public.copy_event(uuid, date) from public, anon;
grant execute on function public.copy_event(uuid, date) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. Gear loans guard (same as before, plus: a family can have at most 10 open requests,
--    counting ones that are requested, approved or out).
-- -----------------------------------------------------------------------------
create or replace function private.gear_loans_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
    v_item public.gear_items;
    v_used int;
    v_holds_old boolean;
begin
    -- Lock the item so two approvals at once can't both take the last one.
    select * into v_item from public.gear_items where id = new.item_id for update;
    if not found then
        raise exception 'That item was not found' using errcode = '22023';
    end if;

    if tg_op = 'INSERT' then
        if not v_item.active then
            raise exception 'That item is not available to borrow' using errcode = '22023';
        end if;
        -- One family's requests at a time, so two at once can't both slip under the cap.
        perform pg_advisory_xact_lock(hashtextextended('gear_loans_family:' || new.family_id::text, 0));
        if (select count(*) from public.gear_loans l
             where l.family_id = new.family_id
               and l.status in ('requested', 'approved', 'out')) >= 10 then
            raise exception 'You already have 10 open gear requests. Please wait for those first.' using errcode = '22023';
        end if;
        new.status       := 'requested';
        new.requested_at := now();
        new.out_at       := null;
        new.returned_at  := null;
        new.decided_by   := null;
        new.decided_at   := null;
        new.reminded_at  := null;
        new.leader_note  := null;
        v_holds_old      := false;
    else
        new.item_id      := old.item_id;
        new.family_id    := old.family_id;
        new.adult_id     := old.adult_id;
        new.requested_at := old.requested_at;
        v_holds_old      := old.status in ('approved', 'out');
        if new.status is distinct from old.status then
            if new.status in ('approved', 'declined') then
                new.decided_by := private.current_adult_id();
                new.decided_at := now();
            elsif new.status = 'out' then
                new.out_at := now();
                if new.decided_at is null then
                    new.decided_by := private.current_adult_id();
                    new.decided_at := now();
                end if;
            elsif new.status = 'returned' then
                new.returned_at := now();
            elsif new.status = 'requested' then
                new.decided_by  := null;
                new.decided_at  := null;
                new.out_at      := null;
                new.returned_at := null;
            end if;
        end if;
        -- A new return date starts the reminders over.
        if new.due_on is distinct from old.due_on then
            new.reminded_at := null;
        end if;
    end if;

    -- (Only when the number asked for changes: the closet may have shrunk since.)
    if (tg_op = 'INSERT' or new.quantity is distinct from old.quantity) and new.quantity > v_item.quantity then
        raise exception 'The pack has only % of these', v_item.quantity using errcode = '22023';
    end if;

    if new.status in ('approved', 'out') and (not v_holds_old or new.quantity > old.quantity) then
        select coalesce(sum(l.quantity), 0)::int into v_used
          from public.gear_loans l
         where l.item_id = new.item_id
           and l.status in ('approved', 'out')
           and l.id <> new.id;
        if v_used + new.quantity > v_item.quantity then
            raise exception 'Not enough left: % of % available right now',
                greatest(v_item.quantity - v_used, 0), v_item.quantity using errcode = '22023';
        end if;
    end if;
    new.note := nullif(trim(new.note), '');
    return new;
end;
$$;
revoke execute on function private.gear_loans_guard() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 8. Help wanted alerts: when someone offers to help, the app alerts committee at most once
--    a day per person per role (offering, withdrawing and offering again doesn't re-alert).
--    The table is only written by claim_role_interest_alert(); nobody reads it directly.
-- -----------------------------------------------------------------------------
create table public.role_interest_alerts (
    role_id   uuid not null references public.pack_roles(id) on delete cascade,
    adult_id  uuid not null references public.adults(id) on delete cascade,
    sent_at   timestamptz not null default now(),
    primary key (role_id, adult_id)
);
create index role_interest_alerts_adult_idx on public.role_interest_alerts(adult_id);
revoke all on public.role_interest_alerts from anon, authenticated;
alter table public.role_interest_alerts enable row level security;

-- True when the app should send the "someone offered to help" alert for my offer on this
-- role now (and records that it did); false when one went out in the last 24 hours, or the
-- role isn't open.
create or replace function public.claim_role_interest_alert(p_role_id uuid)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare
    me uuid := private.current_adult_id();
begin
    if me is null or not private.is_member() then
        raise exception 'Only people on the pack roster can offer to help' using errcode = '42501';
    end if;
    if not exists (select 1 from public.pack_roles r where r.id = p_role_id and r.open) then
        return false;
    end if;
    insert into public.role_interest_alerts as a (role_id, adult_id, sent_at)
    values (p_role_id, me, now())
    on conflict (role_id, adult_id) do update
       set sent_at = excluded.sent_at
     where a.sent_at < now() - interval '24 hours';
    return found;
end $$;
revoke all on function public.claim_role_interest_alert(uuid) from public, anon;
grant execute on function public.claim_role_interest_alert(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 9. Join requests: approved or declined requests are deleted 90 days after the decision
--    (or after they were sent, if no decision time was saved). Pending ones are kept.
--    Called by the daily job with the secret key; returns how many were deleted.
-- -----------------------------------------------------------------------------
create or replace function public.purge_join_requests()
returns int language plpgsql volatile security definer set search_path = '' as $$
declare
    n int;
begin
    delete from public.join_requests j
     where j.status <> 'pending'
       and coalesce(j.decided_at, j.created_at) < now() - interval '90 days';
    get diagnostics n = row_count;
    return n;
end $$;
revoke all on function public.purge_join_requests() from public, anon, authenticated;
grant execute on function public.purge_join_requests() to service_role;

commit;
