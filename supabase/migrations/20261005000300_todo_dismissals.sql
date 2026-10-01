-- "Not now" on to-dos (2026-10-05). People can hide the nice-to-have items on Home and in the
-- bell (polls, volunteer jobs) so the ones that matter stand out. A hidden item comes back at
-- hidden_until (say, a day before a poll closes); null keeps it hidden. Money due, medical forms
-- and registration can't be hidden: they clear themselves when they're done. Each person's own.
create table public.todo_dismissals (
    adult_id      uuid not null references public.adults(id) on delete cascade default private.current_adult_id(),
    key           text not null check (key ~ '^(poll|job)-[0-9a-f-]{36}$'),
    hidden_until  timestamptz,
    created_at    timestamptz not null default now(),
    primary key (adult_id, key)
);

revoke all on public.todo_dismissals from anon, authenticated;
grant select, insert, update, delete on public.todo_dismissals to authenticated;
alter table public.todo_dismissals enable row level security;
create policy todo_dismissals_own on public.todo_dismissals for all to authenticated
    using (adult_id = private.current_adult_id())
    with check (adult_id = private.current_adult_id() and private.is_member());
