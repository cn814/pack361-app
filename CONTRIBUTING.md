# Contributing to the Pack 361 app

Thanks for helping! This app holds information about Cub Scout families, so a few rules come
before any code. Questions go to Chris Nealen (Advancement & Camping Chair) or info@pack361.org.

## Ground rules

1. **Never commit real pack data.** No roster exports, names, emails, phone numbers, BSA member IDs
   or advancement files. The `imports/` folder is git-ignored for this reason. Use made-up test data
   (see `supabase/tests/` for the style: "Alex Smith", `@example.com`).
2. **Never commit secrets.** Keys live only in Vercel and in your own `.env.local` (git-ignored).
   `.env.example` lists the variable names with placeholder values.
3. **Youth protection is a feature requirement.** The app follows Scouting America's Youth
   Protection policies (see `src/app/safety/page.tsx` for what we tell families). In particular:
   - no one-on-one or private messaging between adults and scouts; scouts don't get accounts;
   - families see only their own scouts; parents' contact info isn't shown to other parents;
   - don't add storage of birthdates, home addresses, medical forms or payment details.

   If a change touches any of these, say so in the pull request so a pack leader can review it.
4. **Access rules live in the database.** Every table has Row Level Security. Don't loosen a policy,
   and add a test in `supabase/tests/` for any new table or policy.
5. **Scoutbook Plus is the official advancement record.** The app reads its exports; it never
   replaces it.

## Getting set up

You'll need Node.js 22, npm, and (for the database tests) PostgreSQL 15 or newer.

```bash
git clone https://github.com/cn814/pack361-app.git
cd pack361-app
npm install
cp .env.example .env.local
```

### Your own test database

Please use **your own free Supabase project** for development, never the pack's production one.

1. Create a project at supabase.com (any name, free plan).
2. In its SQL Editor, run each file in `supabase/migrations/` in filename order, then `supabase/seed.sql`.
3. Add yourself as a test adult so you can sign in:
   ```sql
   insert into public.adults (first_name, last_name, email, role)
   values ('Your', 'Name', 'your.real.email@gmail.com', 'admin');  -- lowercase
   ```
   Add a family, a scout or two and some events if you want more to look at.
4. Put that project's URL and publishable key in `.env.local`
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`).
5. Supabase's built-in email only sends to members of the Supabase project, which includes you,
   so sign-in links work without extra email setup. Set `LOGIN_CODE_ENABLED=false` in `.env.local`,
   since the built-in email doesn't include the code.

The Givebutter sync, phone alerts and calendar feed need extra server keys (see `.env.example`).
They stay switched off without them; the rest of the app works.

### Run it

```bash
npm run dev          # http://localhost:3000
```

## Before you open a pull request

```bash
npm run lint
npm run typecheck
npm run build
npm run test:db      # needs an empty Postgres database, see below
```

`npm run test:db` runs the permission tests (100+ checks that each role sees and changes only what
it should). It needs an **empty** database each time:

```bash
createdb packtest
DATABASE_URL=postgres://localhost/packtest npm run test:db
dropdb packtest
```

GitHub runs the same checks on every pull request.

## Project notes

- **Next.js 16** (App Router). Some conventions differ from older Next.js: middleware is
  `src/proxy.ts`, page props use the global `PageProps<'/route'>` type, and `params` and
  `searchParams` are promises. The docs for this exact version are in
  `node_modules/next/dist/docs/`.
- **Tailwind CSS v4.** Design tokens are in `src/app/globals.css` (`@theme`). Shared classes
  (`card`, `btn-primary`, `badge`...) are in `@layer components`. `design/DESIGN.md` has the style guide.
- **Data access:** server components and server actions call Supabase with the signed-in user's
  session, so Row Level Security applies. Only the Givebutter sync, push alerts and calendar feed
  use the server-only secret key (`src/lib/supabase/admin.ts`).
- **Database changes:** add a new, higher-numbered file in `supabase/migrations/`. Don't edit a
  migration that has already been applied to production. Say in the pull request that it includes a
  migration, because a maintainer applies it to production by hand.
- Mobile first: most families use phones. Check your change at phone width.

## Pull requests

- Branch from `main`, keep each pull request to one change, and describe what and why.
- Include screenshots for anything visual.
- A maintainer reviews and merges. Merging to `main` deploys to app.pack361.org automatically.
