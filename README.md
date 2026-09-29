# Pack 361 App (Ellicott City, MD)

Private member web app for Cub Scout Pack 361: pack feed and announcements, calendar, campout
schedules with an offline packing checklist, leader directory, and family profile.
Next.js 16 (App Router) on Vercel, Supabase (Postgres + Auth) for data and login.

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
| `supabase/migrations/` | Database schema, security rules, storage buckets (`..._init.sql`), then `..._harden_functions.sql`. Run in order. |
| `supabase/seed.sql` | Starter data: dens (Scoutbook numbering), pack meetings, fall events, default packing list. |
| `supabase/import/build_roster_import.py` | Merges Scoutbook Plus + TroopWebHost data into `imports/roster_import.sql` and `imports/roster_review.md`. |
| `supabase/tests/` | Permission tests (plain Postgres + a small Supabase stand-in). |
| `src/` | The app. `src/proxy.ts` keeps sessions fresh and sends signed-out visitors to /login. |
| `docs/BUILD_SPEC.md` | Original screen specs, reference only (the built app supersedes them). |
| `docs/DATA_EXPORTS.md` | What to export from Scoutbook Plus / TroopWebHost / my.scouting. |
| `design/DESIGN.md` | Trailhead Scout design system. |
| `design/mockups/*.html` | Original screen mockups (open in a browser). |
| `imports/` | Roster data pulled from Scoutbook Plus and TroopWebHost, plus the generated import. Git-ignored (family contact info). |


## Run the permission tests
Needs PostgreSQL 15+:
```bash
createdb packtest
psql -v ON_ERROR_STOP=1 -d packtest \
  -f supabase/tests/00_supabase_mock.sql \
  -f supabase/migrations/20260929000000_init.sql \
  -f supabase/migrations/20260929000100_harden_functions.sql \
  -f supabase/tests/01_rls_tests.sql
```
Every check prints `PASS`. The run stops at the first `FAIL`.
