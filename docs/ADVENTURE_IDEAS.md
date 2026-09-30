# Adventure home ideas

`adventures.home`, `home_idea` and `info_url` (migration `20260929000400_pack_features.sql`) power the
"Try at home this week" card and the "what to do" links on each scout's page.

- `home`: `home` (a family can do most of it at home), `some` (a few requirements), `den` (needs the den,
  a campout, a range or trained staff).
- Ideas are written in plain words from the 2024 requirements on scouting.org rank and adventure pages
  (boyscouttrail.com 2024 pages where scouting.org was unreachable). Edit any row in the Supabase table editor.

## Research notes

URLs: every non-special adventure slug was confirmed on scouting.org, either by fetching the page or by a site:scouting.org search result (scouting.org intermittently returns 403 to automated fetches). Shared names use rank suffixes (bobcat-lion, lets-camp-wolf, race-time-bear, champions-for-nature-aol, summertime-fun-tiger); note fishing-aol and pick-my-path-lion carry suffixes even though their names are unique in the catalog, while other unique names use the bare slug. Special electives (Archery, BB Gun, Slingshot) have no per-rank adventure pages on scouting.org that could be found; their url is the official May 2024 lesson plan PDF. These must be run by trained range staff at council-sponsored events (not den/pack), and BB Gun is not offered to Lions. Requirement text for these pages was read from scouting.org directly, except where scouting.org blocked the fetch: Bobcat Wolf, A Wolf Goes Fishing, Air of the Wolf, Digging in the Past, Germs Alive!, Paws for Water, Pedal With the Pack, Champions for Nature Tiger, Floats and Boats, Race Time Lion, Bear Habitat, Fellowship, Champions for Nature Bear, Super Science, Whittling (from boyscouttrail.com 2024 pages). Race Time Webelos requirements could not be read from either source, so its idea is kept generic (build with an adult, learn the rules). Judgment calls: Let's Camp (all ranks) marked den per the camping rule, even though Webelos allows a family campout; Summertime Fun marked den since it requires Cub Scout den/pack/council activities; Whittling and Knife Safety marked some because the carving/cutting should be under adult supervision and packs often require it in den. The scouting.org Balancing Bears page body is headed 'Trail Mix Math' but matches the Balancing Bears requirements on boyscouttrail.
