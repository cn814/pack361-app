# Security review, October 2026

A review of the Pack 361 app on 2026-10-02: the code, the database access rules, the packages, and
the setup around them. It was done from the code and a local copy of the database, not by an
outside firm. Repeat it once a year, or after a big change (RELEASES.md).

## Summary

No serious problems. Nobody signed out can see anything but the public join page and published
public guide pages. A parent can't read or change another family's information, raise their own
access, or reach money, roster or youth records beyond their own family. Every leader and money
action is checked twice: in the app and again in the database.

The review found 12 smaller issues. Ten are fixed (release 1.4, database change
`20261006000000_security_review.sql`, tests in `supabase/tests/24_security_tests.sql`). Two are
accepted, with reasons.

## What was checked

| Area | How | Result |
|---|---|---|
| Database access rules | All 930 automated checks, plus an attacker-style pass on a local copy: every table tried for read, change and delete as a signed-out visitor and as an ordinary parent | Signed-out: only public guide pages readable. Parent: only their own family's rows, and only the columns they may change |
| Functions callable from outside | Every database function the app's public key can reach, checked for its own permission test and a fixed search path | All check the caller; none missing a fixed search path |
| File storage | All four buckets and their upload, read and delete rules | All private. Found an unused bucket open to any upload, and no limit on uploads per person (fixed) |
| Server actions and routes | Every one of the app's actions, file links, spreadsheet downloads, the calendar feed and the nightly jobs, reviewed for missing checks, acting on other people's records, unsafe redirects, injection and leaks | Findings below; nothing that exposes another family's data |
| Packages | `npm audit` | 0 known vulnerabilities |
| Web settings | Security headers in `next.config.ts`, the public-page list in `src/proxy.ts` | No framing, no content sniffing, strict referrer, HTTPS only. Public paths are only the join page, sign-in, safety page, calendar feed (secret link) and the nightly jobs (secret key) |

## Findings and what was done

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | Medium | In app emails, any paragraph that was only a link became a pack-styled "Open the Pack 361 app" button. A member could send a "Report a problem" note (or a leader an announcement) that was just a link to a fake sign-in page, and the admins would get a convincing pack button pointing at it. | Only links into the app (and my.scouting.org) become buttons now; any other link shows as plain text (`src/lib/email.ts`). |
| 2 | Low–medium | No limit on "Report a problem" notes, and each one emails and alerts every admin. Someone could flood the admins and use up the day's email allowance, which the sign-in codes share. | At most 10 a day per person (database trigger). |
| 3 | Low | Taking someone off a den left their den-leader access on (they could still see every family and edit events). Turning off a family left its leaders' sign-ins on, without saying so. | Removing a den leader who leads no other den puts them back to parent access. Turning off a family now names any leaders still on. |
| 4 | Low | A poll's creator could still change its question and options after people voted (votes are stored as option numbers), and could still edit polls after no longer being a leader. | After posting, only the closing date can change, and only leaders (or admins) can edit or delete. |
| 5 | Low | A family's private calendar feed link could never be changed, so a leaked link (pasted into a shared calendar, say) kept showing the den schedule, including meeting places at homes. | "Shared it by mistake? Get a new link" on Events → Add the pack calendar. |
| 6 | Low | The unused "advancement evidence" file bucket accepted any file of any size from any member. | Uploads to it are closed; it has the same limits as the others. |
| 7 | Low | No limit on how many photos or receipts one person could upload, so one account could fill the pack's 1 GB of file storage. | 300 photo files (about 150 photos) and 40 receipt files a day per person; leaders are exempt from the photo limit. |
| 8 | Low | The nightly jobs' secret was compared in a way that, in theory, leaks timing. | Constant-time comparison (`src/lib/cron-auth.ts`). |
| 9 | Low | The "Sign in here" button's form could be posted from another site, which could sign a visitor into someone else's account. | It now only accepts posts from the app itself. |
| 10 | Low | When a den leader edited an event, families' event charges were never refreshed, with no error shown. Prices were safe, because the database stops den leaders changing them. | Only leadership edits refresh charges, which is what the database allows. |
| 11 | Hygiene | A few internal helper functions could be run by signed-out visitors (they are not reachable through the app's public interface). | Taken away from signed-out visitors. |
| 12 | Accepted | Opening a sign-in link on a computer signs in right away. Someone could send you a sign-in link for *their* account; you'd end up signed in as them. | Standard for sign-in links, and they'd need to be on the roster. Phones already ask first. |
| 13 | Accepted | The `popcorn_sales` table (from an early version) is readable by members but unused, and holds only scout IDs and amounts, which parents can't match to names. | Leave it; remove it when popcorn sales are built or dropped. |

## Released (2026-10-02)

The database change was run in Supabase on 2026-10-02 and checked afterwards: the feedback limit
is on, poll questions and options can't be changed, the evidence bucket takes no uploads, and
signed-out visitors can't run the helper functions. Release 1.4 went to beta, then live, the same
morning.

**Live checks, signed out** (app.pack361.org and beta.pack361.org):

| Check | Result |
|---|---|
| `/.env`, `/family`, `/admin` | Sent to the sign-in page; no file is served |
| `/api/cron/daily`, `/api/cron/givebutter`, with no key or a wrong key | 401 unauthorized |
| `/get`, `/safety` | Open, as intended |
| Response headers | HTTPS only for a year (with subdomains), no framing (`X-Frame-Options: DENY` and `frame-ancestors 'none'`), `nosniff`, strict referrer, camera/microphone/location limited |
| Live site | No beta stripe |

**Supabase Security Advisor** (rerun after the change): 0 errors, 34 warnings, none needing a fix:

- 32 × "Signed-in users can execute SECURITY DEFINER function": these are the app's own actions
  (RSVPs, votes, payments, attendance, join requests and so on). The app calls them on purpose, and
  each one checks who is asking before doing anything (see "Functions callable from outside" above).
  Check any new one the same way.
- 1 × "Public can execute" `join_page_events()`: the public join page. It returns only the title,
  time, place and blurb of upcoming events a leader ticked "show on the join page", and never
  leaders-only or archived events.
- 1 × "Leaked password protection disabled": doesn't apply, because the app has no passwords
  (everyone signs in with an emailed code).

## Still to do (outside the app)

1. **Turn on two-step sign-in** for every account behind the app: GitHub, Vercel, Supabase,
   Squarespace (it was showing a "Secure your account" banner), Resend, Brevo, Givebutter and the
   Google account used to sign in to them. Someone in one of those can change the app itself, which
   matters more than any single user account.
2. **Two-step sign-in in the app** for admins, the Cubmaster and leadership (proposed, not built).

## Repeating this review

- `npm audit` (should report 0 vulnerabilities).
- The database tests: `supabase/tests/run.sh` (README → Run the permission tests).
- The attacker-style table pass: for each table in `public`, as `anon` and as an ordinary parent,
  try `select`, `update` and `delete`, and confirm only their own rows are affected.
- Supabase → Advisors → Security Advisor → Rerun linter; compare with the list above.
- The live checks above, signed out (open each address, or use the browser's developer tools).
- Read every new server action and route: does it check who's asking, and does the database check
  again? Any use of the secret key (`createAdminClient`) needs a reason and a check before it.
