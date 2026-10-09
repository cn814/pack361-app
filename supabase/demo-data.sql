-- =============================================================================
-- Made-up families for the BETA database only (scripts/setup-beta-db.sh). Every name, email and
-- phone number here is invented (example.com addresses, 555 numbers), so testers can try every
-- screen without any real family's information. Never run this on the live database.
-- Run after the migrations and supabase/seed.sql (which makes the dens and the first events).
-- =============================================================================

begin;

-- Five families, named after trees so nobody mistakes them for real ones.
insert into public.families (id, family_name) values
  ('b0000000-0000-4000-8000-000000000001', 'Maple'),
  ('b0000000-0000-4000-8000-000000000002', 'Birch'),
  ('b0000000-0000-4000-8000-000000000003', 'Cedar'),
  ('b0000000-0000-4000-8000-000000000004', 'Willow'),
  ('b0000000-0000-4000-8000-000000000005', 'Aspen')
on conflict (id) do nothing;

insert into public.adults (id, family_id, first_name, last_name, email, phone, role, position_title) values
  ('b1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'Jordan', 'Maple',  'jordan.maple@example.com',  '410-555-0101', 'den_leader', 'Wolf Den Leader'),
  ('b1000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'Casey',  'Maple',  'casey.maple@example.com',   '410-555-0102', 'parent', null),
  ('b1000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000002', 'Riley',  'Birch',  'riley.birch@example.com',   '410-555-0103', 'parent', null),
  ('b1000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000003', 'Morgan', 'Cedar',  'morgan.cedar@example.com',  '410-555-0104', 'committee', 'Treasurer'),
  ('b1000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000004', 'Taylor', 'Willow', 'taylor.willow@example.com', '410-555-0105', 'parent', 'Quartermaster'),
  ('b1000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000005', 'Quinn',  'Aspen',  'quinn.aspen@example.com',   '410-555-0106', 'parent', null)
on conflict (id) do nothing;

-- Scouts in a spread of dens (dens come from seed.sql).
insert into public.scouts (id, family_id, den_id, first_name, last_name, bsa_member_id)
select v.id::uuid, v.family_id::uuid, d.id, v.first_name, v.last_name, v.member_id
  from (values
    ('b2000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'wolf',    1, 'Sam',    'Maple',  '900000001'),
    ('b2000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'lion',    6, 'Ellis',  'Maple',  '900000002'),
    ('b2000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000002', 'wolf',    1, 'Rowan',  'Birch',  '900000003'),
    ('b2000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000003', 'bear',    5, 'Avery',  'Cedar',  '900000004'),
    ('b2000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000004', 'tiger',   2, 'Jamie',  'Willow', '900000005'),
    ('b2000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000005', 'webelos', 4, 'Parker', 'Aspen',  '900000006')
  ) as v(id, family_id, rank, number, first_name, last_name, member_id)
  join public.dens d on d.rank::text = v.rank and d.number = v.number
on conflict (id) do nothing;

-- Jordan leads the Wolf den.
insert into public.den_leaders (den_id, adult_id)
select d.id, 'b1000000-0000-4000-8000-000000000001' from public.dens d where d.rank = 'wolf' and d.number = 1
on conflict do nothing;

-- A few answers on the campout from seed.sql, so Who's going and Ready to go? have something to show.
insert into public.event_rsvps (event_id, family_id, adult_id, status, scouts, adults, siblings)
select e.id, v.family_id::uuid, v.adult_id::uuid, v.status, v.scouts, v.adults, v.siblings
  from public.events e
  cross join (values
    ('b0000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'yes',   2, 2, 0),
    ('b0000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000003', 'yes',   1, 1, 1),
    ('b0000000-0000-4000-8000-000000000004', 'b1000000-0000-4000-8000-000000000005', 'maybe', 1, 1, 0)
  ) as v(family_id, adult_id, status, scouts, adults, siblings)
 where e.category = 'Campout'
on conflict do nothing;

commit;
