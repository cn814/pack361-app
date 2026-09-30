-- Starter pages for the Pack guide. Committee members edit them in the app (Pack guide ->
-- Edit). Pages marked is_published = false are drafts: leaders see them with a "Draft" badge,
-- families don't, until someone fills in the pack-specific details and publishes them.
-- Body text uses a small subset of Markdown: ## headings, - bullets, 1. steps, **bold**,
-- [links](https://...) and > notes.

insert into public.guide_pages (slug, section, sort_order, title, summary, is_published, body) values

('welcome', 'Getting started', 10, 'Welcome to Pack 361',
 'Who we are, when and where we meet, and how the year works.', true,
$g$Pack 361 is a co-ed Cub Scout pack for kindergarten through 5th grade, serving Centennial Lane Elementary School and the surrounding area in Ellicott City for over 35 years.

## When and where we meet
- **Den meetings:** most Monday evenings, 6:30 to 7:30 PM. Your scout meets with their den (the kids in their grade) and den leader.
- **Pack meetings:** about once a month on a Monday, 6:30 to 8:00 PM. The whole pack meets together for ceremonies, awards and activities.
- Unless an event says otherwise, we meet at the First Presbyterian Church of Howard County in Columbia.
- Some den meetings happen somewhere else (a hike, a museum, a service project). The event in the app says where.

## What the year looks like
- **Fall:** welcome events, popcorn sales, a family campout, and service projects.
- **Winter:** the Pinewood Derby and the Blue & Gold banquet, which celebrates Scouting's birthday.
- **Spring:** crossover and Arrow of Light ceremonies, another campout, and moving up to the next rank.

The [Events tab](/events) always has the current schedule, and you can add the pack calendar to your phone's calendar from there.

## Where to find things
- **Home:** the next event, announcements and anything that needs your attention.
- **Scouts:** your scout's rank, what's done and what's left.
- **Events:** the calendar, campout pages and RSVPs.
- **Leaders:** who's who, with phone and email.
- **My family:** your contact info, photo permission, medical forms, dues and alerts.$g$),

('ranks', 'Ranks and advancement', 20, 'Ranks by grade',
 'Which rank your scout is working on, and what each one involves.', true,
$g$Each grade has its own rank. Scouts work on it through the school year, mostly in den meetings, with a few pieces done at home.

- **Lion:** kindergarten
- **Tiger:** 1st grade
- **Wolf:** 2nd grade
- **Bear:** 3rd grade
- **Webelos:** 4th grade
- **Arrow of Light:** 5th grade, the last Cub Scout rank before joining a Scouts BSA troop

## Adventures
Each rank is made of **adventures**: short units about a topic, like hiking, first aid, cooking or citizenship. Some adventures are required for the rank and some are electives the den chooses. Bobcat is the first adventure at every rank.

Your scout's page in the app ([Scouts](/scouts)) shows exactly which adventures and requirements are done and what's left.

## Handbooks
Each rank has a handbook with every adventure and its requirements. Scouts don't need it to earn the rank, since dens work from the leader's plan, but many families like having it at home.$g$),

('advancement', 'Ranks and advancement', 30, 'How advancement works',
 'Doing requirements at home, getting them approved, and when awards are handed out.', true,
$g$## In den meetings
Most requirements happen in den meetings. The den leader records them for everyone who was there, so there's nothing for you to do.

## At home
Some requirements are meant to be done at home with a parent (Lion and Tiger adventures especially). When your scout finishes one:
1. Open your scout on the [Scouts](/scouts) tab.
2. Tap the adventure, check off what they did, and send it.
3. The den leader approves it, and it's entered in Scoutbook, the official Scouting America record.

## Awards
Adventure awards and rank badges are handed out at pack meetings after they're entered in Scoutbook. If something seems to be missing, ask your den leader.$g$),

('uniforms', 'Uniforms', 40, 'Uniforms and patches',
 'What to buy, when to wear it, and where the patches go.', false,
$g$> Draft for leaders: confirm the pack's uniform rules and fill in the details below, then publish.

## What to wear
- **Pack and den meetings, ceremonies:** the Cub Scout uniform shirt and your rank's neckerchief. [Leaders: say which parts the pack expects, and whether belts, hats and pants are optional.]
- **Outings and campouts:** the pack T-shirt or hoodie is fine. Order pack shirts from the [Pack store](/store).

## Where to buy
- The Scout Shop (online at scoutshop.org, or the council shop). [Leaders: add the nearest shop.]
- Families who've outgrown uniforms often pass them on. [Leaders: say whether the pack has a uniform closet.]

## Patches
Every Cub Scout wears the council patch, the pack number (361) and the rank patch. [Leaders: add a link to the official Cub Scout uniform inspection sheet, which shows where each patch goes.]$g$),

('camping', 'Camping and outings', 50, 'Family camping',
 'How Cub Scout campouts work and what every camper needs.', true,
$g$Cub Scout camping is **family camping**: each scout camps with their own parent or guardian. Each campout page says whether siblings can come.

## Before you go
- Sign up on the campout's page in the app (Events tab) and pay if there's a fee.
- Every camper, adults included, needs a current **medical form, Parts A and B**. See [Medical forms](/guide/medical-forms).
- Check the packing list on the campout page. You can check items off as you pack, and it works without signal.
- Missing gear is never a reason to skip. Ask about borrowing a tent, sleeping bag or pad.

## At camp
- Adults tent only with their own children, one family to a tent.
- No adult is ever alone with a scout who isn't their own child.
- Everyone wears sturdy closed-toe shoes.
- Scouts use the buddy system, and a BALOO-trained leader is in charge of every pack overnight.

## The Cub Scout Six Essentials
Bring these on every hike: a first aid kit, a filled water bottle, a flashlight, trail food, sun protection and a whistle.$g$),

('medical-forms', 'Camping and outings', 60, 'Medical forms',
 'The Annual Health and Medical Record: who needs it, and how to turn it in.', true,
$g$Everyone who goes on a pack campout or overnight, **scouts and adults**, needs Scouting America's Annual Health and Medical Record, **Parts A and B**, completed within the last 12 months.

1. Download the form: [Parts A and B (PDF)](https://filestore.scouting.org/filestore/HealthSafety/pdf/680-001_AB.pdf).
2. Fill it out and sign it. Part B lists allergies, medications and insurance, so attach a copy of both sides of your insurance card.
3. Give the paper form to the campout leader or bring it to a pack meeting. **Don't upload it to the app.** The app never stores medical information.
4. In the app, go to [My family](/family#paperwork) and tap **I turned it in**, with the date on the form. A leader confirms it when they receive it.

The app shows when each form expires and reminds you before the next campout.

> Part C, a physical exam by a doctor, is only needed for events longer than 72 hours, like summer camp. The camp will say if it needs one.$g$),

('youth-protection', 'Safety', 70, 'Youth protection',
 'The rules that keep every scout safe, and who to call with a concern.', true,
$g$Scouting America's youth protection rules apply to every pack activity, in person and online.

- **Two-deep leadership:** at least two registered adults at every activity.
- **No one-on-one contact:** no adult is ever alone with a scout who isn't their own child, in person, in a car, or online.
- **Digital communication:** leaders message parents, not scouts. This app has no messaging to or between scouts, and scouts don't have accounts.
- **Training:** every registered adult completes Safeguarding Youth training at my.scouting.org and renews it every two years.
- **At home:** each year Cub Scouts watch the Protect Yourself Rules videos with their family as part of their rank.

## If you have a concern
Call the **Scouts First Helpline, 1-844-SCOUTS1 (1-844-726-8871)**. In an emergency, call 911. You can also talk to the Cubmaster or Committee Chair.

Read more about how the app protects your family on the [safety page](/safety).$g$),

('dues', 'Money', 80, 'Dues and fees',
 'What pack dues cover, how much they are, and how to pay.', false,
$g$> Draft for leaders: fill in the amounts and how to pay, then publish. The amount and payment details also go in Pack admin -> Pack settings, so they show on each family's page.

## What dues cover
[Leaders: for example, badges and awards, pack meeting supplies, Pinewood Derby cars, and part of the Blue & Gold banquet.]

## How much
- Pack dues for the year: [amount]
- Scouting America national registration: [amount, paid when you register]
- Campouts and some events have their own fee, listed on the event.

## How to pay
[Leaders: TroopWebHost, Givebutter, check to the pack, and so on.]

If cost is ever a reason your scout might miss out, talk to the Cubmaster or Committee Chair privately. The pack helps.$g$),

('fundraising', 'Money', 90, 'Popcorn and fundraising',
 'How the pack raises money, and how your scout can help.', false,
$g$> Draft for leaders: fill in this year's popcorn details, then publish.

## Popcorn
Fall popcorn sales pay for most of the pack's program and keep dues low. Scouts sell online, door to door with a parent, and at storefront shifts (listed on the calendar).
- Sale dates: [dates]
- How to sell online: [link and instructions]
- Prizes: [details]

## Other fundraisers
[Leaders: add anything else the pack runs during the year.]$g$),

('volunteering', 'Getting involved', 100, 'Helping out',
 'Every family pitches in. Here''s how to find something that fits.', true,
$g$The pack is run entirely by parent volunteers, and many small helpers beat a few burned-out ones.

- **Volunteer jobs:** events and campouts list jobs like setup, cooking and check-in. Open ones show on the Home page. Sign up in one tap, and the app reminds you.
- **Committee meetings:** open to every parent, not just leaders. They're on the calendar, and this is where the pack's plans get made.
- **Roundtable:** a monthly district meeting where leaders share ideas. Anyone thinking about leading is welcome.
- **Leading a den** or joining the committee: talk to the Cubmaster or Committee Chair. Scouting America provides the training.

Adults who help regularly need to register and complete Safeguarding Youth training. See [Youth protection](/guide/youth-protection).$g$),

('app-help', 'Using the app', 110, 'Using the app',
 'Putting it on your phone, signing in, alerts, and reporting problems.', true,
$g$## Put it on your phone
- **iPhone, Safari:** tap the Share button (the square with an arrow) at the bottom, then **Add to Home Screen**.
- **iPhone, Chrome:** tap the Share button at the right end of the address bar, then **Add to Home Screen**. It isn't in Chrome's ⋯ menu.
- **Android:** tap the ⋮ menu, then **Add to Home screen** or **Install app**.

Then open Pack 361 from the new icon.

## Signing in
There's no password. Enter the email address the pack has for you, and type in the code from the email. If you use a different email, ask a leader to update it.

## Alerts
Turn on phone alerts in [My family](/family). On iPhone, alerts only work from the home-screen app.

## Something wrong?
Use **Report a problem or send a note** at the bottom of [My family](/family), or email info@pack361.org.$g$),

('contacts', 'Using the app', 120, 'Who to ask',
 'Who handles what, and how to reach them.', true,
$g$- **About your scout's den, meetings or advancement:** your den leader.
- **About pack events, campouts or anything else:** the Cubmaster or Committee Chair.
- **General questions:** info@pack361.org.

Phone numbers and emails for every leader are on the [Leaders](/leaders) tab.

For a youth protection concern, call the Scouts First Helpline, 1-844-SCOUTS1 (1-844-726-8871).$g$),

('faq', 'Getting started', 15, 'Common questions',
 'Answers to what new families ask most.', false,
$g$> Draft for leaders: check and fill in the pack's answers, then publish.

## Can siblings come to meetings and events?
[Leaders: the pack's answer.]

## What if we miss a den meeting?
Your den leader can tell you what was covered. Many requirements can be made up at home.

## Does a parent have to stay at meetings?
[Leaders: the pack's answer. Lions and Tigers always work with an adult partner.]

## What happens when my scout finishes Arrow of Light?
They "cross over" into a Scouts BSA troop in the spring. Troops visit the pack, and Webelos visit troops, so families can choose one.

## How do we join?
[Leaders: link to the online application or beascout.org, and say who to contact.]$g$)

on conflict (slug) do nothing;
