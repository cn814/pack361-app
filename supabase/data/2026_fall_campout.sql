-- Fall Campout 2026 details, from the family campout web page.
-- Run in the Supabase SQL Editor after migration 20260929000400. Safe to re-run.
begin;

update public.events set
    title         = 'Fall Campout at Broad Creek',
    starts_at     = '2026-10-23 17:30-04',
    ends_at       = '2026-10-25 10:00-04',
    location_name = 'Camp Saffran, Broad Creek Memorial Scout Reservation',
    address       = '1929 Susquehanna Hall Road, Whiteford, MD',
    signup_url    = 'https://givebutter.com/pack361-campout',
    external_id   = '745658',
    details       = 'Two nights at Camp Saffran with campfires, trails and scout skills. Every family is welcome, and first-time campers especially. If you''re missing gear, the pack can lend tents, pads and more.',
    links         = '[{"label": "Sign up and pay (Givebutter)", "url": "https://givebutter.com/pack361-campout", "note": "By Fri, Oct 16. One form per family covers campers, the fee and gear to borrow."}, {"label": "Volunteer jobs (SignUpGenius)", "url": "https://www.signupgenius.com/go/30E0D4FA9A72FA0F85-66107996-pack", "note": "Every meal and activity needs two adults. Please grab at least one slot."}, {"label": "Join the pack Signal group", "url": "https://signal.group/#REDACTED", "note": "Most campout updates come through Signal: where to meet, weather calls."}, {"label": "Medical form, Parts A and B (PDF)", "url": "https://filestore.scouting.org/filestore/HealthSafety/pdf/680-001_AB.pdf", "note": "Needed for every camper, adults included."}, {"label": "Pack shirts and hoodies", "url": "https://givebutter.com/pack361-attire", "note": "Order by Oct 6 to have them before the campout."}, {"label": "Trail map (OpenStreetMap)", "url": "https://www.openstreetmap.org/#map=16/39.69085/-76.26029", "note": "Look for the BCMSR Yellow Trail along Broad Creek below the dam."}]'::jsonb,
    sections      = '[{"title": "The basics", "tone": null, "items": ["Camping fee: $35 per person ages 4 and up, including adults; $15 for ages 3 and under.", "Arrive Friday from 5:30 PM. Pack check-in is at the Rosenberg Welcome Center; watch Signal for where to meet.", "Our sites: Hawkeye Adirondack and Pioneer Cabin. Restrooms are a couple of minutes'' walk. Hawkeye has a covered pavilion.", "Everyone sleeps in tents. The cabin is the camp kitchen and rainy-day space; nobody sleeps inside it.", "Leave Sunday with camp packed up and cleared by 10:00 AM."]}, {"title": "Closed-toe shoes, always", "tone": "warn", "body": "Everyone needs sturdy closed-toe shoes with no holes. Crocs, Keens and sandals aren''t allowed at camp. Late October can be mild or cold and may rain: pack layers and skip cotton."}, {"title": "Pack 361 campout rules", "tone": "warn", "body": "Everyone who signs up agrees to follow these, adults and scouts alike.", "items": ["Adults tent only with their own children. Only one family to a tent.", "Any adult who isn''t the guardian of a registered scout must be registered with the pack and tent separately.", "No adult is ever alone with a scout who isn''t their own child (no one-on-one contact).", "No drugs or alcohol at camp, including arriving under the influence.", "Everyone needs a completed medical form (Parts A and B) on file.", "Scouting America rules also apply: two-deep leadership, a BALOO-trained leader, the buddy system, and no driving alone with a scout who isn''t your own child."]}, {"title": "Saturday afternoon: fishing or games", "tone": null, "body": "After rest time, scouts pick. Each spot needs at least two adults, so please sign up to help.", "items": ["Fishing (optional) at the Lake Straus dam with a parent. Bring a rod or borrow one from camp. No license needed.", "Basketball and gaga ball in camp: bring a ball if you have one.", "Yard games (cornhole, ladder toss, frisbees, soccer ball) are welcome. Label them with your name."]}, {"title": "Hemlock Gorge hike (Sat 8:30 AM)", "tone": "info", "body": "About 2 miles on the Yellow Trail along Broad Creek, with a shorter turnaround for younger scouts. Back before lunch.", "items": ["Before you leave home, put Merlin Bird ID (download the Northeast bird pack) and Seek by iNaturalist on a parent''s phone. Signal in the gorge is spotty.", "Trail challenges: count bird species with Merlin, count plants, mushrooms and bugs with Seek, and share your best photo in Signal. Winners announced at the campfire.", "Scavenger hunt: red, orange and yellow leaves, an acorn, a pinecone, a hemlock branch, moss, a mushroom, an animal track, a woodpecker hole, a trail marker, and something made by people. Snap photos instead of taking things home.", "Leave No Trace: stay on the trail, pack out every wrapper, give wildlife space."]}, {"title": "Need to borrow gear?", "tone": "info", "body": "Missing gear is never a reason to skip the campout. Check what you need when you sign up (tent, sleeping pad, sleeping bag, mess kit, camp chair, headlamp). Already signed up? Post in Signal or email Chris Nealen at cnealen@gmail.com. Have extra to lend? Let us know the same way."}]'::jsonb
where category = 'Campout' and signup_url like '%pack361-campout%';

-- Picnic: point at the right Givebutter campaign
update public.events set external_id = '732079', signup_url = 'https://givebutter.com/pack361-picnic'
where signup_url like '%pack361-picnic%';

delete from public.itinerary_items where event_id = (select id from public.events where external_id = '745658' and category = 'Campout');
insert into public.itinerary_items (event_id, starts_at, title, location, notes)
select e.id, v.starts_at::timestamptz, v.title, v.location, v.notes
  from public.events e, (values
    ('2026-10-23 17:30-04', 'Arrive, check in, and set up camp', 'Rosenberg Welcome Center', 'Pitch your tent first while it''s light.'),
    ('2026-10-23 18:14-04', 'Sunset', null, 'Keep a headlamp handy.'),
    ('2026-10-23 19:00-04', 'Campfire with hot dogs and s''mores for dinner', null, null),
    ('2026-10-24 07:00-04', 'Breakfast', null, null),
    ('2026-10-24 08:00-04', 'Flag ceremony and plan for the day', null, null),
    ('2026-10-24 08:30-04', 'Hemlock Gorge hike', 'Yellow Trail', 'About 2 miles, shorter turnaround for younger scouts. Bring the Six Essentials, a trail snack and water.'),
    ('2026-10-24 11:30-04', 'Lunch in camp', null, null),
    ('2026-10-24 12:15-04', 'Rest time in camp', null, null),
    ('2026-10-24 13:15-04', 'Afternoon choice: fishing at the dam, or basketball and gaga ball', null, 'Fishing is optional.'),
    ('2026-10-24 16:00-04', 'Pumpkin painting', null, null),
    ('2026-10-24 16:30-04', 'Dinner', null, null),
    ('2026-10-24 18:13-04', 'Sunset', null, null),
    ('2026-10-24 19:00-04', 'Campfire program with den skits and songs', null, null),
    ('2026-10-25 07:25-04', 'Breakfast, pack up, and leave the site better than we found it', null, null),
    ('2026-10-25 10:00-04', 'Out of camp', null, null)
  ) as v(starts_at, title, location, notes)
 where e.external_id = '745658' and e.category = 'Campout';

delete from public.packing_items where event_id = (select id from public.events where external_id = '745658' and category = 'Campout');
insert into public.packing_items (event_id, category, label, required, sort_order)
select e.id, v.category, v.label, false, v.sort_order
  from public.events e, (values
    ('Every scout carries', 'Filled water bottle', 1),
    ('Every scout carries', 'Flashlight or headlamp', 2),
    ('Every scout carries', 'Small first aid kit', 3),
    ('Every scout carries', 'Trail snack', 4),
    ('Every scout carries', 'Sun protection', 5),
    ('Every scout carries', 'Whistle', 6),
    ('Every scout carries', 'Day pack to carry it all on the hike', 7),
    ('Sleeping', 'Tent with rainfly, footprint, and stakes', 8),
    ('Sleeping', 'Sleeping bag rated well below the night''s low', 9),
    ('Sleeping', 'Sleeping pad', 10),
    ('Sleeping', 'Pillow and an extra blanket', 11),
    ('Clothes', 'Sturdy closed-toe shoes (no Crocs, Keens or sandals)', 12),
    ('Clothes', 'Layers and a warm jacket (skip cotton)', 13),
    ('Clothes', 'Warm hat and extra socks', 14),
    ('Clothes', 'Rain jacket', 15),
    ('Clothes', 'Sleepwear you can walk to the bathroom in', 16),
    ('Clothes', 'Pack 361 or scout shirt, if you have one', 17),
    ('Camp life', 'Mess kit: plate or bowl, utensils, cup', 18),
    ('Camp life', 'Insulated mug for hot drinks', 19),
    ('Camp life', 'Folding camp chair', 20),
    ('Camp life', 'Toiletries', 21),
    ('Camp life', 'Bug spray', 22),
    ('Camp life', 'Portable phone charger', 23),
    ('Camp life', 'Medical form, Parts A and B', 24),
    ('Optional', 'Fishing rod', 25),
    ('Optional', 'Basketball or gaga ball', 26),
    ('Optional', 'Yard games to share (labeled with your name)', 27)
  ) as v(category, label, sort_order)
 where e.external_id = '745658' and e.category = 'Campout';

commit;

select title, starts_at, jsonb_array_length(links) as links, jsonb_array_length(sections) as sections,
       (select count(*) from public.itinerary_items i where i.event_id = e.id) as schedule_items,
       (select count(*) from public.packing_items p where p.event_id = e.id) as packing_items
  from public.events e where external_id = '745658';
