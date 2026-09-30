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
  `CRON_SECRET`, VAPID keys). Without them those features stay quiet; everything else works.

## Run the permission tests
Needs PostgreSQL 15+:
```bash
createdb packtest
psql -v ON_ERROR_STOP=1 -d packtest \
  -f supabase/tests/00_supabase_mock.sql \
  -f supabase/migrations/20260929000000_init.sql \
  -f supabase/migrations/20260929000100_harden_functions.sql \
  -f supabase/migrations/20260929000200_private_helpers.sql \
  -f supabase/migrations/20260929000300_advancement.sql \
  -f supabase/migrations/20260929000400_pack_features.sql \
  -f supabase/tests/01_rls_tests.sql \
  -f supabase/tests/02_advancement_tests.sql \
  -f supabase/tests/03_features_tests.sql
```
Every check prints `PASS`. The run stops at the first `FAIL`.
