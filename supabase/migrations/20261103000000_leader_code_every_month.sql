-- Leaders re-enter their authenticator code every 30 days (was 7: 20261029000100_leader_code_every_week.sql).
-- RUN THIS BEFORE release 3.32 goes live. The app then stops asking for the code until it's 30 days
-- old, and if the database still had the 7-day rule, a leader with an 8-day-old code would quietly
-- see a parent's view instead of an error. (Run early, it changes nothing the 3.31 app notices: the
-- app still asks weekly until 3.32.)
--
-- Same as before otherwise: a session counts as "code entered" when it's aal2 AND the authenticator
-- code ("totp" in the session's amr list) was entered within the window. A session with no amr list
-- at all is judged on aal2 alone.

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
             ), 0) > extract(epoch from now() - interval '30 days')
           end
$$;
revoke execute on function private.code_entered() from public, anon;
grant execute on function private.code_entered() to authenticated;

commit;
