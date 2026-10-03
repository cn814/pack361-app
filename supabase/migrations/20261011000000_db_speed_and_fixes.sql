-- Database speed-up and small fixes (review 2026-10-03).
--   1. Row-level security: no-argument helpers (private.is_member(), is_leader(), is_admin(),
--      is_committee(), my_family_id(), current_adult_id(), auth.uid(), ...) are wrapped as
--      (select private.fn()) so Postgres runs them once per query instead of once per row.
--   2. Per-row helpers (is_my_scout(scout_id), leads_den(den_id), can_review_scout(scout_id),
--      family_in_den(den_id), adult_in_my_family(adult_id), leads_den(meeting_den(meeting_id)),
--      owns_charge(...), can_see_poll(id)) become "col in (select private.my_..._ids())": one
--      lookup per query. Who can see or change what is unchanged. Where the old helper let the
--      committee through (leads_den, can_review_scout), the policy keeps a separate
--      (select private.is_committee()) branch, so committee access is exactly as before.
--   3. attendance_summary() adds things up once for everyone instead of once per scout.
--   4. Indexes for the filters the app and the policies use.
--   5. To-do "hide" also accepts the leaders' 'training-import' reminder.
--   6. Editing an announcement follows the same rules as posting one (a non-admin author must
--      still be a leader, and a den post must be for a den they lead).
--   7. public.register_push_subscription(): the same phone or browser re-subscribing under a
--      different login moves to that person instead of failing.
--   8. private.going_to_event() is no longer callable by signed-out visitors.
--   9. volunteer_roster() returns nothing for a leaders-only event the caller can't see.
-- Safe to run once on the live database; nothing here deletes data.
-- All or nothing: if any statement fails, nothing changes.
begin;

-- -----------------------------------------------------------------------------
-- 2. Set-returning helpers: each runs once per query, as the table owner (like the helpers
--    they replace), and returns the ids the signed-in adult may use.
-- -----------------------------------------------------------------------------

-- Scouts in my family (same as private.is_my_scout).
create or replace function private.my_scout_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
    select s.id from public.scouts s
      join public.adults a on a.family_id = s.family_id
     where a.user_id = auth.uid() and a.is_active
$$;

-- Dens my family's active scouts are in (same as private.family_in_den).
create or replace function private.my_den_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
    select distinct s.den_id from public.scouts s
      join public.adults a on a.family_id = s.family_id
     where s.is_active and s.den_id is not null and a.user_id = auth.uid() and a.is_active
$$;

-- Dens I am a den leader of. Not the committee branch of private.leads_den(): policies check
-- (select private.is_committee()) alongside it.
create or replace function private.my_led_den_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
    select dl.den_id from public.den_leaders dl
      join public.adults a on a.id = dl.adult_id
     where a.user_id = auth.uid() and a.is_active
$$;

-- Den meetings of dens I am a den leader of (leads_den(meeting_den(id)) minus the committee branch).
create or replace function private.led_meeting_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
    select m.id from public.den_meetings m
      join public.den_leaders dl on dl.den_id = m.den_id
      join public.adults a on a.id = dl.adult_id
     where a.user_id = auth.uid() and a.is_active
$$;

-- Scouts in dens I am a den leader of (can_review_scout() minus the committee branch).
create or replace function private.reviewable_scout_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
    select s.id from public.scouts s
      join public.den_leaders dl on dl.den_id = s.den_id
      join public.adults a on a.id = dl.adult_id
     where a.user_id = auth.uid() and a.is_active
$$;

-- Me and the other adults in my family (same as private.adult_in_my_family).
create or replace function private.my_family_adult_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
    select other.id from public.adults me
      join public.adults other
        on other.id = me.id or (me.family_id is not null and other.family_id = me.family_id)
     where me.user_id = auth.uid() and me.is_active
$$;

revoke all on function private.my_scout_ids() from public, anon;
revoke all on function private.my_den_ids() from public, anon;
revoke all on function private.my_led_den_ids() from public, anon;
revoke all on function private.led_meeting_ids() from public, anon;
revoke all on function private.reviewable_scout_ids() from public, anon;
revoke all on function private.my_family_adult_ids() from public, anon;
grant execute on function private.my_scout_ids() to authenticated;
grant execute on function private.my_den_ids() to authenticated;
grant execute on function private.my_led_den_ids() to authenticated;
grant execute on function private.led_meeting_ids() to authenticated;
grant execute on function private.reviewable_scout_ids() to authenticated;
grant execute on function private.my_family_adult_ids() to authenticated;

-- -----------------------------------------------------------------------------
-- 1 + 2. Policies, rewritten from the latest definition of each (same rules, same commands and
--        roles; alter policy keeps those). owns_charge(family_id, adult_id) is written out inline.
-- -----------------------------------------------------------------------------
alter policy trainings_delete on public.adult_trainings
    using (((adult_id = (select private.current_adult_id())) OR (select private.is_admin())));
alter policy trainings_insert on public.adult_trainings
    with check (((adult_id = (select private.current_adult_id())) OR (select private.is_admin())));
alter policy trainings_read on public.adult_trainings
    using (((adult_id = (select private.current_adult_id())) OR (select private.is_leader())));
alter policy trainings_update on public.adult_trainings
    using (((adult_id = (select private.current_adult_id())) OR (select private.is_admin())))
    with check (((adult_id = (select private.current_adult_id())) OR (select private.is_admin())));
alter policy adults_admin_insert on public.adults
    with check ((select private.is_admin()));
alter policy adults_admin_update on public.adults
    using ((select private.is_admin()))
    with check ((select private.is_admin()));
alter policy adults_read on public.adults
    using (((user_id = (select auth.uid())) OR ((family_id IS NOT NULL) AND (family_id = (select private.my_family_id()))) OR (select private.is_leader())));
alter policy adults_update_self on public.adults
    using ((user_id = (select auth.uid())))
    with check ((user_id = (select auth.uid())));
alter policy adv_imports_insert on public.advancement_imports
    with check (((select private.is_admin()) AND (imported_by = (select private.current_adult_id()))));
alter policy adv_imports_read on public.advancement_imports
    using ((select private.is_leader()));
alter policy adv_sub_delete on public.advancement_submissions
    using ((((scout_id in (select private.my_scout_ids())) AND (status = 'submitted')) OR (select private.is_admin())));
alter policy adv_sub_family_edit on public.advancement_submissions
    using (((scout_id in (select private.my_scout_ids())) AND (status in ('submitted', 'returned'))))
    with check (((scout_id in (select private.my_scout_ids())) AND (status = 'submitted')));
alter policy adv_sub_insert on public.advancement_submissions
    with check (((scout_id in (select private.my_scout_ids())) AND (submitted_by = (select private.current_adult_id())) AND (status = 'submitted') AND (reviewed_by IS NULL)));
alter policy adv_sub_leader_insert on public.advancement_submissions
    with check ((((select private.is_committee()) or scout_id in (select private.reviewable_scout_ids())) AND (submitted_by = (select private.current_adult_id())) AND (status in ('submitted', 'approved'))));
alter policy adv_sub_read on public.advancement_submissions
    using (((scout_id in (select private.my_scout_ids())) OR ((select private.is_committee()) or scout_id in (select private.reviewable_scout_ids()))));
alter policy adv_sub_review on public.advancement_submissions
    using (((select private.is_committee()) or scout_id in (select private.reviewable_scout_ids())))
    with check (((select private.is_committee()) or scout_id in (select private.reviewable_scout_ids())));
alter policy adventures_read on public.adventures
    using ((select private.is_member()));
alter policy adventures_write on public.adventures
    using ((select private.is_admin()))
    with check ((select private.is_admin()));
alter policy announcements_delete on public.announcements
    using (((author_id = (select private.current_adult_id())) OR (select private.is_admin())));
alter policy announcements_insert on public.announcements
    with check (((select private.is_leader()) AND (author_id = (select private.current_adult_id())) AND ((den_id IS NULL) OR ((select private.is_committee()) or den_id in (select private.my_led_den_ids())))));
alter policy announcements_read on public.announcements
    using (((select private.is_member()) AND ((den_id IS NULL) OR (select private.is_leader()) OR (den_id in (select private.my_den_ids())))));
alter policy charges_committee_amount on public.charges
    using (((select private.is_committee()) AND (status in ('open', 'reported'))))
    with check (((select private.is_committee()) AND (status in ('open', 'reported'))));
alter policy charges_read on public.charges
    using (((select private.is_committee()) OR ((family_id IS NOT NULL AND family_id = (select private.my_family_id())) OR (family_id IS NULL AND adult_id = (select private.current_adult_id())))));
alter policy council_events_read on public.council_events
    using ((select private.is_leader()));
alter policy council_events_update on public.council_events
    using ((select private.is_committee()))
    with check ((select private.is_committee()));
alter policy den_leaders_read on public.den_leaders
    using ((select private.is_member()));
alter policy den_leaders_write on public.den_leaders
    using ((select private.is_admin()))
    with check ((select private.is_admin()));
alter policy attendance_read on public.den_meeting_attendance
    using ((((select private.is_committee()) or meeting_id in (select private.led_meeting_ids())) OR (scout_id in (select private.my_scout_ids()))));
alter policy attendance_remove on public.den_meeting_attendance
    using (((select private.is_committee()) or meeting_id in (select private.led_meeting_ids())));
alter policy attendance_write on public.den_meeting_attendance
    with check ((((select private.is_committee()) or meeting_id in (select private.led_meeting_ids())) AND ((select private.is_committee()) or scout_id in (select private.reviewable_scout_ids()))));
alter policy den_rsvps_read on public.den_meeting_rsvps
    using (((scout_id in (select private.my_scout_ids())) OR ((select private.is_committee()) or meeting_id in (select private.led_meeting_ids()))));
alter policy meetings_read on public.den_meetings
    using ((((select private.is_committee()) or den_id in (select private.my_led_den_ids())) OR (den_id in (select private.my_den_ids()))));
alter policy meetings_write on public.den_meetings
    using (((select private.is_committee()) or den_id in (select private.my_led_den_ids())))
    with check (((select private.is_committee()) or den_id in (select private.my_led_den_ids())));
alter policy dens_read on public.dens
    using ((select private.is_member()));
alter policy dens_write on public.dens
    using ((select private.is_admin()))
    with check ((select private.is_admin()));
alter policy documents_delete on public.documents
    using ((select private.is_committee()));
alter policy documents_insert on public.documents
    with check (((select private.is_leader()) AND (uploaded_by = (select private.current_adult_id())) AND (storage_path like (('docs/' || ((select private.current_adult_id()))::text) || '/%')) AND ((audience <> 'committee') OR (select private.is_committee())) AND ((den_id IS NULL) OR ((select private.is_committee()) or den_id in (select private.my_led_den_ids())))));
alter policy documents_read on public.documents
    using (((select private.is_member()) AND ((audience = 'everyone') OR ((audience = 'leaders') AND (select private.is_leader())) OR ((audience = 'committee') AND (select private.is_committee()))) AND ((den_id IS NULL) OR (select private.is_leader()) OR (den_id in (select private.my_den_ids()))) AND ((archived_at IS NULL) OR (select private.is_leader()))));
alter policy documents_update on public.documents
    using (((select private.is_leader()) AND ((select private.is_committee()) OR (uploaded_by = (select private.current_adult_id())))))
    with check (((select private.is_leader()) AND ((select private.is_committee()) OR ((uploaded_by = (select private.current_adult_id())) AND (audience <> 'committee') AND ((den_id IS NULL) OR ((select private.is_committee()) or den_id in (select private.my_led_den_ids())))))));
alter policy event_attendance_read on public.event_attendance
    using (((select private.is_leader()) OR (scout_id in (select private.my_scout_ids()))));
alter policy rsvps_leader_delete on public.event_rsvps
    using ((select private.is_leader()));
alter policy rsvps_read on public.event_rsvps
    using (((select private.is_leader()) OR ((family_id IS NOT NULL) AND (family_id = (select private.my_family_id()))) OR (adult_id = (select private.current_adult_id()))));
alter policy event_signal_read on public.event_signal
    using (((select private.is_leader()) OR (private.can_see_event(event_id) AND private.going_to_event(event_id))));
alter policy event_signal_write on public.event_signal
    using ((select private.is_leader()))
    with check ((select private.is_leader()));
alter policy events_read on public.events
    using (((select private.is_member()) AND ((NOT leaders_only) OR (select private.is_leader()))));
alter policy events_write on public.events
    using ((select private.is_leader()))
    with check ((select private.is_leader()));
alter policy expenses_delete on public.expenses
    using (((select private.is_committee()) OR ((adult_id = (select private.current_adult_id())) AND (status = 'submitted'))));
alter policy expenses_insert on public.expenses
    with check (((select private.is_committee()) OR ((select private.is_member()) AND (adult_id = (select private.current_adult_id())) AND (paid_by = 'member') AND (status = 'submitted'))));
alter policy expenses_read on public.expenses
    using (((select private.is_committee()) OR ((select private.is_member()) AND (adult_id = (select private.current_adult_id())))));
alter policy expenses_update on public.expenses
    using (((select private.is_committee()) OR ((adult_id = (select private.current_adult_id())) AND (status = 'submitted'))))
    with check (((select private.is_committee()) OR ((adult_id = (select private.current_adult_id())) AND (status = 'submitted'))));
alter policy families_read on public.families
    using (((id = (select private.my_family_id())) OR (select private.is_leader())));
alter policy families_write on public.families
    using ((select private.is_admin()))
    with check ((select private.is_admin()));
alter policy feedback_read on public.feedback
    using (((adult_id = (select private.current_adult_id())) OR (select private.is_admin())));
alter policy feedback_resolve on public.feedback
    using ((select private.is_admin()))
    with check ((select private.is_admin()));
alter policy feedback_send on public.feedback
    with check (((select private.is_member()) AND (adult_id = (select private.current_adult_id())) AND (resolved_at IS NULL)));
alter policy finance_budget_all on public.finance_budget
    using ((select private.is_committee()))
    with check ((select private.is_committee()));
alter policy finance_categories_add on public.finance_categories
    with check (((select private.is_committee()) AND (source IS NULL)));
alter policy finance_categories_delete on public.finance_categories
    using (((select private.is_committee()) AND (source IS NULL)));
alter policy finance_categories_edit on public.finance_categories
    using ((select private.is_committee()))
    with check ((select private.is_committee()));
alter policy finance_categories_read on public.finance_categories
    using ((select private.is_member()));
alter policy finance_income_all on public.finance_income
    using ((select private.is_committee()))
    with check ((select private.is_committee()));
alter policy gb_campaigns_edit on public.givebutter_campaigns
    using ((select private.is_admin()))
    with check ((select private.is_admin()));
alter policy gb_campaigns_read on public.givebutter_campaigns
    using ((select private.is_member()));
alter policy gb_orders_read on public.givebutter_orders
    using ((((family_id IS NOT NULL) AND (family_id = (select private.my_family_id()))) OR (select private.is_committee()) OR ((select private.is_leader()) AND (campaign_id IS DISTINCT FROM (select private.dues_campaign_id())))));
alter policy guide_read on public.guide_pages
    using (((select private.is_member()) AND (is_published OR (select private.is_leader()))));
alter policy guide_write on public.guide_pages
    using ((select private.is_committee()))
    with check ((select private.is_committee()));
alter policy health_family_insert on public.health_forms
    with check (((status = 'submitted') AND (((scout_id IS NOT NULL) AND (scout_id in (select private.my_scout_ids()))) OR ((adult_id IS NOT NULL) AND (adult_id in (select private.my_family_adult_ids()))))));
alter policy health_family_update on public.health_forms
    using ((((scout_id IS NOT NULL) AND (scout_id in (select private.my_scout_ids()))) OR ((adult_id IS NOT NULL) AND (adult_id in (select private.my_family_adult_ids())))))
    with check (((status = 'submitted') AND (((scout_id IS NOT NULL) AND (scout_id in (select private.my_scout_ids()))) OR ((adult_id IS NOT NULL) AND (adult_id in (select private.my_family_adult_ids()))))));
alter policy health_leader_write on public.health_forms
    using ((select private.is_leader()))
    with check ((select private.is_leader()));
alter policy health_read on public.health_forms
    using (((select private.is_leader()) OR ((scout_id IS NOT NULL) AND (scout_id in (select private.my_scout_ids()))) OR ((adult_id IS NOT NULL) AND (adult_id in (select private.my_family_adult_ids())))));
alter policy inbox_reads_own on public.inbox_reads
    using ((adult_id = (select private.current_adult_id())))
    with check ((adult_id = (select private.current_adult_id())));
alter policy itinerary_read on public.itinerary_items
    using ((select private.is_member()));
alter policy itinerary_write on public.itinerary_items
    using ((select private.is_leader()))
    with check ((select private.is_leader()));
alter policy join_requests_delete on public.join_requests
    using ((select private.is_admin()));
alter policy join_requests_insert on public.join_requests
    with check ((user_id = (select auth.uid())));
alter policy join_requests_read on public.join_requests
    using (((user_id = (select auth.uid())) OR (select private.is_admin())));
alter policy newsletter_sends_read on public.newsletter_sends
    using ((select private.is_admin()));
alter policy settings_council_insert on public.pack_settings
    with check (((key = 'council_calendar_url') AND (select private.is_committee())));
alter policy settings_council_update on public.pack_settings
    using (((key = 'council_calendar_url') AND (select private.is_committee())))
    with check (((key = 'council_calendar_url') AND (select private.is_committee())));
alter policy settings_read on public.pack_settings
    using ((select private.is_member()));
alter policy settings_write on public.pack_settings
    using ((select private.is_admin()))
    with check ((select private.is_admin()));
alter policy packing_read on public.packing_items
    using ((select private.is_member()));
alter policy packing_write on public.packing_items
    using ((select private.is_leader()))
    with check ((select private.is_leader()));
alter policy payments_read on public.payments
    using (((select private.is_committee()) OR ((family_id IS NOT NULL AND family_id = (select private.my_family_id())) OR (family_id IS NULL AND adult_id = (select private.current_adult_id())))));
alter policy permission_slips_delete on public.permission_slips
    using ((((kind = 'signed') AND (scout_id in (select private.my_scout_ids()))) OR (select private.is_leader())));
alter policy permission_slips_insert on public.permission_slips
    with check (((select private.is_member()) AND private.can_see_event(event_id) AND ((scout_id in (select private.my_scout_ids())) OR (select private.is_leader()))));
alter policy permission_slips_read on public.permission_slips
    using (((scout_id in (select private.my_scout_ids())) OR (select private.is_leader())));
alter policy flags_read on public.photo_flags
    using (((adult_id = (select private.current_adult_id())) OR (select private.is_leader())));
alter policy flags_resolve on public.photo_flags
    using ((select private.is_leader()))
    with check ((select private.is_leader()));
alter policy photos_delete on public.photos
    using ((select private.is_leader()));
alter policy photos_read on public.photos
    using ((((select private.is_member()) AND (status = 'approved')) OR (uploader_id = (select private.current_adult_id())) OR (select private.is_leader())));
alter policy photos_review on public.photos
    using ((select private.is_leader()))
    with check ((select private.is_leader()));
alter policy photos_upload on public.photos
    with check (((uploader_id = (select private.current_adult_id())) AND ((status = 'pending_review') OR ((status = 'approved') AND (select private.is_leader()))) AND (storage_path like (((select private.current_adult_id()))::text || '/%')) AND ((thumb_path IS NULL) OR (thumb_path like (((select private.current_adult_id()))::text || '/%')))));
alter policy poll_votes_read on public.poll_votes
    using (((adult_id = (select private.current_adult_id())) OR (select private.is_leader())));
alter policy polls_delete on public.polls
    using (((select private.is_admin()) OR ((select private.is_leader()) AND (created_by = (select private.current_adult_id())))));
alter policy polls_edit on public.polls
    using (((select private.is_admin()) OR ((select private.is_leader()) AND (created_by = (select private.current_adult_id())))))
    with check (((select private.is_admin()) OR ((select private.is_leader()) AND (created_by = (select private.current_adult_id())))));
alter policy polls_insert on public.polls
    with check (((select private.is_leader()) AND (created_by = (select private.current_adult_id())) AND ((den_id IS NULL) OR ((select private.is_committee()) or den_id in (select private.my_led_den_ids())))));
alter policy popcorn_read on public.popcorn_sales
    using ((select private.is_member()));
alter policy popcorn_write on public.popcorn_sales
    using ((select private.is_admin()))
    with check ((select private.is_admin()));
alter policy push_own_add on public.push_subscriptions
    with check ((adult_id = (select private.current_adult_id())));
alter policy push_own_read on public.push_subscriptions
    using ((adult_id = (select private.current_adult_id())));
alter policy push_own_remove on public.push_subscriptions
    using ((adult_id = (select private.current_adult_id())));
alter policy scout_adv_import on public.scout_advancement
    with check ((select private.is_admin()));
alter policy scout_adv_read on public.scout_advancement
    using (((scout_id in (select private.my_scout_ids())) OR ((select private.is_committee()) or scout_id in (select private.reviewable_scout_ids()))));
alter policy scout_adv_replace on public.scout_advancement
    using ((select private.is_admin()));
alter policy scouts_family_photo on public.scouts
    using ((family_id = (select private.my_family_id())))
    with check ((family_id = (select private.my_family_id())));
alter policy scouts_read on public.scouts
    using (((family_id = (select private.my_family_id())) OR (select private.is_leader())));
alter policy scouts_write on public.scouts
    using ((select private.is_admin()))
    with check ((select private.is_admin()));
alter policy todo_dismissals_own on public.todo_dismissals
    using ((adult_id = (select private.current_adult_id())))
    with check (((adult_id = (select private.current_adult_id())) AND (select private.is_member())));
alter policy signups_add_self on public.volunteer_signups
    with check ((adult_id = (select private.current_adult_id())));
alter policy signups_read on public.volunteer_signups
    using ((select private.is_member()));
alter policy signups_remove on public.volunteer_signups
    using (((adult_id = (select private.current_adult_id())) OR (select private.is_leader())));
alter policy slots_read on public.volunteer_slots
    using ((select private.is_member()));
alter policy slots_write on public.volunteer_slots
    using ((select private.is_leader()))
    with check ((select private.is_leader()));
alter policy "evidence read" on storage.objects
    using (((bucket_id = 'advancement-evidence') AND (((storage.foldername(name))[1] = ((select private.current_adult_id()))::text) OR (select private.is_leader()))));
alter policy "pack docs delete" on storage.objects
    using (((bucket_id = 'pack-docs') AND (select private.is_leader()) AND ((select private.is_committee()) OR (((storage.foldername(name))[1] = 'docs') AND ((storage.foldername(name))[2] = ((select private.current_adult_id()))::text) AND (NOT private.document_file_in_use(name))))));
alter policy "pack docs read visible" on storage.objects
    using (((bucket_id = 'pack-docs') AND ((EXISTS ( SELECT 1 FROM public.documents d WHERE (d.storage_path = objects.name))) OR ((select private.is_leader()) AND (NOT private.document_file_in_use(name)) AND ((select private.is_committee()) OR (((storage.foldername(name))[1] = 'docs') AND ((storage.foldername(name))[2] = ((select private.current_adult_id()))::text)))))));
alter policy "pack docs upload" on storage.objects
    with check (((bucket_id = 'pack-docs') AND (select private.is_leader()) AND ((storage.foldername(name))[1] = 'docs') AND ((storage.foldername(name))[2] = ((select private.current_adult_id()))::text)));
alter policy "pack photos delete" on storage.objects
    using (((bucket_id = 'pack-photos') AND (select private.is_leader())));
alter policy "pack photos upload own folder" on storage.objects
    with check (((bucket_id = 'pack-photos') AND (select private.is_member()) AND ((storage.foldername(name))[1] = ((select private.current_adult_id()))::text) AND ((select private.is_leader()) OR (private.uploads_today('pack-photos', ((select private.current_adult_id()))::text) < 300))));
alter policy "receipts delete" on storage.objects
    using (((bucket_id = 'receipts') AND ((select private.is_committee()) OR ((select private.is_member()) AND ((storage.foldername(name))[1] = 'r') AND ((storage.foldername(name))[2] = ((select private.current_adult_id()))::text) AND (NOT private.receipt_locked(name))))));
alter policy "receipts read" on storage.objects
    using (((bucket_id = 'receipts') AND ((select private.is_committee()) OR ((select private.is_member()) AND ((((storage.foldername(name))[1] = 'r') AND ((storage.foldername(name))[2] = ((select private.current_adult_id()))::text)) OR private.receipt_is_mine(name))))));
alter policy "receipts upload" on storage.objects
    with check (((bucket_id = 'receipts') AND (select private.is_member()) AND ((storage.foldername(name))[1] = 'r') AND ((storage.foldername(name))[2] = ((select private.current_adult_id()))::text) AND (private.uploads_today('receipts', ('r/' || ((select private.current_adult_id()))::text)) < 40)));

-- polls_read: can_see_poll(id) written out inline (it re-read the same polls row). Same rule;
-- as a side effect a leader's insert ... returning on a new poll now works (the old helper
-- could not see a row inserted by the same statement).
alter policy polls_read on public.polls
    using (((select private.is_member()) AND ((den_id IS NULL) OR (select private.is_leader()) OR (den_id in (select private.my_den_ids())))));

-- -----------------------------------------------------------------------------
-- 6. Editing an announcement: the saved post must pass the same rules as posting it
--    (announcements_insert), unless an admin is editing.
-- -----------------------------------------------------------------------------
alter policy announcements_edit on public.announcements
    using (((author_id = (select private.current_adult_id())) OR (select private.is_admin())))
    with check (((select private.is_admin())
                 OR ((select private.is_leader()) AND (author_id = (select private.current_adult_id()))
                     AND ((den_id IS NULL) OR ((select private.is_committee()) or den_id in (select private.my_led_den_ids()))))));

-- -----------------------------------------------------------------------------
-- 4. Indexes
-- -----------------------------------------------------------------------------
create index if not exists event_rsvps_family_idx       on public.event_rsvps (family_id) where family_id is not null;
create index if not exists event_rsvps_adult_idx        on public.event_rsvps (adult_id);
create index if not exists announcements_created_idx    on public.announcements (created_at);
create index if not exists den_meetings_meets_on_idx    on public.den_meetings (meets_on);
create index if not exists events_den_idx               on public.events (den_id) where den_id is not null;
create index if not exists polls_den_idx                on public.polls (den_id) where den_id is not null;
create index if not exists feedback_adult_idx           on public.feedback (adult_id, created_at);
create index if not exists finance_budget_category_idx  on public.finance_budget (category_id);
create index if not exists scout_advancement_import_idx on public.scout_advancement (import_id) where import_id is not null;
create index if not exists join_requests_family_idx     on public.join_requests (family_id) where family_id is not null;

-- -----------------------------------------------------------------------------
-- 5. To-do dismissals: poll-<id>, job-<id>, or the leaders' training-import reminder.
-- -----------------------------------------------------------------------------
alter table public.todo_dismissals drop constraint if exists todo_dismissals_key_check;
alter table public.todo_dismissals add constraint todo_dismissals_key_check
    check (key ~ '^((poll|job)-[0-9a-f-]{36}|training-import)$');

-- -----------------------------------------------------------------------------
-- 7. Save this phone or browser for alerts. The endpoint is unique per device, so a device
--    that was saved under another login (a shared tablet) moves to the signed-in adult.
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
    insert into public.push_subscriptions (adult_id, endpoint, p256dh, auth, user_agent)
    values (me, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
    on conflict (endpoint) do update
       set adult_id = excluded.adult_id, p256dh = excluded.p256dh, auth = excluded.auth,
           user_agent = excluded.user_agent, created_at = now();
end $$;
revoke all on function public.register_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.register_push_subscription(text, text, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 8. going_to_event(): signed-in members only.
-- -----------------------------------------------------------------------------
revoke execute on function private.going_to_event(uuid) from public, anon;
grant execute on function private.going_to_event(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 9. Volunteer roster: only for events the caller can see (hides leaders-only events' names).
-- -----------------------------------------------------------------------------
create or replace function public.volunteer_roster(p_event_id uuid)
returns table (slot_id uuid, adult_id uuid, name text)
language sql stable security definer set search_path = '' as $$
    select vs.slot_id, a.id,
           coalesce(a.preferred_name, a.first_name) || ' ' || left(a.last_name, 1) || '.'
      from public.volunteer_signups vs
      join public.volunteer_slots s on s.id = vs.slot_id
      join public.adults a on a.id = vs.adult_id
     where private.is_member() and private.can_see_event(p_event_id) and s.event_id = p_event_id
     order by vs.created_at
$$;
revoke execute on function public.volunteer_roster(uuid) from public, anon;
grant execute on function public.volunteer_roster(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. attendance_summary(): same columns and numbers, but each count is worked out once for
--    all scouts and joined, instead of a set of subqueries per scout. Still runs as the
--    caller, so a parent only counts what they can see.
-- -----------------------------------------------------------------------------
create or replace function public.attendance_summary(p_from date, p_to date, p_scout_id uuid default null)
returns table (scout_id uuid, den_meetings int, den_meetings_held int, events int, nights int, nights_all int)
language sql stable set search_path = '' as $$
    with sc as (
        select s.id, s.den_id from public.scouts s
         where p_scout_id is null or s.id = p_scout_id
    ), dm as (          -- den meetings in the range each scout was at
        select a.scout_id, m.id, m.den_id
          from public.den_meeting_attendance a
          join public.den_meetings m on m.id = a.meeting_id
         where m.meets_on between p_from and p_to
           and (p_scout_id is null or a.scout_id = p_scout_id)
    ), attended as (
        select dm.scout_id, count(distinct dm.id) as n from dm group by dm.scout_id
    ), held as (        -- meetings held per den in the range (recorded, or anyone marked there)
        select m.den_id, count(*) as n
          from public.den_meetings m
         where m.meets_on between p_from and p_to
           and (m.recorded_at is not null
                or exists (select 1 from public.den_meeting_attendance x where x.meeting_id = m.id))
         group by m.den_id
    ), scout_dens as (  -- dens whose meetings the scout went to; else the scout's own den
        select dm.scout_id, dm.den_id from dm
        union
        select sc.id, sc.den_id from sc where not exists (select 1 from dm where dm.scout_id = sc.id)
    ), held_for as (
        select sd.scout_id, sum(h.n) as n
          from scout_dens sd join held h on h.den_id = sd.den_id
         group by sd.scout_id
    ), ev as (
        select a.scout_id, (e.starts_at at time zone 'America/New_York')::date as day, private.event_nights(e) as nights
          from public.event_attendance a
          join public.events e on e.id = a.event_id
         where p_scout_id is null or a.scout_id = p_scout_id
    ), ev_sum as (
        select ev.scout_id,
               count(*) filter (where ev.day between p_from and p_to) as events,
               sum(ev.nights) filter (where ev.day between p_from and p_to) as nights,
               sum(ev.nights) as nights_all
          from ev group by ev.scout_id
    )
    select sc.id,
           coalesce(attended.n, 0)::int,
           coalesce(held_for.n, 0)::int,
           coalesce(ev_sum.events, 0)::int,
           coalesce(ev_sum.nights, 0)::int,
           coalesce(ev_sum.nights_all, 0)::int
      from sc
      left join attended on attended.scout_id = sc.id
      left join held_for on held_for.scout_id = sc.id
      left join ev_sum   on ev_sum.scout_id = sc.id
$$;
revoke execute on function public.attendance_summary(date, date, uuid) from public, anon;
grant execute on function public.attendance_summary(date, date, uuid) to authenticated;

commit;
