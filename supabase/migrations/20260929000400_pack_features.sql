-- More pack features (2026-09-29):
--   pack_settings        small key/value settings admins can change (awards cutoff, popcorn sale info)
--   adventures           + "do it at home" rating, idea and scouting.org link per adventure
--   events               + links and info sections (campout pages: rules, what to bring, jobs...)
--   adults               + calendar_token for the private calendar subscription link
--   givebutter_campaigns / givebutter_orders   copied from Givebutter by the sync job (secret key only)
--   push_subscriptions   phones/browsers that asked for announcement notifications
--   popcorn_sales        Trail's End sales per scout, from the admin's upload
-- No new SECURITY DEFINER functions: the sync and push jobs run server-side with the secret key.

-- -----------------------------------------------------------------------------
-- 1. Settings
-- -----------------------------------------------------------------------------
create table public.pack_settings (
    key         text primary key,
    value       text not null,
    updated_at  timestamptz not null default now()
);
insert into public.pack_settings (key, value) values
    ('awards_tracked_from', '2026-07-01'),   -- older approved items count as already handed out
    ('popcorn_scout_goal', '100'),           -- Trail's End goal per scout, in dollars
    ('popcorn_ends', ''),
    ('popcorn_store_url', ''),
    ('popcorn_note', 'Sell with the Trail''s End app (storefront, wagon and online sales all count).');

-- -----------------------------------------------------------------------------
-- 2. Adventure home ideas
-- -----------------------------------------------------------------------------
alter table public.adventures
    add column home      text check (home in ('home', 'some', 'den')),
    add column home_idea text,
    add column info_url  text;

-- -----------------------------------------------------------------------------
-- 3. Event links and info sections
--    links:    [{"label": "...", "url": "...", "note": "..."}]
--    sections: [{"title": "...", "tone": "warn"|"info"|null, "body": "...", "items": ["..."]}]
-- -----------------------------------------------------------------------------
alter table public.events
    add column links    jsonb not null default '[]',
    add column sections jsonb not null default '[]';

-- -----------------------------------------------------------------------------
-- 4. Calendar subscription token (the feed only lists pack events, same for everyone)
-- -----------------------------------------------------------------------------
alter table public.adults add column calendar_token uuid not null default gen_random_uuid();
create unique index adults_calendar_token_key on public.adults(calendar_token);

-- -----------------------------------------------------------------------------
-- 5. Givebutter copies
-- -----------------------------------------------------------------------------
create table public.givebutter_campaigns (
    id                  bigint primary key,           -- Givebutter campaign id
    code                text,
    title               text not null,
    slug                text,
    url                 text,
    type                text,
    status              text,
    goal                numeric,
    raised              numeric,
    donors              int,
    end_at              timestamptz,
    event_id            uuid references public.events(id) on delete set null,
    show_as_fundraiser  boolean not null default false,  -- apparel, donations: listed on Fundraisers
    families_registered int not null default 0,
    tickets_sold        int not null default 0,
    synced_at           timestamptz not null default now()
);

create table public.givebutter_orders (
    id           bigint primary key,                  -- Givebutter transaction id
    campaign_id  bigint not null references public.givebutter_campaigns(id) on delete cascade,
    family_id    uuid references public.families(id) on delete set null,   -- matched by email
    name         text,
    email        text,
    amount       numeric,
    tickets      int not null default 0,
    items        jsonb not null default '[]',         -- [{"description": "...", "quantity": 1}]
    status       text,
    created_at   timestamptz,
    synced_at    timestamptz not null default now()
);
create index givebutter_orders_campaign_idx on public.givebutter_orders(campaign_id);
create index givebutter_orders_family_idx on public.givebutter_orders(family_id);

-- -----------------------------------------------------------------------------
-- 6. Push notification subscriptions
-- -----------------------------------------------------------------------------
create table public.push_subscriptions (
    id          uuid primary key default gen_random_uuid(),
    adult_id    uuid not null references public.adults(id) on delete cascade,
    endpoint    text not null unique,
    p256dh      text not null,
    auth        text not null,
    user_agent  text,
    created_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 7. Popcorn (Trail's End) sales per scout
-- -----------------------------------------------------------------------------
create table public.popcorn_sales (
    scout_id    uuid primary key references public.scouts(id) on delete cascade,
    amount      numeric not null default 0 check (amount >= 0),
    updated_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 8. Privileges and RLS
-- -----------------------------------------------------------------------------
revoke all on public.pack_settings, public.givebutter_campaigns, public.givebutter_orders,
              public.push_subscriptions, public.popcorn_sales from anon, authenticated;
grant select on public.pack_settings, public.givebutter_campaigns, public.givebutter_orders,
                public.push_subscriptions, public.popcorn_sales to authenticated;
grant insert, update, delete on public.pack_settings, public.popcorn_sales to authenticated;
grant insert, delete on public.push_subscriptions to authenticated;
grant update (show_as_fundraiser, event_id) on public.givebutter_campaigns to authenticated;
grant update (home, home_idea, info_url) on public.adventures to authenticated;

alter table public.pack_settings        enable row level security;
alter table public.givebutter_campaigns enable row level security;
alter table public.givebutter_orders    enable row level security;
alter table public.push_subscriptions   enable row level security;
alter table public.popcorn_sales        enable row level security;

create policy settings_read on public.pack_settings for select to authenticated using (private.is_member());
create policy settings_write on public.pack_settings for all to authenticated
    using (private.is_admin()) with check (private.is_admin());

create policy gb_campaigns_read on public.givebutter_campaigns for select to authenticated using (private.is_member());
create policy gb_campaigns_edit on public.givebutter_campaigns for update to authenticated
    using (private.is_admin()) with check (private.is_admin());

-- Families see their own orders and registrations; leaders see everyone's.
create policy gb_orders_read on public.givebutter_orders for select to authenticated
    using ((family_id is not null and family_id = private.my_family_id()) or private.is_leader());

create policy push_own_read on public.push_subscriptions for select to authenticated
    using (adult_id = private.current_adult_id());
create policy push_own_add on public.push_subscriptions for insert to authenticated
    with check (adult_id = private.current_adult_id());
create policy push_own_remove on public.push_subscriptions for delete to authenticated
    using (adult_id = private.current_adult_id());

create policy popcorn_read on public.popcorn_sales for select to authenticated using (private.is_member());
create policy popcorn_write on public.popcorn_sales for all to authenticated
    using (private.is_admin()) with check (private.is_admin());

-- -----------------------------------------------------------------------------
-- 9. Home ideas for each adventure (2024 program; research notes in docs/ADVENTURE_IDEAS.md)
-- -----------------------------------------------------------------------------
update public.adventures a
   set home = v.home, home_idea = v.idea, info_url = v.url
  from (values
    ('lion', 'Bobcat', 'home', 'Read the Scout Law together and talk about being friendly, then do the Parent''s Guide activities at home.', 'https://www.scouting.org/cub-scout-adventures/bobcat-lion/'),
    ('lion', 'Mountain Lion', 'home', 'Pack the Cub Scout Six Essentials and take a 20-minute family walk, pointing out natural vs. man-made things.', 'https://www.scouting.org/cub-scout-adventures/mountain-lion/'),
    ('lion', 'Fun on the Run', 'home', 'Sort dinner foods into the five food groups, then dance or play freeze tag together for 20 minutes.', 'https://www.scouting.org/cub-scout-adventures/fun-on-the-run/'),
    ('lion', 'King of the Jungle', 'home', 'Have your Lion draw everyone in your household, then pick a helper job they do for the family this week.', 'https://www.scouting.org/cub-scout-adventures/king-of-the-jungle/'),
    ('lion', 'Lion''s Roar', 'home', 'Watch the Protect Yourself Rules video together, then practice Shout, Run, Tell and how to call 911.', 'https://www.scouting.org/cub-scout-adventures/lions-roar/'),
    ('lion', 'Lion''s Pride', 'home', 'Talk about your family''s faith traditions and have your Lion draw a favorite holiday, then make a card for someone.', 'https://www.scouting.org/cub-scout-adventures/lions-pride/'),
    ('lion', 'Build It Up, Knock It Down', 'home', 'Build a pillow fort or LEGO house together, then set up a domino run that is meant to be knocked down.', 'https://www.scouting.org/cub-scout-adventures/build-it-up-knock-it-down/'),
    ('lion', 'Champions for Nature', 'home', 'Sort household trash into paper, plastic, metal, glass and food scraps, and talk about what can be recycled.', 'https://www.scouting.org/cub-scout-adventures/champions-for-nature-lion/'),
    ('lion', 'Count on Me', 'home', 'Make a lion out of paper circles, squares and triangles, then play hopscotch or dominoes together.', 'https://www.scouting.org/cub-scout-adventures/count-on-me/'),
    ('lion', 'Everyday Tech', 'home', 'Play I Spy for technology around the house, then make simple rules for using a tablet or phone safely.', 'https://www.scouting.org/cub-scout-adventures/everyday-tech/'),
    ('lion', 'Gizmos and Gadgets', 'home', 'Race toy cars down a ramp, talk about pushes and pulls, and turn a recycled container into a planter.', 'https://www.scouting.org/cub-scout-adventures/gizmos-and-gadgets/'),
    ('lion', 'Go Fish', 'some', 'Go over fishing safety rules together and draw a fish you might catch at a nearby pond; the outing comes later.', 'https://www.scouting.org/cub-scout-adventures/go-fish/'),
    ('lion', 'I''ll Do It Myself', 'home', 'Decorate a reusable bag for Scout gear, make a morning/bedtime routine chart, and practice shoes on and off.', 'https://www.scouting.org/cub-scout-adventures/ill-do-it-myself/'),
    ('lion', 'Let''s Camp', 'den', 'Practice the buddy system and pack the Six Essentials; ask your den leader about the next pack or council overnight.', 'https://www.scouting.org/cub-scout-adventures/lets-camp-lion/'),
    ('lion', 'On a Roll', 'home', 'Check helmet fit, go over bike safety rules, then ride together around the neighborhood.', 'https://www.scouting.org/cub-scout-adventures/on-a-roll/'),
    ('lion', 'On Your Mark', 'some', 'Tape out an obstacle course at home to practice; the den game and Lion box derby race happen with the den.', 'https://www.scouting.org/cub-scout-adventures/on-your-mark/'),
    ('lion', 'Pick My Path', 'home', 'Talk about choices and consequences (try the toothpaste demo), then have your Lion do a Good Turn like a chore.', 'https://www.scouting.org/cub-scout-adventures/pick-my-path-lion/'),
    ('lion', 'Race Time', 'some', 'Read the Pinewood Derby or Raingutter Regatta rules together and talk about being a good sport, win or lose.', 'https://www.scouting.org/cub-scout-adventures/race-time-lion/'),
    ('lion', 'Ready, Set, Grow', 'home', 'Plant a few seeds in a decorated pot and sort foods by where they grow: tree, vine, ground, or farm.', 'https://www.scouting.org/cub-scout-adventures/ready-set-grow/'),
    ('lion', 'Time to Swim', 'den', 'Talk through pool safety rules at home; ask your den leader when the den swim with a trained lifeguard is.', 'https://www.scouting.org/cub-scout-adventures/time-to-swim/'),
    ('lion', 'Archery', 'den', 'Ask your den leader when the next council day camp or range day offers archery for Lions; only trained range staff can run it.', 'https://www.scouting.org/wp-content/uploads/2024/05/2024_Cub-Scout_Archery-Adventure-Lesson-Plan_051624.pdf'),
    ('lion', 'Slingshot', 'den', 'Ask your den leader when a council camp or range day offers slingshot; it must be run by a trained rangemaster.', 'https://www.scouting.org/wp-content/uploads/2024/05/2024_Cub-Scout_Slingshot-Adventure-Lesson-Plan_051624.pdf'),
    ('tiger', 'Bobcat', 'home', 'Practice the Scout Oath and the Cub Scout sign, salute and handshake, and do the Parent''s Guide activities together.', 'https://www.scouting.org/cub-scout-adventures/bobcat-tiger/'),
    ('tiger', 'Tigers in the Wild', 'home', 'Take a 20-minute outdoor walk with the Six Essentials, sort natural vs. man-made, and find a tree to talk about.', 'https://www.scouting.org/cub-scout-adventures/tigers-in-the-wild/'),
    ('tiger', 'Tiger Bites', 'home', 'Name the five food groups at dinner, play actively for 30 minutes, and set a steady bedtime routine.', 'https://www.scouting.org/cub-scout-adventures/tiger-bites/'),
    ('tiger', 'Team Tiger', 'some', 'Play Go Fish or cornhole as a family and talk about why games need rules; the team job and service are with the den.', 'https://www.scouting.org/cub-scout-adventures/team-tiger/'),
    ('tiger', 'Tiger''s Roar', 'home', 'Watch the Tiger Protect Yourself Rules video, practice Shout, Run, Tell, and plan what to do if you get separated.', 'https://www.scouting.org/cub-scout-adventures/tigers-roar/'),
    ('tiger', 'Tiger Circles', 'home', 'Talk about three family faith holidays, have your Tiger draw one, and make a kindness card for someone.', 'https://www.scouting.org/cub-scout-adventures/tiger-circles/'),
    ('tiger', 'Champions for Nature', 'home', 'Sort items into renewable and non-renewable resources, then set up reduce/reuse/recycle bins at home.', 'https://www.scouting.org/cub-scout-adventures/champions-for-nature-tiger/'),
    ('tiger', 'Curiosity, Intrigue, and Magical Mysteries', 'home', 'Learn a simple magic trick to show the family, then write your name and a short message in a secret code.', 'https://www.scouting.org/cub-scout-adventures/curiosity-intrigue-and-magical-mysteries/'),
    ('tiger', 'Designed by Tiger', 'home', 'Have your Tiger draw something to build, build it from recycled materials, improve it, then draw the final version.', 'https://www.scouting.org/cub-scout-adventures/designed-by-tiger/'),
    ('tiger', 'Fish On', 'some', 'Use a local map to pick a fishing spot, go over fishing safety, and draw the kind of fish that lives there.', 'https://www.scouting.org/cub-scout-adventures/fish-on/'),
    ('tiger', 'Floats and Boats', 'home', 'Test household items in the sink to see what floats, then build a little boat from recycled materials.', 'https://www.scouting.org/cub-scout-adventures/floats-and-boats/'),
    ('tiger', 'Good Knights', 'home', 'Talk about how knights showed courtesy, build a small castle from recycled boxes, and do a good deed.', 'https://www.scouting.org/cub-scout-adventures/good-knights/'),
    ('tiger', 'Let''s Camp', 'den', 'Practice the buddy system and pack the Six Essentials; ask your den leader about the next pack or council overnight.', 'https://www.scouting.org/cub-scout-adventures/lets-camp-tiger/'),
    ('tiger', 'Race Time', 'some', 'Read the Pinewood Derby or Raingutter Regatta rules together and role-play being a good sport before race day.', 'https://www.scouting.org/cub-scout-adventures/race-time-tiger/'),
    ('tiger', 'Rolling Tigers', 'home', 'Check your bike''s ABCs (air, brakes, chain), practice hand signals, and ride together.', 'https://www.scouting.org/cub-scout-adventures/rolling-tigers/'),
    ('tiger', 'Safe and Smart', 'home', 'Have your Tiger learn your address and a parent''s phone number, then practice your home fire escape plan.', 'https://www.scouting.org/cub-scout-adventures/safe-and-smart/'),
    ('tiger', 'Sky Is the Limit', 'home', 'On a clear night, go outside together to find two constellations, then draw one of them.', 'https://www.scouting.org/cub-scout-adventures/sky-is-the-limit/'),
    ('tiger', 'Stories in Shapes', 'home', 'Take a neighborhood art walk or virtual museum tour, then make shape art like origami or tangrams.', 'https://www.scouting.org/cub-scout-adventures/stories-in-shapes/'),
    ('tiger', 'Summertime Fun', 'den', 'Between May and August, sign up for three den, pack, or council summer activities.', 'https://www.scouting.org/cub-scout-adventures/summertime-fun-tiger/'),
    ('tiger', 'Tech All Around', 'home', 'Hunt for technology around the house, then write a family policy for using digital devices together.', 'https://www.scouting.org/cub-scout-adventures/tech-all-around/'),
    ('tiger', 'Tiger Tag', 'some', 'Watch a game together (TV counts) and talk about what it means to be a good sport; tag and relays are with the den.', 'https://www.scouting.org/cub-scout-adventures/tiger-tag/'),
    ('tiger', 'Tiger-iffic!', 'home', 'Play a board game as a family, then invent a new game or change the rules of one you know and play it.', 'https://www.scouting.org/cub-scout-adventures/tiger-iffic/'),
    ('tiger', 'Tigers in the Water', 'den', 'Talk through swim safety rules at home; ask your den leader when the supervised den swim is.', 'https://www.scouting.org/cub-scout-adventures/tigers-in-the-water/'),
    ('tiger', 'Archery', 'den', 'Ask your den leader when the next council day camp or range day offers archery for Tigers; only trained range staff can run it.', 'https://www.scouting.org/wp-content/uploads/2024/05/2024_Cub-Scout_Archery-Adventure-Lesson-Plan_051624.pdf'),
    ('tiger', 'BB Gun', 'den', 'Talk at home about what to do if you ever find a gun (don''t touch it, leave, tell an adult), then ask about council range days.', 'https://www.scouting.org/wp-content/uploads/2024/05/2024_Cub-Scout_BB-Adventure-Lesson-Plan_051724.pdf'),
    ('tiger', 'Slingshot', 'den', 'Ask your den leader when a council camp or range day offers slingshot; it must be run by a trained rangemaster.', 'https://www.scouting.org/wp-content/uploads/2024/05/2024_Cub-Scout_Slingshot-Adventure-Lesson-Plan_051624.pdf'),
    ('wolf', 'Bobcat', 'home', 'Practice the Scout Oath and Law and the Cub Scout sign, salute and handshake; do the Parent''s Guide activities.', 'https://www.scouting.org/cub-scout-adventures/bobcat-wolf/'),
    ('wolf', 'Paws on the Path', 'home', 'Take a 30-minute family walk with the Six Essentials and a buddy, spot four animals, and review Leave No Trace.', 'https://www.scouting.org/cub-scout-adventures/paws-on-the-path/'),
    ('wolf', 'Running with the Pack', 'home', 'Try three naturally colored foods, practice brushing teeth, exercise 10 minutes, and review the health form together.', 'https://www.scouting.org/cub-scout-adventures/running-with-the-pack/'),
    ('wolf', 'Council Fire', 'some', 'Practice folding a U.S. flag and build a model of your home from boxes or LEGO; the neighborhood and service are den work.', 'https://www.scouting.org/cub-scout-adventures/council-fire/'),
    ('wolf', 'Safety in Numbers', 'home', 'Watch the Wolf Protect Yourself Rules video together, then go over playground safety at a nearby park.', 'https://www.scouting.org/cub-scout-adventures/safety-in-numbers/'),
    ('wolf', 'Footsteps', 'home', 'Read the boy who cried wolf and talk about honesty, then make a craft for a family faith holiday.', 'https://www.scouting.org/cub-scout-adventures/footsteps/'),
    ('wolf', 'A Wolf Goes Fishing', 'some', 'Practice casting in the yard (no hook) and look up which fish live in a nearby lake; the fishing trip comes later.', 'https://www.scouting.org/cub-scout-adventures/a-wolf-goes-fishing/'),
    ('wolf', 'Adventures in Coins', 'home', 'Dig out spare change, find the mint marks and years, and make a coin rubbing with notes about it.', 'https://www.scouting.org/cub-scout-adventures/adventures-in-coins/'),
    ('wolf', 'Air of the Wolf', 'home', 'Fold two paper airplane designs, fly each five times, and record the distances to compare.', 'https://www.scouting.org/cub-scout-adventures/air-of-the-wolf/'),
    ('wolf', 'Champions for Nature', 'some', 'Start a compost jar or sort household items into reduce, reuse and recycle; the facility visit is a den outing.', 'https://www.scouting.org/cub-scout-adventures/champions-for-nature-wolf/'),
    ('wolf', 'Code of the Wolf', 'home', 'Make up a secret code and trade messages, then open a bag of colored candy to find the most common color.', 'https://www.scouting.org/cub-scout-adventures/code-of-the-wolf/'),
    ('wolf', 'Computing Wolves', 'home', 'Name the parts of a computer, make a short digital story in slides, and write a family device contract.', 'https://www.scouting.org/cub-scout-adventures/computing-wolves/'),
    ('wolf', 'Cubs Who Care', 'home', 'Try drawing with your eyes covered or learn a few signs in American Sign Language, then talk about how it felt.', 'https://www.scouting.org/cub-scout-adventures/cubs-who-care/'),
    ('wolf', 'Digging in the Past', 'home', 'Invent a dinosaur (name, diet, size, habitat) and play a dinosaur game; the dig and fossil layer can be den or home.', 'https://www.scouting.org/cub-scout-adventures/digging-in-the-past/'),
    ('wolf', 'Finding Your Way', 'home', 'Find your house on a map, draw a map with a key to school or a friend''s, and find north with a compass.', 'https://www.scouting.org/cub-scout-adventures/finding-your-way/'),
    ('wolf', 'Germs Alive!', 'home', 'Wash hands while singing Happy Birthday twice, then grow mold on bread in a sealed bag to show the den.', 'https://www.scouting.org/cub-scout-adventures/germs-alive/'),
    ('wolf', 'Let''s Camp', 'den', 'Practice a square knot and make a personal packing list; ask your den leader about the next overnight.', 'https://www.scouting.org/cub-scout-adventures/lets-camp-wolf/'),
    ('wolf', 'Paws for Water', 'den', 'Talk through swim safety rules at home; ask your den leader when the supervised den swim is.', 'https://www.scouting.org/cub-scout-adventures/paws-for-water/'),
    ('wolf', 'Paws of Skill', 'home', 'Watch a team sport together and point out teamwork, then learn the rules and play kickball for 30 minutes.', 'https://www.scouting.org/cub-scout-adventures/paws-of-skill/'),
    ('wolf', 'Pedal With the Pack', 'home', 'Practice putting on a helmet, starting and stopping, and hand signals, then take a family bike ride.', 'https://www.scouting.org/cub-scout-adventures/pedal-with-the-pack/'),
    ('wolf', 'Race Time', 'some', 'Start your Pinewood car or regatta boat with an adult and list three ways to make it go faster.', 'https://www.scouting.org/cub-scout-adventures/race-time-wolf/'),
    ('wolf', 'Spirit of the Water', 'home', 'Find out where your tap water comes from and build a simple water filter from sand and gravel.', 'https://www.scouting.org/cub-scout-adventures/spirit-of-the-water/'),
    ('wolf', 'Summertime Fun', 'den', 'Between May and August, sign up for three den, pack, or council summer activities.', 'https://www.scouting.org/cub-scout-adventures/summertime-fun-wolf/'),
    ('wolf', 'Archery', 'den', 'Ask your den leader when the next council day camp or range day offers archery for Wolves; only trained range staff can run it.', 'https://www.scouting.org/wp-content/uploads/2024/05/2024_Cub-Scout_Archery-Adventure-Lesson-Plan_051624.pdf'),
    ('wolf', 'BB Gun', 'den', 'Talk at home about what to do if you ever find a gun (don''t touch it, leave, tell an adult), then ask about council range days.', 'https://www.scouting.org/wp-content/uploads/2024/05/2024_Cub-Scout_BB-Adventure-Lesson-Plan_051724.pdf'),
    ('wolf', 'Slingshot', 'den', 'Ask your den leader when a council camp or range day offers slingshot; it must be run by a trained rangemaster.', 'https://www.scouting.org/wp-content/uploads/2024/05/2024_Cub-Scout_Slingshot-Adventure-Lesson-Plan_051624.pdf'),
    ('bear', 'Bobcat', 'some', 'Practice the Scout Oath and Law and the three points of the Oath; do the Parent''s Guide activities together.', 'https://www.scouting.org/cub-scout-adventures/bobcat-bear/'),
    ('bear', 'Bear Habitat', 'home', 'Plan a 1-mile family walk: pack the Six Essentials, map the route, check fire danger, and look for animal signs.', 'https://www.scouting.org/cub-scout-adventures/bear-habitat/'),
    ('bear', 'Bear Strong', 'home', 'Try foods from three food groups, do 15 minutes of exercise, and review the annual health form together.', 'https://www.scouting.org/cub-scout-adventures/bear-strong/'),
    ('bear', 'Paws for Action', 'home', 'Practice folding the U.S. flag and research a local nonprofit: its mission, funding, and volunteer jobs.', 'https://www.scouting.org/cub-scout-adventures/paws-for-action/'),
    ('bear', 'Standing Tall', 'home', 'Watch the Bear Protect Yourself Rules video and set up a family digital device policy together.', 'https://www.scouting.org/cub-scout-adventures/standing-tall/'),
    ('bear', 'Fellowship', 'home', 'Talk about three family faith holidays and make a related craft or food, then do an act of kindness.', 'https://www.scouting.org/cub-scout-adventures/fellowship/'),
    ('bear', 'A Bear Goes Fishing', 'some', 'Look up your state''s fishing rules together and learn about three local fish; the fishing outing comes later.', 'https://www.scouting.org/cub-scout-adventures/a-bear-goes-fishing/'),
    ('bear', 'Balancing Bears', 'home', 'Make trail mix using measuring math, then hunt for symmetry in leaves and flowers outside.', 'https://www.scouting.org/cub-scout-adventures/balancing-bears/'),
    ('bear', 'Baloo the Builder', 'home', 'Go over basic tools and tool safety together, then pick a simple woodworking project like a tic-tac-toe board.', 'https://www.scouting.org/cub-scout-adventures/baloo-the-builder/'),
    ('bear', 'Bears Afloat', 'den', 'Practice putting on and fitting a life jacket; ask your den leader about the swim test and supervised paddling day.', 'https://www.scouting.org/cub-scout-adventures/bears-afloat/'),
    ('bear', 'Bears on Bikes', 'home', 'Fit the helmet, adjust seat height, check brakes and tire pressure, then take a 30-minute family ride.', 'https://www.scouting.org/cub-scout-adventures/bears-on-bikes/'),
    ('bear', 'Champions for Nature', 'home', 'Find out where your home''s wastewater goes and look closely at a scoop of yard soil together.', 'https://www.scouting.org/cub-scout-adventures/champions-for-nature-bear/'),
    ('bear', 'Chef Tech', 'home', 'Pick an air fryer or microwave, read its safety section together, and cook a recipe you find online.', 'https://www.scouting.org/cub-scout-adventures/chef-tech/'),
    ('bear', 'Critter Care', 'home', 'Compare two pets allowed where you live, research how to care for one, and talk about how pets help people.', 'https://www.scouting.org/cub-scout-adventures/critter-care/'),
    ('bear', 'Forensics', 'home', 'Look for fingerprints on a glass and test salt, sugar, baking soda and cornstarch to tell them apart.', 'https://www.scouting.org/cub-scout-adventures/forensics/'),
    ('bear', 'Let''s Camp', 'den', 'Practice the buddy system and pack the Six Essentials plus personal gear; ask about the next pack campout.', 'https://www.scouting.org/cub-scout-adventures/lets-camp-bear/'),
    ('bear', 'Marble Madness', 'home', 'Make a marble bag, learn three marble games like Ringer, and build a two-lane marble track from recyclables.', 'https://www.scouting.org/cub-scout-adventures/marble-madness/'),
    ('bear', 'Race Time', 'some', 'Start your Pinewood car or regatta boat with an adult and talk about what could make it faster.', 'https://www.scouting.org/cub-scout-adventures/race-time-bear/'),
    ('bear', 'Roaring Laughter', 'home', 'Hold a family joke contest, try some tongue twisters, and play a round of charades.', 'https://www.scouting.org/cub-scout-adventures/roaring-laughter/'),
    ('bear', 'Salmon Run', 'den', 'Talk about swim ability groups and the buddy system; ask your den leader about the supervised den swim.', 'https://www.scouting.org/cub-scout-adventures/salmon-run/'),
    ('bear', 'Summertime Fun', 'den', 'Between May and August, sign up for three den, pack, or council summer activities.', 'https://www.scouting.org/cub-scout-adventures/summertime-fun-bear/'),
    ('bear', 'Super Science', 'home', 'Try a balloon static-electricity experiment and a sink-or-float test with household items.', 'https://www.scouting.org/cub-scout-adventures/super-science/'),
    ('bear', 'Whittling', 'some', 'Read the Cub Scout Knife Safety Rules together and practice the safety circle; carve only with adult supervision.', 'https://www.scouting.org/cub-scout-adventures/whittling/'),
    ('bear', 'Archery', 'den', 'Ask your den leader when the next council day camp or range day offers archery for Bears; only trained range staff can run it.', 'https://www.scouting.org/wp-content/uploads/2024/05/2024_Cub-Scout_Archery-Adventure-Lesson-Plan_051624.pdf'),
    ('bear', 'BB Gun', 'den', 'Talk at home about what to do if you ever find a gun (don''t touch it, leave, tell an adult), then ask about council range days.', 'https://www.scouting.org/wp-content/uploads/2024/05/2024_Cub-Scout_BB-Adventure-Lesson-Plan_051724.pdf'),
    ('bear', 'Slingshot', 'den', 'Ask your den leader when a council camp or range day offers slingshot; it must be run by a trained rangemaster.', 'https://www.scouting.org/wp-content/uploads/2024/05/2024_Cub-Scout_Slingshot-Adventure-Lesson-Plan_051624.pdf'),
    ('webelos', 'Bobcat', 'some', 'Practice the Scout Oath and Law and the Cub Scout sign, salute and handshake; do the Parent''s Guide activities.', 'https://www.scouting.org/cub-scout-adventures/bobcat-webelos/'),
    ('webelos', 'Webelos Walkabout', 'home', 'Plan a 2-mile family walk: map the route, check the weather, and practice blister and sunburn first aid.', 'https://www.scouting.org/cub-scout-adventures/webelos-walkabout/'),
    ('webelos', 'Stronger, Faster, Higher', 'home', 'Plan and cook a balanced family dinner together, then do 15 minutes of exercise.', 'https://www.scouting.org/cub-scout-adventures/stronger-faster-higher/'),
    ('webelos', 'My Community', 'some', 'Hold a family vote on dinner to compare majority and plurality, and pick a federal law to research.', 'https://www.scouting.org/cub-scout-adventures/my-community/'),
    ('webelos', 'My Safety', 'home', 'Hunt for hazardous household products and read their labels, then fill out the natural events worksheet.', 'https://www.scouting.org/cub-scout-adventures/my-safety/'),
    ('webelos', 'My Family', 'home', 'Talk about family faith traditions, learn about a different faith, and find two things in common.', 'https://www.scouting.org/cub-scout-adventures/my-family/'),
    ('webelos', 'Aquanaut', 'den', 'Talk about swim safety and hypothermia at home; ask your den leader about the swim test and supervised swim.', 'https://www.scouting.org/cub-scout-adventures/aquanaut/'),
    ('webelos', 'Art Explosion', 'home', 'Sketch something from nature in pencil, then try different photo filters on a picture.', 'https://www.scouting.org/cub-scout-adventures/art-explosion/'),
    ('webelos', 'Aware and Care', 'home', 'Try a blindfolded obstacle course with a guide or Simon Says with headphones on, then talk about it.', 'https://www.scouting.org/cub-scout-adventures/aware-and-care/'),
    ('webelos', 'Build It', 'home', 'Learn to check level, plumb and square with a level, then plan a small project like a shelf.', 'https://www.scouting.org/cub-scout-adventures/build-it/'),
    ('webelos', 'Catch the Big One', 'some', 'Plan a fishing trip together: pick the spot and target fish, list gear, and practice a fishing knot.', 'https://www.scouting.org/cub-scout-adventures/catch-the-big-one/'),
    ('webelos', 'Champions for Nature', 'home', 'Pick a threatened or endangered animal and research why it''s at risk and what''s being done to help.', 'https://www.scouting.org/cub-scout-adventures/champions-for-nature-webelos/'),
    ('webelos', 'Chef''s Knife', 'home', 'Review the Cub Scout Knife Safety Rules, then with a parent slice and dice fruit for a fruit salad.', 'https://www.scouting.org/cub-scout-adventures/chefs-knife/'),
    ('webelos', 'Earth Rocks!', 'home', 'Grow a crystal and sort rocks from the yard into sedimentary, igneous or metamorphic.', 'https://www.scouting.org/cub-scout-adventures/earth-rocks/'),
    ('webelos', 'Let''s Camp', 'den', 'Practice tying a bowline and setting up your tent in the yard; ask your den leader about the next campout.', 'https://www.scouting.org/cub-scout-adventures/lets-camp-webelos/'),
    ('webelos', 'Math on the Trail', 'home', 'Time a quarter-mile walk, predict your 2-mile time, then walk 2 miles to check the guess.', 'https://www.scouting.org/cub-scout-adventures/math-on-the-trail/'),
    ('webelos', 'Modular Design', 'home', 'Build a LEGO model without instructions, write step-by-step instructions, and have someone else rebuild it.', 'https://www.scouting.org/cub-scout-adventures/modular-design/'),
    ('webelos', 'Paddle Onward', 'den', 'Practice fitting a life jacket and review Safety Afloat; ask your den leader about the swim test and paddle day.', 'https://www.scouting.org/cub-scout-adventures/paddle-onward/'),
    ('webelos', 'Pedal Away', 'home', 'Practice oiling the bike chain and using a lock, then map out a 5-mile family ride.', 'https://www.scouting.org/cub-scout-adventures/pedal-away/'),
    ('webelos', 'Race Time', 'some', 'Start your Pinewood car or regatta boat with an adult and read the race rules together.', 'https://www.scouting.org/cub-scout-adventures/race-time-webelos/'),
    ('webelos', 'Summertime Fun', 'den', 'Between May and August, sign up for three den, pack, or council summer activities.', 'https://www.scouting.org/cub-scout-adventures/summertime-fun-webelos/'),
    ('webelos', 'Tech on the Trail', 'home', 'Check a weather app before an outing, plan a 2-mile trek with an online map, then go walk it.', 'https://www.scouting.org/cub-scout-adventures/tech-on-the-trail/'),
    ('webelos', 'Yo-Yo', 'home', 'Find the right string length, practice the slip knot and winding, and try a sleeper trick.', 'https://www.scouting.org/cub-scout-adventures/yo-yo/'),
    ('webelos', 'Archery', 'den', 'Ask your den leader when the next council day camp or range day offers archery for Webelos; only trained range staff can run it.', 'https://www.scouting.org/wp-content/uploads/2024/05/2024_Cub-Scout_Archery-Adventure-Lesson-Plan_051624.pdf'),
    ('webelos', 'BB Gun', 'den', 'Talk at home about what to do if you ever find a gun (don''t touch it, leave, tell an adult), then ask about council range days.', 'https://www.scouting.org/wp-content/uploads/2024/05/2024_Cub-Scout_BB-Adventure-Lesson-Plan_051724.pdf'),
    ('webelos', 'Slingshot', 'den', 'Ask your den leader when a council camp or range day offers slingshot; it must be run by a trained rangemaster.', 'https://www.scouting.org/wp-content/uploads/2024/05/2024_Cub-Scout_Slingshot-Adventure-Lesson-Plan_051624.pdf'),
    ('aol', 'Bobcat', 'some', 'Practice the Scout sign, salute and handshake and learn the Scout motto and slogan; do the Parent''s Guide activities.', 'https://www.scouting.org/cub-scout-adventures/bobcat-aol/'),
    ('aol', 'Outdoor Adventurer', 'den', 'Gather the Scout Basic Essentials and review the SAFE Checklist; ask your den leader about the troop campout date.', 'https://www.scouting.org/cub-scout-adventures/outdoor-adventurer/'),
    ('aol', 'Personal Fitness', 'home', 'Track your 30-minute active days for two weeks and cook a balanced camp-style meal together.', 'https://www.scouting.org/cub-scout-adventures/personal-fitness/'),
    ('aol', 'Citizenship', 'some', 'Brainstorm a service project and walk through the SAFE Checklist to plan it; the 2 hours of service follow.', 'https://www.scouting.org/cub-scout-adventures/citizenship/'),
    ('aol', 'First Aid', 'some', 'Build a personal first-aid kit together and practice caring for cuts, burns and nosebleeds.', 'https://www.scouting.org/cub-scout-adventures/first-aid/'),
    ('aol', 'Duty to God', 'home', 'Talk about your faith traditions, a Scout Law point they reflect, and what Duty to God means day to day.', 'https://www.scouting.org/cub-scout-adventures/duty-to-god/'),
    ('aol', 'Champions for Nature', 'home', 'At the grocery store, find foods grown in your state, then brainstorm ways to cut food waste at home.', 'https://www.scouting.org/cub-scout-adventures/champions-for-nature-aol/'),
    ('aol', 'Cycling', 'home', 'Practice fixing a flat and oiling the chain, then map a 10-mile family ride.', 'https://www.scouting.org/cub-scout-adventures/cycling/'),
    ('aol', 'Engineer', 'home', 'Learn what civil, electrical and mechanical engineers do, pick one, and plan a small build project.', 'https://www.scouting.org/cub-scout-adventures/engineer/'),
    ('aol', 'Estimations', 'home', 'Estimate the time of day using your hand and the sun, and a tree''s height with the stick method.', 'https://www.scouting.org/cub-scout-adventures/estimations/'),
    ('aol', 'Fishing', 'some', 'Plan a fishing trip together: pick the spot and target fish, list gear, and practice a fishing knot.', 'https://www.scouting.org/cub-scout-adventures/fishing-aol/'),
    ('aol', 'High Tech Outdoors', 'home', 'Check a weather app for an upcoming outing and learn one knot using a knot-tying app.', 'https://www.scouting.org/cub-scout-adventures/high-tech-outdoors/'),
    ('aol', 'Into the Wild', 'home', 'Visit a zoo or nature center, choose an animal to watch, then make a model of its habitat at home.', 'https://www.scouting.org/cub-scout-adventures/into-the-wild/'),
    ('aol', 'Into the Woods', 'home', 'Do a tree inventory at a nearby park, pick one tree, and figure out if it''s deciduous and native.', 'https://www.scouting.org/cub-scout-adventures/into-the-woods/'),
    ('aol', 'Knife Safety', 'some', 'Review the knife safety rules (stop, away, sharp, store) and help cut vegetables for dinner with a parent.', 'https://www.scouting.org/cub-scout-adventures/knife-safety/'),
    ('aol', 'Paddle Craft', 'den', 'Practice fitting a life jacket and review Safety Afloat; ask your den leader about the swim test and paddle day.', 'https://www.scouting.org/cub-scout-adventures/paddle-craft/'),
    ('aol', 'Race Time', 'some', 'Build your car or boat with adult supervision, learn the race rules, and offer to help a younger den.', 'https://www.scouting.org/cub-scout-adventures/race-time-aol/'),
    ('aol', 'Summertime Fun', 'den', 'Between May and August, sign up for three patrol, pack, or council summer activities.', 'https://www.scouting.org/cub-scout-adventures/summertime-fun-aol/'),
    ('aol', 'Swimming', 'den', 'Talk about the order of rescue (reach, throw) at home; ask your den leader about the supervised swim.', 'https://www.scouting.org/cub-scout-adventures/swimming/'),
    ('aol', 'Archery', 'den', 'Ask your den leader when the next council day camp or range day offers archery for Arrow of Light scouts; only trained range staff can run it.', 'https://www.scouting.org/wp-content/uploads/2024/05/2024_Cub-Scout_Archery-Adventure-Lesson-Plan_051624.pdf'),
    ('aol', 'BB Gun', 'den', 'Talk at home about what to do if you ever find a gun (don''t touch it, leave, tell an adult), then ask about council range days.', 'https://www.scouting.org/wp-content/uploads/2024/05/2024_Cub-Scout_BB-Adventure-Lesson-Plan_051724.pdf'),
    ('aol', 'Slingshot', 'den', 'Ask your den leader when a council camp or range day offers slingshot; it must be run by a trained rangemaster.', 'https://www.scouting.org/wp-content/uploads/2024/05/2024_Cub-Scout_Slingshot-Adventure-Lesson-Plan_051624.pdf')

  ) as v(rank, name, home, idea, url)
 where a.rank = v.rank::public.den_rank and a.name = v.name;
