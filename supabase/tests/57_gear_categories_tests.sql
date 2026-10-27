-- The gear closet's kinds of gear include Activities and Recruitment.
\set QUIET on

\echo '== Gear categories'
begin;
select test.expect_rows($$insert into public.gear_items (name, category) values ('Recruitment table banner', 'Recruitment'), ('Parachute', 'Activities')$$, 2,
                        'Recruitment and Activities are kinds of gear');
select test.expect_error($$insert into public.gear_items (name, category) values ('Canoe', 'Boats')$$, '23514',
                         'the list is still fixed');
rollback;
