# Releases

The pack runs one copy of the app: **app.pack361.org**, built from the `main` branch.

## The beta site was retired (October 9, 2026)

From October 1 to 9 a testers-only copy ran at beta.pack361.org from the `beta` branch. It shared
the live database, so testers saw real families, and it caught nothing the automated tests didn't.
While the app is a leaders-only pilot, the live site is the test site.

Done on October 9: beta.pack361.org removed from Vercel → Domains; the Preview copies of
`SUPABASE_SECRET_KEY`, `RESEND_API_KEY`, `BREVO_API_KEY`, `NEXT_PUBLIC_APP_URL` and
`NEXT_PUBLIC_APP_CHANNEL` deleted; `vercel.json` skips every preview build (`ignoreCommand`); CI
runs on `main` only; the tester list in Pack admin removed. Older preview deployments stay behind
Vercel's sign-in (Deployment Protection covers everything but the custom domain).

Still to tidy:

- Squarespace DNS: delete the CNAME `beta` → `989d26bd7722caa5.vercel-dns-017.com`.
- Supabase → Authentication → URL Configuration: remove `https://beta.pack361.org/**`.
- Revoke the "pack361-beta" keys in Supabase (Project Settings → API Keys), Resend and Brevo.
- Vercel → Deployment Protection → Exceptions: remove `beta.pack361.org` if it's still listed.
- GitHub: delete the `beta` branch.

The beta code is still in the app (`src/lib/beta.ts`, `BetaBanner`, `/beta-only`) and does nothing
unless a build has `NEXT_PUBLIC_APP_CHANNEL=beta`.

## Bringing a test site back

Once families use the app and bigger changes need trying out first, bring beta back **with its own
database** so testers never see real families:

1. Supabase → **New project** in the pack's organization: `pack361-beta`, US East, a new database
   password (into the pack password vault). The free plan allows two projects.
2. On a computer with Docker, from the repo folder: `scripts/setup-beta-db.sh`. Paste the beta
   project's Session pooler string. It refuses the live database, runs every migration, the
   starter data and five made-up families (`supabase/demo-data.sql`), then adds the testers as
   admins.
3. Beta project → Authentication → URL Configuration: Site URL `https://beta.pack361.org`, Redirect
   URLs `https://beta.pack361.org/**`. Copy the email templates and SMTP settings from the live
   project.
4. Vercel: change `ignoreCommand` in `vercel.json` to skip only branches other than `beta`
   (`[ "$VERCEL_ENV" = "preview" ] && [ "$VERCEL_GIT_COMMIT_REF" != "beta" ]`); add beta.pack361.org
   under Domains, connected to the `beta` branch; add a Deployment Protection exception for it;
   Squarespace CNAME `beta` → the value Vercel shows.
5. Vercel → Environment Variables, **Preview, branch `beta`** only: `NEXT_PUBLIC_APP_CHANNEL=beta`,
   `NEXT_PUBLIC_APP_URL=https://beta.pack361.org`, and the beta project's `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` (Project Settings → API Keys),
   plus `RESEND_API_KEY` for sign-in email. Never give beta the Givebutter, TroopWebHost or PayPal
   keys. Note: the live Supabase address and publishable key are set for Production and Preview
   (Vercel won't let a saved secret be edited), so the branch values must override them.
6. Sign in to beta.pack361.org: you should see the Maple, Birch, Cedar, Willow and Aspen families.

After that, every database change runs twice: on the beta project first, then on the live one.

## Version numbers

`src/lib/version.ts` holds `APP_VERSION`, the same number as the guide's (docs/guide). Each release
people will notice bumps it: **1.3 → 1.4** for new features and fixes, **2.0** for a big change
(a redesign, or replacing something families rely on). The guide's cover and version history get
the same number (docs/guide/README.md).

## Day to day

1. Work on a branch and run the checks: `npm test`, `npm run typecheck`, `npm run lint`, and the
   database tests (`supabase/tests/run.sh` against a local Postgres). CI runs them again on every
   push to `main`.
2. **Database changes go live before the code that needs them**, and must work with the old code in
   between:
   - Fine: new tables, new columns with a default or allowing empty, new functions, new policies that
     only add access the new feature needs.
   - Not yet: renaming or dropping a column or table, tightening a check the old code might break,
     changing what an existing function returns. Do those as a second step after the release.
   - Run the change in Supabase → SQL Editor **before** pushing the code, with tests in
     `supabase/tests/`.
3. Leaders report problems with **Report a problem** in the app (it says which page) or by email.

## Releasing

1. Bump `APP_VERSION`, update the guide (cover, sections, version history) and rebuild its PDF.
2. Merge into `main` and push. Vercel builds it, then holds it until the GitHub checks pass
   (Settings → Build and Deployment → Deployment Checks: Permission tests; Lint, typecheck, build;
   Secret scan) before it reaches app.pack361.org. **Force Promote** skips that, for emergencies only.
   The live site updates in a few minutes; a failed build leaves
   the old version running. If something goes wrong after it's live: Vercel → Deployments → the
   previous deployment → **Instant Rollback**.
3. Tell families what's new: a pack announcement (Leaders → Post an announcement) for anything
   they'll use, and send the guide to leaders for anything that changes their work.
4. Run any follow-up database clean-up (step 2 above) now that the live code no longer needs the old
   shape.
