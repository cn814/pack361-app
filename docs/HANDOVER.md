# Handing the Pack 361 app to the next person

This is for whoever looks after the app next, and for the pack leaders who make sure that happens.
The app is meant to outlive any one volunteer: every piece of it runs on an account the pack can
pass along, and nothing important lives only in one person's head or on one person's computer.

Read it with the README (how the app works) and [RESTORE.md](RESTORE.md) (backups). The families'
and leaders' guide is in [guide/](guide/).

**Rules that never change hands:** no real pack data or secrets in the repository, Youth Protection
rules come before features, and access rules live in the database (see CONTRIBUTING.md).

---

## 1. What runs where

Everything is on a free plan today. Fill in the **Owner** column whenever it changes, and keep at
least **two people** on every account so nobody is ever the only way in.

| Service | What it does for the app | Plan | Owner today | How to hand it over |
|---|---|---|---|---|
| **GitHub** (`cn814/pack361-app`) | The code. Pushing to `main` deploys the app. GitHub also runs the tests on every pull request. | Free | Chris Nealen (personal account) | Move the repo into a free GitHub organization the pack owns (Settings → Transfer), with two owners. Collaborators can be added under Settings → Collaborators. |
| **Vercel** (team `pack361`, project `pack361-app`) | Hosts the live site and the beta site (beta.pack361.org, the `beta` branch), runs the two daily jobs (`vercel.json`) and holds the secret keys (Settings → Environment Variables). | Hobby (free) | Chris Nealen | The free plan is for one person: transfer the project to the next person's account (Project → Settings → Transfer), or move to a paid team to have two members. Check vercel.com/pricing for current limits. |
| **Supabase** (project `bvnywjvqjxbwwfnbtdzk`) | The database, sign-in, and file storage (photos, documents, receipts). | Free | Chris Nealen | Invite the next person to the organization as Owner (Organization → Team), or transfer the project to their organization (Project Settings → General). |
| **Squarespace** (domain `pack361.org`) | The domain and its DNS: `app.pack361.org` → Vercel, email forwarding, and the email-sending records for Resend and Brevo. | Paid yearly (domain) | *Check: whose Squarespace account?* | Add the next person as a contributor with domain permissions, or transfer the domain to the pack's account. Note the renewal date: ______ |
| **Email forwarding** (`info@pack361.org`) | Where replies and questions go. Squarespace's forwarding (the Mailgun MX records). | Included with domain | *Check* | Change who it forwards to in Squarespace → Domains → Email forwarding. |
| **Resend** | Sends sign-in codes (through Supabase's SMTP settings), reminders, welcome emails and alerts. 100 emails a day. | Free | Chris Nealen | Invite a teammate, or make a new account, verify `pack361.org`, and replace `RESEND_API_KEY` in Vercel **and** the SMTP password in Supabase → Authentication → Emails → SMTP. |
| **Brevo** | Pack-wide and den emails, and the Sunday newsletter. 300 emails a day. **API keys expire after one year.** | Free | Chris Nealen | Add a user, or make a new account, authenticate `pack361.org` (adds DNS records), and replace `BREVO_API_KEY` in Vercel. |
| **Givebutter** | The pack's fundraising and dues account. The app reads campaigns and orders with an API key. | Pack account | Annie (admin); Chris (being added) | Any Givebutter admin can make a new key (Settings → Developers → API) and replace `GIVEBUTTER_API_KEY` in Vercel. |
| **PayPal** (optional) | Pay buttons for fees other than dues. | Pack's PayPal Business | Pack treasurer | The treasurer makes the REST app keys; see the "Connect PayPal to the App" guide. |
| **TroopWebHost** | Calendar sync only, until the pack cancels it. | Paid yearly | Pack | Remove `TWH_CALENDAR_URL` from Vercel when cancelled. |
| **Backups** | Nightly copy of the database (`scripts/unraid-user-script.sh` or `scripts/backup-db.sh`). | — | Chris Nealen's home NAS | The next person runs one of the backup scripts on their own computer or NAS (README → Backups) and keeps the files. Make sure the old copies are deleted when the old owner steps away. |
| **Password manager** | Where the database password and account logins are kept for the pack. | — | *Set one up* (any shared vault) | Share the vault with the next person; change passwords when someone leaves. |

## 2. The secret keys

They live **only** in Vercel (Project → Settings → Environment Variables) and in the backup
script's `backup.env`. Never in email, chat or the repository. `.env.example` lists them all with
what each is for.

| Key | Made in | If it leaks or a person leaves |
|---|---|---|
| `SUPABASE_SECRET_KEY` | Supabase → Project Settings → API Keys | Make a new secret key, update Vercel, redeploy, then delete the old key. |
| Database password (backups only) | Supabase → Project Settings → Database | Reset it, update `backup.env`, run the backup once. |
| `CRON_SECRET` | Any long random string | Change it in Vercel and redeploy. |
| `RESEND_API_KEY` | Resend → API Keys | New key in Vercel **and** Supabase SMTP; delete the old one. |
| `BREVO_API_KEY` | Brevo → SMTP & API | New key in Vercel; delete the old one. **Expires after one year:** the live key (Production) was made about Sept 30, 2026 and the beta key (Preview, branch `beta`) on Oct 1, 2026, so replace both by late September 2027. |
| `GIVEBUTTER_API_KEY` | Givebutter → Settings → Developers | New key in Vercel; delete the old one. |
| `VAPID_PRIVATE_KEY` / `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | `npx web-push generate-vapid-keys` | Changing them means everyone turns phone alerts on again; only if it leaked. |
| `PAYPAL_CLIENT_SECRET` | PayPal developer site (treasurer) | Treasurer makes a new secret. |
| `TWH_CALENDAR_URL` | TroopWebHost → My Stuff → Subscribe | Signs in as that person: replace it when they leave, or remove it. |
| `MYSCOUTING_USERNAME` / `MYSCOUTING_PASSWORD` (optional, experimental) | A Key 3 delegate's my.scouting login | Turns on "Get training from my.scouting" (Leaders → Training → Import). It's a real person's password: when they leave or change it, remove both (or replace them), and change the password if it may have leaked. Optional `MYSCOUTING_ORG_GUID` pins the unit if it can't be found. |

After changing anything in Vercel, **Redeploy** (Deployments → ⋯ → Redeploy) so the app picks it up.

## 3. When you're handing it over (outgoing)

1. Pick the next person with the Committee Chair, ideally a few months ahead, and work alongside
   them for one change (a small feature or a fix) so they've done a deploy and a database update
   with you watching.
2. Add them to every service in the table above **before** removing yourself. Make them Owner or
   admin, not just a member.
3. Share the password manager vault. Move anything only you know into it.
4. Have them set up backups on their machine and confirm one runs (README → Backups). Then delete
   your copies of the backups and `backup.env`.
5. In the app, Pack admin → Families: give them the `admin` role, and change yours to what you'll be
   (or turn off your access if you're leaving the pack).
6. Change or delete the keys you made (section 2), especially `TWH_CALENDAR_URL` and any key tied to
   your own account.
7. Update the **Owner today** column above and the contact line in CONTRIBUTING.md, and commit.
8. Tell the committee who to ask now.

## 4. When you're taking it over (incoming)

1. Read the README, then this file, then [RESTORE.md](RESTORE.md).
2. Get access to every service in section 1. Sign in to each once so you know it works.
3. Set up the code on your computer (CONTRIBUTING.md → Getting set up), with your **own** test
   Supabase project, never the live one.
4. Run the checks: `npm run typecheck`, `npm run lint`, `npm run build`, and the database tests
   (README → Run the permission tests).
5. Set up the nightly backup and practice RESTORE.md section 1 once.
6. Walk through the app with the guide (`docs/guide/`), as a parent and as a leader.

## 5. How changes go live

- **Code:** new work goes to the `beta` branch first (beta.pack361.org, testers only), then is released
  by merging `beta` into `main` (app.pack361.org). See [RELEASES.md](RELEASES.md). Vercel builds and
  deploys each in a couple of minutes; a failed build leaves the old version running.
- **Database changes:** each change is a new file in `supabase/migrations/` (never edit one that's
  already been run). Run it in Supabase → SQL Editor **before** pushing code that needs it, then add
  a test in `supabase/tests/`. Supabase shows a "destructive operation" warning for some changes;
  read the file again before you confirm.
- **The app guide:** update `docs/guide/guide.html` and its PDF with any change families or
  leaders will notice (docs/guide/README.md).
- Work on a branch and open a pull request; GitHub runs the tests. A second person looking at
  changes to permissions, money or youth-protection features is a good habit.

## 6. Looking after it

| When | What |
|---|---|
| Every week | Glance at Pack admin: a warning shows if a nightly job failed, with the reason. |
| July (new season) | Leaders → Money → Settings for the new dues season; set up dues; registration dates; the budget (Money → Expenses → Budget). |
| Every few months | Supabase → Usage (database and storage; the free plan has 500 MB of database and 1 GB of files). Pack admin shows file storage. Vercel → Usage. |
| Every September | **Brevo API keys expire after a year** (both made around Oct 1, 2026). Make new ones in Brevo → SMTP & API, replace `BREVO_API_KEY` in Vercel (Production, and Preview for branch `beta`), redeploy, and delete the old keys. Until then pack-wide email and the Sunday newsletter stop working. |
| Once a year | Repeat the security review (SECURITY-REVIEW.md, "Repeating this review"). Practice a restore (RESTORE.md section 1). Renew the domain. Check every account in section 1 still has two owners. Update packages (`npm outdated`, then test and deploy). |
| When a leader leaves | Change their role in Pack admin, and if they had access to any service or key, remove them and change the key. |

## 7. If something breaks

1. **The site is down or erroring:** Vercel → Deployments. If the newest one broke it, use
   "Promote" or "Instant Rollback" on the previous one, then fix the code.
2. **Nobody can sign in:** Supabase status page, then Supabase → Authentication → Logs, then
   Resend → Logs (sign-in emails), and the rate limit (Authentication → Rate Limits, 20 an hour).
3. **A nightly job failed:** Pack admin shows which and why; Vercel → Logs has the details. Each
   job runs again the next day by itself.
4. **Data is wrong or missing:** RESTORE.md.
5. **Emails stopped:** Resend and Brevo dashboards (daily limits, domain still verified), and that
   the DNS records in Squarespace are still there.
6. **A leader lost their authenticator app** (two-step sign-in, guide section 2.8): any admin uses
   Pack admin → Two-step sign-in → Reset. **If every admin is locked out**, reset one from Supabase
   → SQL Editor (this removes their authenticator apps; they sign in with the email code and set
   one up again):

   ```sql
   delete from auth.mfa_factors
    where user_id = (select user_id from public.adults where lower(email) = lower('admin@example.com'));
   ```

## 8. To do now, while it's still easy

These make the table in section 1 true for the long run:

- [ ] Set up a shared password manager vault for the pack and put every login and the database
      password in it.
- [ ] Create a pack-owned email login (for example a Google account the Committee Chair and the app
      maintainer both can reach) and use it as the owner or second admin on GitHub, Supabase,
      Resend, Brevo and Squarespace.
- [ ] Move the repository into a GitHub organization for the pack with two owners.
- [ ] Add a second owner to the Supabase organization.
- [ ] Decide how Vercel will pass along (transfer when needed, or a paid team).
- [ ] Find out whose Squarespace account holds `pack361.org`, note the renewal date above, and add
      a second person.
- [ ] Add Aldrin (or the next maintainer) to GitHub, Supabase and Vercel, and do one change together.
