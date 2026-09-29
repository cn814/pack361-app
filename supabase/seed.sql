-- =============================================================================
-- Pack 361 starter data. Run once in the Supabase SQL Editor after the migration.
-- The SQL Editor runs as the database owner, so RLS doesn't block these inserts.
-- =============================================================================

-- 1. Dens for 2026-27, numbered as in Scoutbook Plus.
--    (You are made admin by the roster import, imports/roster_import.sql.
--     If you skip the import, add yourself first:
--     insert into public.adults (first_name, last_name, email, role) values ('Chris','Nealen','you@example.com','admin');)
insert into public.dens (rank, number, meeting_info) values
  ('lion', 6, null), ('tiger', 2, null), ('wolf', 1, null), ('bear', 5, null),
  ('webelos', 4, null), ('aol', 3, null), ('aol', 8, null)
on conflict (rank, number) do nothing;

-- 2. Pack meetings: 1st and 3rd Mondays, 6:30-7:30 PM, First Presbyterian Church of Howard County (Columbia)
insert into public.events (title, category, starts_at, ends_at, location_name, address, source) values
  ('Pack & Den Meeting', 'Pack Meeting', '2026-10-05 18:30-04', '2026-10-05 19:30-04', 'First Presbyterian Church of Howard County', 'Columbia, MD', 'manual'),
  ('Pack & Den Meeting', 'Pack Meeting', '2026-10-19 18:30-04', '2026-10-19 19:30-04', 'First Presbyterian Church of Howard County', 'Columbia, MD', 'manual'),
  ('Pack & Den Meeting', 'Pack Meeting', '2026-11-02 18:30-05', '2026-11-02 19:30-05', 'First Presbyterian Church of Howard County', 'Columbia, MD', 'manual'),
  ('Pack & Den Meeting', 'Pack Meeting', '2026-11-16 18:30-05', '2026-11-16 19:30-05', 'First Presbyterian Church of Howard County', 'Columbia, MD', 'manual');

-- 3. Upcoming events (copied from the pack's Givebutter campaigns)
insert into public.events (title, category, starts_at, location_name, address, signup_url, source, external_id) values
  ('Pack 361 Family Picnic', 'Pack', '2026-10-17 12:00-04',
   'Centennial Park South Pavilion', 'Centennial Park, Ellicott City, MD',
   'https://givebutter.com/c/pack361-picnic', 'givebutter', '178074'),
  ('Fall 2026 Campout', 'Campout', '2026-10-23 19:00-04',
   'Broad Creek Memorial Scout Reservation', 'Whiteford, MD',
   'https://givebutter.com/c/pack361-campout', 'givebutter', '182013');

-- 4. Default campout packing list (event_id null = used for every campout)
insert into public.packing_items (category, label, detail, required, sort_order) values
  ('Cub Scout Six Essentials', 'First aid kit', 'Adhesive bandages, moleskin, any personal meds (give to adult leader)', true, 1),
  ('Cub Scout Six Essentials', 'Filled water bottle', null, true, 2),
  ('Cub Scout Six Essentials', 'Flashlight or headlamp', 'Fresh batteries', true, 3),
  ('Cub Scout Six Essentials', 'Trail food', 'Nut-free', true, 4),
  ('Cub Scout Six Essentials', 'Sun protection', 'Sunscreen, hat', true, 5),
  ('Cub Scout Six Essentials', 'Whistle', null, true, 6),
  ('Sleeping', 'Tent, ground cloth and stakes', 'One per family', true, 10),
  ('Sleeping', 'Sleeping bag', 'Rated for overnight lows; late October in MD can dip into the 30s', true, 11),
  ('Sleeping', 'Sleeping pad or cot', null, false, 12),
  ('Sleeping', 'Pillow', null, false, 13),
  ('Clothing', 'Field uniform', 'For the campfire program / flag ceremony', true, 20),
  ('Clothing', 'Pack 361 T-shirt (activity uniform)', null, false, 21),
  ('Clothing', 'Rain jacket or poncho', null, true, 22),
  ('Clothing', 'Warm layer (fleece or jacket) and knit hat', null, true, 23),
  ('Clothing', 'Extra socks (2 pairs, wool or synthetic)', null, true, 24),
  ('Camp', 'Camp chair', null, false, 30),
  ('Camp', 'Mess kit / plate, cup, utensils', null, true, 31),
  ('Camp', 'Whittling Chip card and pocketknife', 'Bears and up, only if earned', false, 32);
