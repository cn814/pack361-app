# Pack 361 App (Ellicott City, MD)

Private member web app for Cub Scout Pack 361: pack feed and announcements, calendar, campout
schedules with an offline packing checklist, leader directory, family profile, and advancement
(rank progress from Scoutbook, families report requirements, den leaders approve).
Next.js 16 (App Router) on Vercel, Supabase (Postgres + Auth) for data and login.

Live at **https://app.pack361.org** (CNAME `app` → Vercel in Squarespace DNS for pack361.org;
pack361-app.vercel.app still works). Supabase Auth Site URL is https://app.pack361.org and both
addresses are in the redirect allow list. The root of pack361.org (and www) is the app's public
join page once its DNS records point to Vercel (see **Public website** below), not a Squarespace
site. Keep the Mailgun email-forwarding records as they are, and put any new email-sending records
on a subdomain.

**Handing the app to the next person:** [docs/HANDOVER.md](docs/HANDOVER.md) lists every account and
key, who owns each, and the steps for the outgoing and incoming maintainer.

**App guide for families and leaders:** `docs/guide/` (`guide.html` and the printable
`Pack361-App-Guide.pdf`). Update it whenever a feature is added or changes, in the same change
(how to rebuild the PDF is in `docs/guide/README.md`).

## Run locally
```bash
cp .env.example .env.local   # fill in the Supabase URL and publishable key
npm install
npm run dev
```

## How login works
- Parents sign in with the email the pack has on file. Supabase emails a link **and** a code.
- The email template must point the link at `/auth/confirm?token_hash={{ .TokenHash }}&type=email`
  (works even if the email is opened in a different browser); the code (`{{ .Token }}`) is for the
  home-screen app.
- A signed-in email that isn't on the roster (or was turned off in Pack admin) sees only the "not on
  the roster" page. The database's Row Level Security enforces this too, not just the UI.
- Sign-in emails are limited to 20 an hour for the whole pack (Supabase → Authentication → Rate
  Limits), which protects the 100-a-day email quota. When someone hits a limit, the sign-in page
  tells them to wait or email info@pack361.org.

## Folders
| Path | What |
|---|---|
| `supabase/migrations/` | Database schema, security rules and storage buckets. Run in name order: `init` (core tables and row-level security), `harden_functions` (locked-down function search paths), `private_helpers` (permission helpers in a private schema), `advancement` (adventure catalog + Scoutbook import), `pack_features` (settings, Givebutter, push, calendar; popcorn_sales is unused for now), `pack_tools` (roster admin, den meetings, volunteers, training, photo vault), `feedback` (problem reports and notes to admins), `den_calendar` (den-aware events and meetings), `twh_sync` (TroopWebHost calendar sync), `twh_rsvp` (TroopWebHost event links), `review_fixes` (event archive, photo removal requests, indexes), `pack_hub` (guide, medical forms, dues, den messages, polls, notifications), `guide_content` (starter guide pages), `twh_replacement` (in-app RSVP, public guide pages), `payments` (charges, PayPal, event fees; replaces dues), `documents` (documents library), `council_events` (council calendar picker), `training_plus` (more courses, member IDs, training import), `guide_updates` (guide text for paying, documents, RSVPs and training), `givebutter_dues` (dues paid on Givebutter), `registration_expiry` (registration expiration tracking), `rsvp_everywhere` (RSVPs on by default), `den_meeting_easy` (one-step den meeting recording, several adventures per meeting, den meeting RSVPs), `review_db_fixes` (database fixes from the code review), `guide_text_fixes` (guide text: dues on Givebutter, registration at my.scouting.org), `den_names` (den names are just the rank), `rsvp_all_day` (all-day events take RSVPs through their last day), `finance` (expenses, reimbursement requests, other income, budget, receipts bucket), `newsletter` (weekly family newsletter setting and send log), `attendance` (attendance at pack events and campouts, camping nights per event, per-scout attendance totals), `recruiting` (events shown on the public join page, the link members share), `todo_dismissals` ("Not now" on polls and volunteer jobs). |
| `supabase/data/` | One-off data updates run in the SQL Editor (e.g. the Fall Campout details, Arrow of Light Den 8 bridging). |
| `supabase/seed.sql` | Starter data: dens (Scoutbook numbering), pack meetings, fall events, default packing list. |
| `supabase/import/build_roster_import.py` | Merges Scoutbook Plus + TroopWebHost data into `imports/roster_import.sql` and `imports/roster_review.md`. |
| `supabase/tests/` | Permission tests (plain Postgres + a small Supabase stand-in). |
| `src/` | The app. `src/proxy.ts` keeps sessions fresh and sends signed-out visitors to /login. |
| `docs/BUILD_SPEC.md` | Original screen specs, reference only (the built app supersedes them). |
| `docs/DATA_EXPORTS.md` | What to export from Scoutbook Plus / TroopWebHost / my.scouting. |
| `docs/RESTORE.md` | How to restore a database backup: a few rows, the whole database, or a new Supabase project. |
| `design/DESIGN.md` | Trailhead Scout design system. |
| `design/mockups/*.html` | Original screen mockups (open in a browser). |
| `imports/` | Roster data pulled from Scoutbook Plus and TroopWebHost, plus the generated import. Git-ignored (family contact info). |


## Advancement
- **Scoutbook Plus is the official record.** There's no Scoutbook API, so an admin exports
  *Reports → Quick Export → Advancements* and uploads the CSV at **Scouts → Import Scoutbook**.
  Each scout in the file is replaced (matched by BSA member ID). Do it after each pack meeting.
- Families see their scout's current rank: required adventures, electives, partial requirements,
  ranks earned. They can report finished home requirements; the den leader approves; whoever enters
  it in Scoutbook taps "Entered" (or the next import marks it automatically).
- Leaders get a Scout Shop shopping list of items approved in Scoutbook but not yet marked awarded
  (`/scouts/awards`): by rank, with each item's SKU, product page and photo, and printable bag labels
  per scout on Avery 5160/5163/5164 sheets (`/scouts/awards/labels`, `src/lib/labels.ts`). The SKUs
  (`src/lib/scout-shop-data.ts`) and thumbnails (`public/awards/<sku>.jpg`) come from the Scout Shop
  catalog in the pack's earlier label tool, github.com/cn814/advacement-code. When the Scout Shop adds
  or renumbers an item, add it to `SHOP_ITEMS` (key: `rank|adventure name` as in the `adventures`
  table) with a 240×240 JPEG thumbnail. The Wolf and Arrow of Light rank patches use the Scout Shop's own
  small product photo (`image`), since the old catalog didn't have them.
- The 2024 adventure catalog lives in the `adventures` table (editable in the Supabase table editor).

- **Awards** only count items earned on or after `pack_settings.awards_tracked_from` (2026-07-01);
  older ones are treated as handed out. Leaders get a printable awards night sheet and a den grid.

## Givebutter, calendar, alerts
- **Givebutter**: a daily Vercel Cron (`vercel.json`, 10:00 UTC = 6 AM EDT / 5 AM EST) and a "Sync now" button (admins on
  the Pack store page, the committee on Leaders → Money → Settings) copy campaigns and orders. Admins choose which campaigns the store lists (pack attire). Campaigns link to calendar events by Givebutter id or sign-up
  link; families are matched by email. Families see their own orders; the committee sees everyone's; other leaders see
  everyone's except dues payments.
- **Calendar**: each adult gets a private feed, `/api/calendar/<token>.ics` (Events page -> "Add the
  pack calendar"). It follows the den-aware rules below (pack events plus their dens' events and
  meetings; leaders get everything), leaves out archived events, and stops working when the adult
  leaves the roster.
- **Push alerts**: families turn them on from My family; leaders' new announcements notify them.
  iPhones need the app added to the home screen first.
- Needs server env vars: see `.env.example` (`SUPABASE_SECRET_KEY`, `GIVEBUTTER_API_KEY`,
  `CRON_SECRET`, VAPID keys, `RESEND_API_KEY`, `BREVO_API_KEY`, `TWH_CALENDAR_URL`). Without them those features stay
  quiet; everything else works.

## Leader tools
- **Pack admin** (Leaders → Pack admin; admins and Cubmaster): add and edit families, adults, scouts
  and dens, assign den leaders, change app roles, turn off access when a family leaves, and pack
  settings. Nobody needs to run database commands for roster changes.
- **The roster and Scoutbook**: the roster doesn't sync from Scoutbook (there's no API). **Roster
  check** (`/admin/roster/check`, `src/lib/roster-check.ts`) reads a Scoutbook Plus or my.scouting
  youth roster export (CSV or .xlsx) in the browser, compares it with the app by member ID then
  name, and lists new scouts (add to a new or existing family), den moves, member IDs to save,
  scouts registered again and scouts missing from the export. Only the changes clicked are sent.
- **Ask to join** (`join_requests`): someone who signs in with an email that isn't on the roster
  can ask from the not-on-roster page (their name, phone, and scouts' names and grades). Admins get
  a push and an email, then approve in Pack admin → Join requests with `approve_join_request()`
  (adds the family or uses an existing one, the parent and the scouts with their dens; the login
  links by email) or decline with a reason. Scouts' names, phone and note are cleared after the
  decision. One open request per person, three a month, 50 waiting at most.
- **View as** (`src/lib/view-as.ts`): leaders can preview the app as a lower role from the Leaders
  page (a cookie, 8 hours). `getMe()` reports the previewed role, so pages show what that role
  sees; the database still applies the person's real permissions.
- **Welcome emails**: sends each adult one "the app is ready" email in batches under the daily
  limit (`pack_settings.email_daily_limit`, 40). The free Resend plan allows 100 emails a day in
  total, and each welcomed family then signs in (another email), so keep room for those. Needs
  `RESEND_API_KEY`.
- **Den meetings**: den leaders tap **Record a den meeting** on Home (or a den's page), any day.
  One phone screen: tap who's here (pre-checked from "Going" RSVPs), tap the adventure the den
  worked on (the ones most scouts still need come first; add more than one, or "No adventure
  today"), then **Save**. Requirements land already approved on the "Enter in Scoutbook" list for
  every scout who was there, skipping anything already done; saving twice never doubles anything.
  "Not everyone finished?" untick a scout's requirement; "Different day?" records an earlier
  meeting. Reopen it to change things: removed items come off the list unless the advancement
  chair already entered them in Scoutbook. Planning ahead (Scouts → a den → Past meetings and
  planning ahead) is optional; families see planned meetings and say per scout who's going.
- **Attendance and camping nights**: from an event's or campout's start day, leaders get a **Take
  attendance** card on its page: scouts by den (the event's dens first for den events), pre-checked
  from families that said yes, then **Save** (`record_event_attendance`, saved in
  `event_attendance`). Camping nights come from the dates (Fri to Sun = 2) unless a leader fills in
  "Camping nights" on the event form (0 for day camp). Each scout's page shows this season's den
  meetings, pack events and camping nights; Leaders → Attendance has the whole pack by season, with
  a CSV download (`attendance_summary`, so den leaders see den meetings only for their own dens).
- **Volunteer jobs**: leaders add jobs on any event or campout page; families sign up. The home
  page lists open spots. Volunteers get a reminder the day before or the same afternoon ("Tomorrow"
  or "Tonight"), by phone alert or else email. A reminder is only marked sent once it actually went
  out; anything that didn't is retried the next day.
- **Training**: `adult_trainings` tracks Safeguarding Youth (renewed every year), position-specific,
  Chartered Organization Representative, Hazardous Weather, BALOO, Safe Swim, Safety Afloat, Climb On
  Safely, Trek Safely, IOLS, Wood Badge and CPR / First Aid. Each adult's positions (from role, pack
  position title and den assignments) decide what they need to count as trained; Leader training shows
  who's missing what and a pack checklist (BALOO for overnights, Hazardous Weather, water safety).
  Leaders update their own dates on My family; admins update anyone's, or import a my.scouting training
  report (CSV or .xlsx) at Leader training → Import from my.scouting. The file is read in the browser
  and never uploaded; adults are matched by BSA member ID, then by name, and only newer dates are
  applied (`import_trainings`). Each adult can add their own member ID on My family
  (`set_my_member_id`). Reminders go out 60, 30, 7 and 0 days before expiry (phone alert and email).
- **Photos**: private bucket `pack-photos` (JPEG only, 4 MB max per file). Each family answers a
  photo permission question per scout (unanswered = no). Parents' uploads wait for a leader;
  leaders' go straight in. Photos are resized in the browser (about 0.5 MB each, and the re-encode
  strips GPS data), and are deleted after `pack_settings.photo_keep_months`. The album page groups
  photos by event (counted in the database by `photo_albums()`), with an "Around the pack" album
  for the rest. **Only leaders delete photos** (Photo review). Everyone else taps **Request
  removal**: the photo is hidden at once and the admins are alerted (one open request per person
  per photo, 10 a day). Pack admin shows how much of the free plan's 1 GB of storage is used.
- **Documents** (`/documents`): the pack's non-sensitive papers (minutes, budget, blank forms,
  packing lists, den leader guide, bylaws). Private bucket `pack-docs`: 10 MB max; PDF, Word,
  Excel, PowerPoint, text, CSV, JPEG, PNG, WebP. Each document is for everyone, leaders or
  committee, optionally one den. Leaders upload straight from the browser through a signed upload
  address; committee or the uploader edits, archives or replaces the file; only committee
  deletes. Files open only through `/documents/<id>`, which checks access and redirects to a link
  that lasts 60 seconds; paste `[Title](/documents/<id>)` into a guide page to link one. Never for
  medical forms, insurance cards or personal details. Pack admin shows storage per bucket
  (`storage_usage()`) against the free 1 GB.
- **Offline campouts**: the service worker (`public/sw.js`) keeps opened campout pages and the app's
  static files on the phone; the sign-in page clears them.
- **Saved on this phone** (`/family/files`, `src/lib/device-files.ts`): families keep their own
  photos or PDFs of medical forms, insurance cards and other papers in the browser's IndexedDB
  (`pack361-files`). Nothing is uploaded and the server never sees them. Files are tagged with the
  signed-in adult's id, so another account on a shared device doesn't see them; "Remove everything"
  clears them before handing a device over. Signing out does **not** delete them. Big photos are
  shrunk to about 2000px JPEG in the browser; 15 MB max per file. Files are tied to one browser: on
  iPhone the home-screen app and Safari keep separate copies, Safari tabs (not the home-screen app)
  lose them after 7 days unused, and deleting the app deletes them, so families should keep a backup
  with Share → Save to Files.
- **Den-aware calendar** (`src/lib/calendar.ts`): families see pack-wide events, events for their
  scouts' dens or ranks (`events.den_id`, `events.ranks`), and their dens' planned meetings; leaders
  see everything (with a "My family's dens" filter). `events.leaders_only` can hide an event from
  parents (enforced by RLS); committee meetings and Roundtable are deliberately open to everyone. The private calendar feed follows the same rules.
- **TroopWebHost sync** (`src/lib/twh.ts`): reads an admin's TroopWebHost calendar subscription
  link (`TWH_CALENDAR_URL`) daily and from Pack admin → Sync now. New events are added (category and
  ranks guessed from the title), TroopWebHost events follow its time and place, and events already
  in the app are matched by date and title instead of duplicated (a one-word title like "Pack
  Meeting" must match exactly). Repeating events (`RRULE`, with changed or skipped dates) become one
  event per date. Only changed rows are written.
- **Nothing is deleted by the sync.** An event removed in TroopWebHost moves to the archive
  (`events.archived_at`, reason `removed_in_twh`) and comes back if it reappears. If the calendar
  comes back empty, or with fewer than half the upcoming events the app already has, nothing is
  archived and Pack admin shows a warning (a TroopWebHost outage or a changed link).
- **Archive** (Events → Past events and archive): past events and archived ones, grouped by year.
  Leaders can take any event off the calendar or put it back from its page (reason `hidden`; the
  sync leaves hidden events alone).
- **Events in the app**: leaders add events (Events → Add an event) and edit any event from its
  page. Editing a TroopWebHost event detaches it from the sync (`source = 'manual'`), so the app is
  the calendar of record and TroopWebHost can be dropped. Removing `TWH_CALENDAR_URL` stops the sync.
- **Council events** (Events → Council events; committee picks, den leaders can look): the daily
  job and a "Check now" button copy the Baltimore Area Council calendar (ScoutingEvent feed) into
  `council_events`. The committee filters out meetings, holidays and other districts' events (word
  lists in `src/lib/council-filters.ts`), then adds events to the pack calendar or skips them; both
  can be undone. Added events follow the council's title, time and place until someone edits them in
  the app. Events that leave the council calendar are flagged, never deleted. The feed link is
  `pack_settings.council_calendar_url`, set on that page.
- **RSVP**: every event takes RSVPs in the app by default; a leader can turn "Take RSVPs" off for
  an event and set an optional RSVP-by date. Each family answers Going / Maybe / Can't go with how
  many scouts and adults (`event_rsvps`, one answer per family, through `set_rsvp()`); everyone sees
  the headcount (`rsvp_counts()`), leaders see who's coming. RSVPs stay open until the event ends
  (an all-day event, the end of its last day). Unanswered RSVPs within 30 days show in
  Notifications → Needs you, except for regular meetings (Den Meeting, Pack Meeting, Committee),
  which families can still answer on the event page. There's no TroopWebHost RSVP link. Den
  meetings planned in the app take an RSVP per scout (`den_meeting_rsvps`), which the den leader's
  recorder uses to pre-check who's here. An event's outside sign-up link shows as "Sign up / pay"
  ("Register with the council" for council events).
- **Permission slips** (`permission_slips`, `src/components/PermissionSlips.tsx`): a leader ticks
  "Families sign a permission slip" on an event, with the wording (and an optional printable form
  from Documents and a due date). Parents sign per scout by typing their name; the slip keeps the
  name, date and the exact wording. Leaders record paper slips. Families who said Going get a to-do
  and a newsletter line until there's a slip for as many scouts as they said are coming.
- **Public website** (`/join`, served as the home page of `pack361.org` and `www.pack361.org` by
  `src/proxy.ts`): who the pack is, photos (`src/app/join/photos.ts`, files in `public/join/`) and
  the "Joining Pack 361" guide page. Guide pages marked **Public** (and published) can be read by
  anyone at `/join/<slug>`; every other path on those hosts redirects to `app.pack361.org`. This is
  the only part of the app search engines may index.
- **Big-event tab**: the bottom bar shows a tab for the next campout, Pinewood or rocket derby,
  fishing derby, Blue & Gold, regatta or crossover from 45 days before until 3 days after
  (`src/lib/featured.ts`). Upcoming lists keep an event until it ends, so a campout stays up all
  weekend.
- **Messages**: "Report a problem or send a note" (My family, Leaders) saves to `feedback` and
  alerts the admins (phone alert + email); admins handle them in Pack admin → Messages. Photo
  uploads from families (one alert per batch) and removal requests also alert the admins.
- **Notifications** (bell in the top bar, `/inbox`): announcements and den messages, plus a
  "Needs you" list (`src/lib/inbox.ts`): polls to answer, medical forms needed before an upcoming
  campout, money due, the photo permission question, and for leaders photos to review, forms turned in
  and messages from families. The badge counts new posts and polls since the list was last opened
  (`inbox_reads`) plus open to-dos. Home shows the top three to-dos.
- **Den messages**: a leader posts to one den (den leaders: their own dens; committee, Cubmaster
  and admins: any den) from Home, Notifications or the den's page. Only that den's families and
  leaders see it (RLS). It goes out as a phone alert and, optionally, an email whose replies go to
  the leader.
- **Pack-wide email**: leaders' announcements can also be emailed to every active adult. Bulk email
  (pack-wide and den) goes through Brevo's free plan (300 a day, `BREVO_API_KEY`,
  `src/lib/bulk-email.ts`), so it doesn't use up the Resend quota the sign-in codes need. Without
  Brevo, den emails of 60 or fewer go through Resend and the pack-wide option is hidden. Parents never message each other or scouts.
- **Pack guide** (`/guide`, `guide_pages`): searchable pages about how the pack works. Committee,
  Cubmaster and admins edit them in the app with a small Markdown subset (`src/components/GuideBody.tsx`).
  Drafts are visible to leaders only; `[Leaders: …]` placeholders are highlighted.
- **Paperwork**: each scout and adult's medical form (Parts A and B) status on My family and on
  Leaders → Paperwork. Families tap "I turned it in"; a leader marks it received; it expires a
  year after the date on the form. Only status and dates are stored. Dues are now
  charges (see Payments).
- **Payments** (`/pay`, Leaders → Money): everything a family owes the pack is a row in `charges`
  (dues, event fees, other; plus Scouting America and council registration only when
  `registration_billing` is on). Pack dues are paid on Givebutter and matched automatically (see
  **Pack dues on Givebutter**). PayPal is optional, for everything else: when its keys are set,
  families pay with PayPal buttons (PayPal, Venmo on phones, or card; Orders v2 created and captured
  on the server, `src/lib/paypal.ts`). Either way they can say they paid by check or cash for a
  leader to confirm. A captured order
  is recorded by `record_paypal_capture()` (secret key only, safe to run twice); the daily cron
  finishes checkouts a browser didn't. Events can have a cost per family, scout and adult, and an RSVP
  "yes" keeps the family's event charge up to date (paid charges never change). The committee adds
  fees, confirms payments, sets amounts and "other ways to pay", and downloads a CSV. Registration is
  tracked by expiration date (see **Registration**); the pack doesn't bill it unless
  `registration_billing` is turned on in Money → Settings, which brings back the national and
  council fee kinds and the "sent to council" tracking. Env:
  `NEXT_PUBLIC_PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV` (sandbox unless `live`).
  Without PayPal keys the PayPal buttons are hidden and families report check or cash payments.
- **Expenses, reimbursements and financial reports** (Leaders → Money → Expenses and Reports):
  - Anyone on the roster can ask to be paid back (Leaders → Get paid back, `/reimburse`): what they
    bought, amount, date, optional category/event/den, how they'd like to be paid, and a photo or
    PDF of the receipt (required). Receipts go from the browser straight to the private `receipts`
    bucket (10 MB; PDF, JPEG, PNG, WebP; big phone photos are shrunk to JPEG first) under
    `r/<adult id>/`. Leadership members whose position mentions "treasurer" get a push and an email
    (the admins and Cubmaster when there's no treasurer). They can change or withdraw a request until
    leadership acts on it.
  - Leadership reviews on Expenses → To review: approve (with a budget category), approve and pay
    back (how, date, check number), or decline with a reason; the person gets a push and an email
    when it's paid or declined. The database records who approved and who paid, and nobody approves,
    pays, changes or deletes their own request once approved (another leadership member does).
  - Leadership also records what the pack paid for directly (Record an expense), money in the app
    doesn't see on its own (Other income: sponsors, popcorn commission, bank interest), the budget
    per season (July to June), and the categories (rename or hide; the ones the app counts itself
    can't be removed).
  - Reports (`/leaders/money/reports`), for a season or any dates: money in by category (charges
    paid by PayPal, check or cash; Givebutter orders, the dues campaign as pack dues and the rest as
    fundraisers and donations; hand-entered income), money out by category (approved and paid
    expenses, by receipt date), budget against actual, by month, by event, den spending, and what's
    still outstanding. Charges paid on Givebutter are counted from the Givebutter orders, never
    twice. Print or save as PDF, or download the summary or every transaction as CSV.
- **Pack dues on Givebutter**: dues are per scout ($255 by default; each brother or sister after the
  first gets the sibling discount, $10 by default, both in Money → Settings). Pick the Givebutter dues
  campaign in Money → Settings (a campaign with "dues" in its name is suggested, not saved). Then:
  - Money → Add a fee → "Set up dues for 2026-27" adds a dues charge per active scout
    (`add_dues_charges()`), full price for the first scout in a family, discounted after that.
  - `/pay` and My family show open dues with a "Pay dues on Givebutter" button (new tab) as the way
    to pay dues; PayPal and "I paid another way" stay for everything else.
  - Each Givebutter sync matches paid, not-yet-applied orders in the dues campaign
    (`src/lib/givebutter-dues.ts`): the family by payer email, then the parent email answer; the
    scouts by first name from the "Full Name of Scout(s)" answer (split on commas, "and", "&", "/",
    ";"), or, with no names that match, all the family's scouts when the amount is exactly their dues.
    `apply_givebutter_dues()` (secret key only) marks each scout's dues paid on Givebutter, splitting
    the amount so it adds up exactly, and marks the order done. Paid, waived and canceled charges are
    never touched. Scout names, phone numbers and addresses from Givebutter are used only during the
    sync and never stored; the order keeps the matched scout ids and a short note without names.
  - Money → Givebutter dues lists the payments. "Needs review" ones get "Match to…" (pick the family,
    tick its scouts; `match_givebutter_dues()`, committee only) or "Not dues" for donations.
  - A leader can reopen a Givebutter-paid charge (refund it in Givebutter); the sync won't mark it
    paid again.
- **Registration** (Money → Registration): families renew and pay Scouting America and council
  registration themselves at my.scouting.org; the pack doesn't collect it. The tab tracks each active
  scout's and registered adult's expiration date (Current, Expires in N days, Expired, Unknown), with
  an inline date per person and one date for everyone ticked (`set_registration_expiry()`, committee
  only; a new date restarts the reminders). My family shows the dates with a "Renew at my.scouting.org"
  link within 30 days, Notifications adds a to-do, and the daily cron reminds families 30, 7 and 0
  days before (push, or email when push didn't reach anyone). The old per-person national/council fee
  billing and "sent to council" tools are hidden unless `registration_billing` is turned on in
  Money → Settings.
- **Polls** (`/polls`): leaders ask the pack or one den; single or multiple choice, optional
  one-answer-per-family, closing date, results for voters or leaders only. Votes go through
  `cast_vote()`; `poll_results()` returns counts, never names (leaders see who answered what).
- **Sign-in on phones**: the sign-in email leads with the code (also in the subject). Links in
  email always open the phone's browser, never the home-screen app, so on phones the link opens
  `/auth/open`, which says to type the code in the app and only signs in the browser if asked.
- **Computers**: at the `lg` breakpoint the bottom bar becomes a left sidebar and busy pages use
  two columns (add `page-wide` to a page element to let it use the full width). Phones are unchanged.
- **To-dos on Home and in the bell** (`src/lib/inbox.ts`, `TodoCard`): RSVPs for special events
  (not regular meetings) show only when close (next 14 days; campouts and paid events 30; or an
  RSVP-by date within 14), two at a time, with **Going / Maybe / Can't make it** right on the card
  (`quickRsvp`: the family's scouts the event is for and one adult; Going on a paid event opens the
  event to pick counts). Maybe hides it until the day of the event, then it asks again. Polls and
  volunteer jobs have **Not now** (`todo_dismissals`): a poll comes back a day before it closes, a job
  two days before its event. Money due, medical forms and registration can't be hidden.
- **Recruiting**: Invite a family (`/recruit`, in the sidebar and on Leaders) lets any member send the
  pack's public page with an editable message: the phone's share sheet, a text, an email, a copied
  message, or (Android Chrome) people picked from their contacts, who go straight to their messaging
  app and never reach the server. It also shows a QR code and a printable flyer (`/recruit/flyer`).
  The link is `public_site_url` in Pack admin → Pack settings (app.pack361.org/join until pack361.org
  points here). Leaders tick "Show on the public join page" on an event, with an optional public line,
  and it's listed under "Big events coming up" on the join page and on Invite a family
  (`join_page_events()`: title, dates, place name and that line only; never the address or details).
- **Weekly newsletter** (`src/lib/newsletter.ts`): the morning cron (`/api/cron/givebutter`, 10:00 UTC)
  runs the Givebutter sync every day and, on Sundays (Eastern), emails each adult one newsletter for
  their family: the next two weeks of events (their dens and the pack) with their RSVP or an RSVP
  button, "Needs your attention" (unanswered special events, money due, medical forms for a campout
  in the next 45 days, registration renewals, open polls), the week's announcements and open
  volunteer jobs. Sent one by one through Brevo (`sendPersonal()`); `newsletter_sends` keeps one row
  per adult per week so a rerun never sends twice. Pack admin → Weekly newsletter sets who gets it
  (`newsletter_mode`: off, testing (only the leaders ticked in `newsletter_test_adults`), every
  family; it stays on testing while TroopWebHost still sends its own), shows this week's for your family, and emails you a copy.
- A second daily cron (`/api/cron/daily`, 21:00 UTC = 5 PM EDT / 4 PM EST) runs, in order:
  1. volunteer reminders, 2. training expiry reminders, 3. Scouting America registration reminders
  (each by push, or email when no push reached a phone; the three share one budget of 40 emails a
  run, so sign-in codes keep room in the 100-a-day quota), 4. deleting photos past the keep-for
  setting, 5. finishing PayPal checkouts a browser didn't (only with PayPal keys), 6. the
  TroopWebHost calendar sync (only with `TWH_CALENDAR_URL`), 7. the council calendar sync (only once
  a feed link is saved). Each step runs even if another fails; any failure returns HTTP 500 (so
  Vercel shows it) and a warning on Pack admin. The route allows 300 seconds (`maxDuration`, Fluid
  compute) and saves its progress to `daily_last_run` before each step, so a run that times out
  still shows which step it stopped in. The Givebutter cron allows 60 seconds. Every outside call
  has a timeout.
- **Security headers** (`next.config.ts`): no framing, no content-type sniffing, strict referrer,
  HSTS.

## Backups
The free Supabase plan has no downloadable backups, so an admin keeps local ones:
`scripts/backup-db.sh` (Linux/macOS/NAS) or `scripts/backup-db.ps1` (Windows). Each writes a
Postgres custom-format dump of the app's data (`public` and `private` schemas) with a date in the
name, deletes ones older than 60 days, and can GPG-encrypt (`ENCRYPT_TO`). It uses a local
`pg_dump` 17+ or, if there isn't one, the `postgres:17-alpine` Docker image. The connection string
(Supabase → Connect → Session pooler) stays in `~/.config/pack361/backup.env` or an environment
variable, never in the repo. Photos and documents are in Supabase Storage and aren't included.

On an Unraid NAS, paste `scripts/unraid-user-script.sh` into the User Scripts plugin and schedule it
nightly; it runs `pg_dump` in a throwaway `postgres:17-alpine` container.

Each script keeps a backup only if `pg_restore` can read it and it has the scouts table (a failed
run leaves a `.part` file), and passes the connection string to Docker through the environment so
the password never shows in the process list.

**Restoring:** see [docs/RESTORE.md](docs/RESTORE.md), which covers getting back a few rows, the whole
database, or moving to a new Supabase project. Practice section 1 once a year.

## Run the permission tests
Needs PostgreSQL 15+ (CI uses 17, like Supabase) and an empty database:
```bash
createdb packtest
DATABASE_URL=postgres://localhost/packtest npm run test:db
```
Every check prints `PASS`; the run stops at the first `FAIL`. GitHub runs these, plus lint,
typecheck and build, on every pull request (`.github/workflows/ci.yml`).

## Contributing
See [CONTRIBUTING.md](CONTRIBUTING.md): no real pack data or secrets in the repo, youth-protection
rules, local setup with your own Supabase project, and how pull requests are reviewed.
