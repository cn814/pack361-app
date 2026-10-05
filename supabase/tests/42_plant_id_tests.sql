-- Plant ID daily limits: 25 per adult, 450 for the pack, members only.
\set QUIET on
set client_min_messages = notice;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal1"}', true);
select test.check(public.claim_plant_id() = 24, 'a member claims a plant ID (24 left)');
do $$ begin for i in 1..24 loop perform public.claim_plant_id(); end loop; end $$;
select test.check(true, 'up to 25 a day');
select test.expect_error('select public.claim_plant_id()', '54000', 'the 26th is refused');
select test.expect_error('select * from public.plant_id_uses', '42501', 'nobody reads the counts directly');
rollback;

begin;
reset role;
insert into public.plant_id_uses (adult_id, day, uses)
select '30000000-0000-0000-0000-00000000000b', (now() at time zone 'America/New_York')::date, 450;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal1"}', true);
select test.expect_error('select public.claim_plant_id()', '54000', 'the pack stops at 450 a day');
rollback;

begin;
set local role anon;
select test.expect_error('select public.claim_plant_id()', '42501', 'the public cannot use it');
rollback;
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ee","aal":"aal1"}', true);
select test.expect_error('select public.claim_plant_id()', '42501', 'or people not on the roster');
rollback;
