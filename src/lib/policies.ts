// The pack's terms of use and data policy, as shown at /terms and /privacy (GuideBody's Markdown
// subset: ## headings, "- " bullets, "1. " steps, **bold**, [links]). The committee adopts both;
// the drafts live in the pack's documents. Raise TERMS_VERSION when a change matters enough that
// everyone should agree again: each adult's row records the version they agreed to and when.

export const TERMS_VERSION = 1;

export const TERMS_MD = `These terms are for everyone who signs in to the Pack 361 app at app.pack361.org. They go with the pack's [data policy](/privacy), which says what the app stores, who can see it and how long it's kept. The app asks you to agree to both the first time you sign in, and again whenever either one changes. They're written in plain English on purpose: if anything is unclear, ask.

## 1. What the app is

- **The pack's own tool.** Pack 361 volunteers run it for the pack's families and leaders, on behalf of Cub Scout Pack 361 and its chartered organization. The pack committee adopts it, and the chartered organization signs off.
- **Not an official Scouting America site.** Scoutbook Plus stays the official record of advancement, and my.scouting stays the official record of registration and training.
- **Optional.** Everything important also goes out by email or on paper, and you can still RSVP and pay the pack the usual ways.

## 2. How we protect your information

The pack takes your family's privacy and the security of its information seriously. The app is built with the same kinds of safeguards professional software uses:

- **Encryption** for every connection, for stored data and for backups.
- **No passwords to steal.** You sign in with a one-time code sent to your email, and every leader also enters a code from an authenticator app, at least once a month.
- **Access rules enforced inside the database**, not just on the screen, and checked by more than 1,500 automated tests on every change.
- **A security log** that no one can edit, recording every change to who can see what and every spreadsheet download.
- **Less to lose.** The app never stores ID numbers, card or bank numbers, passwords, birthdates, home addresses or medical details.
- **Ongoing checks:** automatic scans for leaked keys and known software flaws, encrypted nightly backups, and an independent review before families use it.

No system can promise perfect security. If something ever goes wrong, the [data policy](/privacy) says what the pack does, including telling the families affected.

## 3. Your account

- Accounts are for adults on the pack roster. Scouts don't have accounts.
- You sign in with a code or link sent to your email, so keep your email account secure. Don't forward sign-in emails or share codes. Leaders keep their authenticator app to themselves.
- If you think someone else got into your account, email [app@pack361.org](mailto:app@pack361.org) right away.

## 4. House rules

- **Family details are for pack business only.** Names, emails, phone numbers, scouts' names and dens that you see in the app stay inside the pack. Don't share them, add them to other mailing lists, or use them to sell, solicit or campaign.
- **Spreadsheets and downloads** are for the pack work your role needs. Delete copies when you're done with them.
- **Photos:** post only photos from pack activities. Respect families who opted out of photos, never post a photo that would embarrass a scout, and use first names only in captions.
- **Youth protection:** don't use the app or what you learn from it to contact a scout one-on-one. Scouting America's Safeguarding Youth rules apply here as everywhere: private online communication with a scout must include another registered leader or parent.
- **No sensitive papers:** never upload or type in medical forms, health details, ID documents, insurance cards or card numbers, for yourself or anyone else. Health forms stay on paper.
- **Stay within your role:** don't try to reach information your role doesn't allow, and don't test the app's security without the pack committee's written OK. Found a problem? Report it to [app@pack361.org](mailto:app@pack361.org).
- **Leaders:** use what you can see only for your pack role, and treat it as confidential.

## 5. What the pack does

- Runs the app with care and follows the data policy: it keeps only what the pack needs, and never stores birthdates, home addresses, medical details, ID numbers, card numbers or passwords.
- Tells affected families promptly if their information may have been seen by someone who shouldn't have, as the data policy describes.
- Asks you to agree again whenever these terms or the data policy change in a way that matters.
- May pause or remove access for anyone who breaks these rules, and turns off access when a family leaves the pack.

## 6. The fine print

- **Run by volunteers, as is.** Volunteers run the app in their own time. It's provided as is, without any promise that it will always be available or free of mistakes. Dates, times and amounts in the app are a convenience: if something matters, check with a leader.
- **You use the app at your own risk.** As far as the law allows, you agree not to hold Pack 361, its chartered organization or the volunteers who run the app responsible for any loss or harm from using the app, from relying on what's in it, or from its being unavailable. The law doesn't let anyone excuse gross negligence or willful misconduct, so this doesn't either.
- **Payments** go through Givebutter and PayPal, under their own terms. The app never sees card or bank numbers.
- **Maryland law** applies to these terms.

## 7. Questions

Questions about these terms or your information: [app@pack361.org](mailto:app@pack361.org). This is version ${TERMS_VERSION}.`;

export const DATA_POLICY_MD = `The pack takes families' privacy and the security of their information seriously. This is the pack's own policy for the Pack 361 app (app.pack361.org): what it keeps about families, who can see it, how long it's kept, and what families can ask for. Scouting America asks units for a notice wherever personal information is collected; this is that notice. It goes with the app's [terms of use](/terms).

## Purpose

The app is a pack tool, run by Pack 361 volunteers on behalf of the pack and its chartered organization. It isn't an official Scouting America site.

- **Using the app is optional.** Families who don't sign up still get everything they need by email or paper, and can RSVP and pay the usual ways.
- **Scoutbook stays the official record** for advancement and registration. The app copies from it and never replaces it.
- **It applies to everyone who signs in:** parents, leaders and admins.

## What the app stores

Only what the pack needs to run its program:

- **Adults:** name, email, phone, role and pack position, BSA member ID, training dates, registration expiry, and when you agreed to these terms.
- **Scouts:** first and last name, den, BSA member ID, and the family's photo and Facebook choices.
- **Program records:** advancement imported from Scoutbook's export file, RSVPs and attendance, whether a health form is on file and when it expires, money owed and paid (amount, date, method), permission slips (a typed signature and how to reach the parent during that event), and requests to join (name, phone and the scouts' grades).
- **Photos and documents:** a private album, pack papers and expense receipts, visible only to signed-in members (receipts to key leaders).

## What it never stores

The pack doesn't put these in the app, and leaders shouldn't type them into notes or event details:

- Social Security, driver's license, passport or other ID numbers
- Card or bank account numbers (PayPal and Givebutter handle payments)
- Passwords (everyone signs in with an emailed code)
- Health or medical details, health insurance IDs, or the health forms themselves: **health forms stay on paper**, as Scouting America requires
- Birthdates, and family home addresses (a den meeting at a leader's home shows that address to that den's families)
- Anything about a scout that would identify them on a public page

This keeps the app clear of the information that triggers Maryland's data-breach notice law.

## Where it lives

The data is kept by well-known services (Supabase for the database, in the US; Vercel for the website; Resend and Brevo for email). The accounts belong to the pack's own account, not a volunteer's, and its sign-in is shared by two people through the pack's password vault. Data is encrypted in storage and in transit. Backups are encrypted too (the database nightly, photos and documents weekly), kept 60 days on the backup server and in the pack's own Google Drive, and the key to open them is kept in the pack's password vault.

## Who can see what

Each person sees only what their job needs, and the database enforces it, not just the screens.

- **Parents** see their own family's records, the pack calendar, news and the photo album, and leaders' contact details. Never other families' records (only what a family chooses to post on an event's carpool board).
- **Den leaders** see all families' contact details, medical-form status and event RSVPs, and attendance and advancement for their own den.
- **Key leaders** (today the Committee Chair and Treasurer) see pack-wide money and records.
- **Admins** (the Cubmaster and pack admins) add and remove people, change roles and import data. Every change to people, roles, den leaders and report access, and every spreadsheet download, is written to a security log that no one can edit.
- Every leader enters a second code from an authenticator app, at least once a month, before seeing anything beyond their own family.

## Youth protection and photos

- Scouts have no accounts. Only registered adults sign in, and there is no private messaging; leaders message parents.
- Each family chooses whether their scout can appear in pack photos and, separately, on the pack's public Facebook page. Families' photos wait for a leader's review, and any family can ask for a photo to come down.
- Leaders keep Signal groups linked from events adults only, with two or more leaders in each and disappearing messages off.
- The public join page shows only each event's name, date and a short note. Times and places go to families who ask.

## How long records are kept

- **Requests to join:** deleted 90 days after they're decided.
- **Photos in the album:** deleted after the number of months set in Pack admin (24 today).
- **Security log:** two years.
- **Backups:** 60 days.
- **A family that leaves:** sign-in is turned off right away; contact details and sign-in are cleared automatically 24 months after the family leaves, keeping only names and advancement history for the pack's records.

## What families can ask for

Email [app@pack361.org](mailto:app@pack361.org) to see what the app holds about your family, correct it, change your photo choices, take a photo down, or have your family removed. A leader will answer within a week.

## If something goes wrong

If information may have been seen by someone who shouldn't have it:

1. The app maintainer shuts off the access involved (a sign-in, a key, a shared link) and tells the Committee Chair the same day.
2. The Committee Chair tells the chartered organization and the district executive.
3. Families affected are told what happened and what was involved, within a few days.
4. What happened and what changed is recorded in the committee minutes.

## Who is responsible

- **App maintainer:** Chris Nealen. Runs the app, keeps this policy true, and reviews the security log.
- **Committee Chair:** shares the pack account's sign-in and the pack's password vault with the app maintainer.
- The pack committee decides changes to this policy; the chartered organization signs off. It's reviewed every year at the committee's planning meeting, and whenever the app starts storing something new.
- The app is a pack tool, adopted by the committee and the chartered organization. Leaders who use or maintain it do so as part of their volunteer role for the pack, not as individuals.

## Sources

- Scouting America, [Local Council Advisory: Digital Safety](https://scoutingmontana.org/wp-content/uploads/2020/04/Local-Council-Advisory-Digital-Safety-in-a-Time-of-Increased-Online-Activity.pdf) (2020): a notice at the point of collection.
- Scouting America, [Guide to Advancement, section 4](https://filestore.scouting.org/filestore/pdf/gta-section-4.pdf): Scoutbook Plus is the official record.
- [Say no to digitizing medical records](https://onscouting.org/2015/01/23/say-no-to-digitizing-medical-records/), Scouting magazine: health forms stay on paper.
- Maryland [Commercial Law §14-3501](https://mgaleg.maryland.gov/mgawebsite/Laws/StatuteText?article=gcl&section=14-3501&enactments=False&archived=False): what counts as personal information.
- Scouting America, [A Parent's Guide](https://filestore.scouting.org/filestore/ypt/pdf/100-015.pdf): digital communication with youth.`;
