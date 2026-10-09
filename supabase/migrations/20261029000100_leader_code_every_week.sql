-- Leaders re-enter their authenticator code every 7 days. RUN ONLY AFTER release 3.26 is live
-- (that release asks leaders for the code again once a week; the older app would quietly show
-- them a parent's view instead).
--
-- A session counts as "code entered" when it's aal2 AND the authenticator code was entered in the
-- last 7 days (the "totp" entry in the session's amr list). If a session carries no amr list at
-- all, only aal2 is checked, as before, so an unexpected token shape can't lock every leader out.

begin;

create or replace function private.code_entered()
returns boolean language sql stable set search_path = '' as $$
    select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
       and case
             when jsonb_typeof(auth.jwt() -> 'amr') is distinct from 'array' then true
             else coalesce((
                 select max((e ->> 'timestamp')::bigint)
                   from jsonb_array_elements(auth.jwt() -> 'amr') e
                  where jsonb_typeof(e) = 'object'
                    and e ->> 'method' = 'totp'
                    and (e ->> 'timestamp') ~ '^[0-9]{1,12}$'
             ), 0) > extract(epoch from now() - interval '7 days')
           end
$$;
revoke execute on function private.code_entered() from public, anon;
grant execute on function private.code_entered() to authenticated;

commit;
