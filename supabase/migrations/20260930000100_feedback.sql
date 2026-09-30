-- In-app "report a problem / send a note": saved here and sent to the pack admins.
create table public.feedback (
    id           uuid primary key default gen_random_uuid(),
    adult_id     uuid references public.adults(id) on delete set null,
    kind         text not null default 'problem' check (kind in ('problem', 'idea', 'question', 'other')),
    message      text not null check (length(trim(message)) between 1 and 4000),
    page         text,
    created_at   timestamptz not null default now(),
    resolved_at  timestamptz,
    resolved_by  uuid references public.adults(id) on delete set null
);
create index feedback_open_idx on public.feedback(created_at) where resolved_at is null;

revoke all on public.feedback from anon, authenticated;
grant select, insert on public.feedback to authenticated;
grant update (resolved_at, resolved_by) on public.feedback to authenticated;
alter table public.feedback enable row level security;

create policy feedback_send on public.feedback for insert to authenticated
    with check (private.is_member() and adult_id = private.current_adult_id() and resolved_at is null);
create policy feedback_read on public.feedback for select to authenticated
    using (adult_id = private.current_adult_id() or private.is_admin());
create policy feedback_resolve on public.feedback for update to authenticated
    using (private.is_admin()) with check (private.is_admin());
