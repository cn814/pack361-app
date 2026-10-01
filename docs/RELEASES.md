# Beta and releases

The pack uses two copies of the app:

| | Address | Code | Who can use it |
|---|---|---|---|
| **Live** | app.pack361.org | the `main` branch | every family and leader |
| **Beta** | beta.pack361.org | the `beta` branch | the testers ticked in Pack admin → **Beta site**, plus admins and the Cubmaster |

Both use the **same database**, so testers see the pack's real calendar, families and records, and
anything they change is real. To keep families from seeing unfinished work, the beta site:

- lets only testers sign in (anyone else gets a "this is the test site" page with a link to the live app);
- sends emails and phone alerts **only to testers**, whatever the feature tries to send;
- doesn't run the nightly jobs or the Sunday newsletter (Vercel runs scheduled jobs on the live site only);
- shows a dark "Beta" stripe at the top of every page, and "beta" next to the version on My family.

## Version numbers

`src/lib/version.ts` holds `APP_VERSION`, the same number as the guide's (docs/guide). Each release
people will notice bumps it: **1.3 → 1.4** for new features and fixes, **2.0** for a big change
(a redesign, or replacing something families rely on). The guide's cover and version history get
the same number (docs/guide/README.md).

## Day to day

1. Work on a branch, then merge it into **`beta`**. Vercel puts it on beta.pack361.org in a couple
   of minutes. Tell the testers what to try.
2. **Database changes must work with both copies**, because the live app keeps running the older
   code against the same database:
   - Fine: new tables, new columns with a default or allowing empty, new functions, new policies that
     only add access the new feature needs.
   - Not yet: renaming or dropping a column or table, tightening a check the live code might break,
     changing what an existing function returns. Do those as a second step after the release.
   - Run the change in Supabase → SQL Editor **before** pushing the code that needs it (as always),
     with tests in `supabase/tests/`.
3. Testers report problems with **Report a problem** in the app (it says which page) or by email.

## Releasing to everyone

1. Bump `APP_VERSION`, update the guide (cover, sections, version history) and rebuild its PDF.
2. Merge `beta` into `main`: `git checkout main && git merge --ff-only beta && git push`.
   The live site updates in a couple of minutes. If something goes wrong, Vercel → Deployments →
   the previous live deployment → **Instant Rollback**.
3. Tell families what's new: a pack announcement (Leaders → Post an announcement) for anything they'll
   use, and send the guide to leaders for anything that changes their work.
4. Run any follow-up database clean-up (step 2 above) now that the live code no longer needs the old shape.

## Urgent fixes

Fix on a branch from `main`, merge it into `main` (live), then merge `main` into `beta` so the beta
site has the fix too: `git checkout beta && git merge main && git push`.

## One-time setup (done 2026-10-01)

- `beta` branch; beta.pack361.org in Vercel → Domains, connected to the `beta` branch (Preview).
- Squarespace DNS: CNAME `beta` → `989d26bd7722caa5.vercel-dns-017.com`.
- Vercel environment variables for **Preview, branch `beta`**: `NEXT_PUBLIC_APP_CHANNEL=beta`,
  `NEXT_PUBLIC_APP_URL=https://beta.pack361.org`, and beta copies of `SUPABASE_SECRET_KEY`,
  `RESEND_API_KEY` and `BREVO_API_KEY` ("pack361-beta" keys; Brevo keys expire yearly, see
  HANDOVER.md section 6). `TWH_CALENDAR_URL` and `CRON_SECRET` stay Production only.
- Not set for beta: the VAPID keys, so the beta site sends no phone alerts. To add them, give
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` the **same values as the live site** for
  Preview/branch `beta` (a different pair can't reach phones that subscribed on the live site).
- Vercel → Deployment Protection → Deployment Protection Exceptions: `beta.pack361.org` (so testers
  don't get a Vercel sign-in page; other preview links stay protected).
- Supabase → Authentication → URL Configuration → Redirect URLs: `https://beta.pack361.org/**`.
- Testers: Pack admin → Beta site on the live app.

After changing a beta variable in Vercel, redeploy the latest `beta` deployment (or push to `beta`).
