-- Terms of use: each adult records their own agreement; nobody can record it for someone else.
\set QUIET on

\echo '== Terms of use'
begin;
set local role anon;
select test.expect_error('select public.accept_terms(1)', '42501', 'visitors cannot agree for anyone');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal1"}', true);
select public.accept_terms(1);
reset role;
select test.check((select terms_version = 1 and terms_accepted_at is not null from public.adults
                    where id = '30000000-0000-0000-0000-00000000000a'), 'a parent records that they agreed to version 1');
select test.check((select terms_version is null from public.adults where id = '30000000-0000-0000-0000-00000000000b'),
                  'and no one else is marked');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal1"}', true);
select test.expect_error($$update public.adults set terms_version = 5 where id = '30000000-0000-0000-0000-00000000000a'$$,
                         '42501', 'they cannot set the version by hand');
select test.expect_error('select public.accept_terms(0)', '22023', 'or agree to a version that does not exist');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000e","aal":"aal1"}', true);
select test.expect_error('select public.accept_terms(1)', '42501', 'someone not on the roster cannot agree');
reset role;
rollback;
