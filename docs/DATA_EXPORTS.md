# Getting Pack 361 data into the app

None of these systems has a public API (Scouting America has said it won't release one for Scoutbook,
and TroopWebHost doesn't document one), so the roster and advancement come in as file exports.
Givebutter is different: the app reads it through the Givebutter API (see the README).

Drop the files in `pack361-app/imports/` (that folder is git-ignored; roster files contain kids' names).

## Needed first

| # | File | Where | Loads into |
|---|---|---|---|
| 1 | **Roster CSV** | Scoutbook Plus (advancements.scouting.org) → **Reports** → **+ New Report** → **New Custom Roster Report** → select Pack 361 → tick all Scout *and* Adult/Parent fields (names, relationship, email, phone, den, position, member ID) → **Export CSV** | `families`, `adults`, `scouts`, `dens`, `den_leaders` |
| 2 | **Roster Excel** (cross-check) | TroopWebHostCS → **Membership** → **Export Membership Data** → **Export Roster to Excel** | Fills gaps. Since July 2026, Scoutbook Plus parent data comes from Akela and can be incomplete. |
| 3 | **Training report** (CSV or .xlsx) | my.scouting.org → Menu → My Dashboard → **Training Manager** (unit training report), or Pack 361 → **YPT Reports** (Safeguarding Youth Training Aging report) → **Export** *(Key 3 only: CC, COR or Cubmaster may need to run it)* | `adult_trainings`, through Leader training → **Import from my.scouting** (read in the browser; the file isn't uploaded) |

## Nice to have

| # | File | Where | Loads into |
|---|---|---|---|
| 4 | **Advancement CSV** | Scoutbook Plus → **Reports** → scroll to **Quick Export** → **Advancement** row → **Export** | `scout_advancement` (read-only progress bars) |
| 5 | **Calendar** | TroopWebHostCS → **My Stuff** → **Subscribe to Calendar** (copy the iCal URL) *or* **Calendar → Export Events to Excel**. Scoutbook Plus calendar also has .ics links at the bottom of the page. | `events` |
| 6 | **Event participation** | TroopWebHostCS → **Calendar** → **Export Event Participation to Excel** | future: attendance / camping nights |

## Givebutter: nothing to export
The connector already reads the pack's Givebutter account ("Cub Scouts Pack 361 - Ellicott City"):
campaigns, events and ticket counts. The upcoming picnic and fall campout in `supabase/seed.sql` came from there.
Later, the app can show "dues paid / campout paid" per family by matching Givebutter tickets to roster emails.

## Facts that aren't in any export
- Chartered organization name
- Pack meeting and den meeting locations
- Pinewood Derby venue and date
- Whether "Trailblazers" is the pack's real nickname (it came from the mockups)
- Nearest ER, camp office phone and gate code for Broad Creek (the campout map has placeholders)

## Permissions
The Custom Roster Report needs the **Unit Support** functional role in Scoutbook Plus. A Key 3 member
grants it in Permission Manager. The YPT report is Key 3 only.

Sources: Scouting America discussion forums and Scoutbook help knowledge base (2024–2026),
TroopWebHost help pages 172, 217, 219, 526, 558.
