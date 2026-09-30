# Pack 361 App (Ellicott City, MD)

Private member web app for Cub Scout Pack 361: pack feed and announcements, calendar, campout
schedules with an offline packing checklist, leader directory, family profile, and advancement
(rank progress from Scoutbook, families report requirements, den leaders approve).
Next.js 16 (App Router) on Vercel, Supabase (Postgres + Auth) for data and login.

Live at **https://app.pack361.org** (CNAME `app` → Vercel in Squarespace DNS for pack361.org;
pack361-app.vercel.app still works). Supabase Auth Site URL is https://app.pack361.org and both
addresses are in the redirect allow list. pack361.org's root records (Squarespace site, Mailgun
email forwarding) are separate; put any new email-sending records on a subdomain.

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
- A signed-in email that isn't on the roster sees only the "not on the roster" page. The database's
  Row Level Security enforces this too, not just the UI.

## Folders
| Path | What |
|---|---|
| `supabase/migrations/` | Database schema, security rules, storage buckets (`..._init.sql`), then `..._harden_functions.sql`, `..._private_helpers.sql`, `..._advancement.sql` (adventure catalog + Scoutbook import) and `..._pack_features.sql` (settings, Givebutter, push, calendar; its popcorn_sales table is unused for now). Run in order. |
| `supabase/data/` | One-off data updates run in the SQL Editor (e.g. the Fall Campout details, Arrow of Light Den 8 bridging). |
| `supabase/seed.sql` | Starter data: dens (Scoutbook numbering), pack meetings, fall events, default packing list. |
| `supabase/import/build_roster_import.py` | Merges Scoutbook Plus + TroopWebHost data into `imports/roster_import.sql` and `imports/roster_review.md`. |
| `supabase/tests/` | Permission tests (plain Postgres + a small Supabase stand-in). |
| `src/` | The app. `src/proxy.ts` keeps sessions fresh and sends signed-out visitors to /login. |
| `docs/BUILD_SPEC.md` | Original screen specs, reference only (the built app supersedes them). |
| `docs/DATA_EXPORTS.md` | What to export from Scoutbook Plus / TroopWebHost / my.scouting. |
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
- Leaders get a shopping list of items approved in Scoutbook but not yet marked awarded.
- The 2024 adventure catalog lives in the `adventures` table (editable in the Supabase table editor).

- **Awards** only count items earned on or after `pack_settings.awards_tracked_from` (2026-07-01);
  older ones are treated as handed out. Leaders get a printable awards night sheet and a den grid.

## Givebutter, calendar, alerts
- **Givebutter**: a daily Vercel Cron (`vercel.json`, 6 AM ET) and an admin "Sync now" button on
  the Pack store page copy campaigns and orders. Admins choose which campaigns the store lists (pack attire). Campaigns link to calendar events by Givebutter id or sign-up
  link; families are matched by email. Families see their own orders; leaders see everyone's.
- **Calendar**: each adult gets a private feed, `/api/calendar/<token>.ics` (Events page -> "Add the
  pack calendar"). It lists pack events only and stops working when the adult leaves the roster.
- **Push alerts**: families turn them on from My family; leaders' new announcements notify them.
  iPhones need the app added to the home screen first.
- Needs server env vars: see `.env.example` (`SUPABASE_SECRET_KEY`, `GIVEBUTTER_API_KEY`,
  `CRON_SECRET`, VAPID keys, `RESEND_API_KEY`). Without them those features stay quiet; everything
  else works.

## Leader tools
- **Pack admin** (Leaders → Pack admin; admins and Cubmaster): add and edit families, adults, scouts
  and dens, assign den leaders, change app roles, turn off access when a family leaves, and pack
  settings. Nobody needs to run database commands for roster changes.
- **Welcome emails**: sends each adult one "the app is ready" email in batches under the daily
  limit (`pack_settings.email_daily_limit`; the free Resend plan allows 100 a day including sign-in
  codes). Needs `RESEND_API_KEY`.
- **Den meetings** (Scouts → a den → Meetings): plan a meeting around an adventure and its
  requirements, take attendance, then report the requirements for everyone present in one tap.
  They arrive already approved on the "Enter in Scoutbook" list. Families see upcoming meetings.
- **Volunteer jobs**: leaders add jobs on any event or campout page; families sign up. The home
  page lists open spots. Volunteers get a reminder the day before (phone alert, or email).
- **Training**: `adult_trainings` tracks Safeguarding Youth, position-specific, Hazardous Weather,
  BALOO, Safe Swim and Safety Afloat. Leaders update their own dates on My family; admins update
  anyone's. Reminders go out 60, 30, 7 and 0 days before expiry.
- **Photos**: private bucket `pack-photos`. Each family answers a photo permission question per
  scout (unanswered = no). Parents' uploads wait for a leader; leaders' go straight in. Photos are
  resized in the browser (which strips GPS data), and are deleted after
  `pack_settings.photo_keep_months`. Anyone can ask for a photo to come down; it's hidden at once.
- **Offline campouts**: the service worker (`public/sw.js`) keeps opened campout pages and the app's
  static files on the phone; the sign-in page clears them.
- **Den-aware calendar** (`src/lib/calendar.ts`): families see pack-wide events, events for their
  scouts' dens or ranks (`events.den_id`, `events.ranks`), and their dens' planned meetings; leaders
  see everything (with a "My family's dens" filter). `events.leaders_only` can hide an event from
  parents (enforced by RLS); committee meetings and Roundtable are deliberately open to everyone. The private calendar feed follows the same rules.
- **TroopWebHost sync** (`src/lib/twh.ts`): reads an admin's TroopWebHost calendar subscription
  link (`TWH_CALENDAR_URL`) daily and from Pack admin → Sync now. New events are added (category and
  ranks guessed from the title), TroopWebHost events follow its time and place,
  events already in the app are matched by date and title instead of duplicated, and events deleted
  in TroopWebHost are removed unless someone has signed up to volunteer.
- **Big-event tab**: the bottom bar shows a tab for the next campout, derby, Blue & Gold, regatta
  or crossover from 45 days before until 3 days after (`src/lib/featured.ts`).
- **Messages**: "Report a problem or send a note" (My family, Leaders) saves to `feedback` and
  alerts the admins (phone alert + email); admins handle them in Pack admin → Messages. Photo
  uploads from families and take-down requests also alert the admins.
- **Computers**: at the `lg` breakpoint the bottom bar becomes a left sidebar and busy pages use
  two columns (add `page-wide` to a page element to let it use the full width). Phones are unchanged.
- A second daily cron (`/api/cron/daily`, 5 PM ET) sends the volunteer and training reminders and
  deletes expired photos.

## Run the permission tests
Needs PostgreSQL 15+ and an empty database:
```bash
createdb packtest
DATABASE_URL=postgres://localhost/packtest npm run test:db
```
Every check prints `PASS`; the run stops at the first `FAIL`. GitHub runs these, plus lint,
typecheck and build, on every pull request (`.github/workflows/ci.yml`).

## Contributing
See [CONTRIBUTING.md](CONTRIBUTING.md): no real pack data or secrets in the repo, youth-protection
rules, local setup with your own Supabase project, and how pull requests are reviewed.
