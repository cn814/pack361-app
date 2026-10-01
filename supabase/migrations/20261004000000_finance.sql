-- Pack finances: expenses, reimbursements, other income, a yearly budget and the reports
-- built from them (Leaders -> Money -> Expenses and Reports).
--   1. finance_categories: budget lines for money in and money out. The app counts some
--      income on its own (dues, event fees and other charges paid to the pack, and Givebutter
--      orders); those categories carry a `source` and can't take hand-entered income.
--   2. finance_budget: the budget per season (July to June) and category.
--   3. finance_income: money in that the app doesn't see on its own (a check from a sponsor,
--      popcorn commission, bank interest).
--   4. expenses: money out. Leadership records what the pack paid for directly; any member
--      can ask to be paid back for something they bought for the pack, with a receipt.
--      Nobody approves or pays back their own request.
--   5. A private "receipts" bucket: PDFs and pictures, 10 MB each.

-- -----------------------------------------------------------------------------
-- 1. Categories
-- -----------------------------------------------------------------------------
create table public.finance_categories (
    id           uuid primary key default gen_random_uuid(),
    kind         text not null check (kind in ('income', 'expense')),
    name         text not null check (length(trim(name)) between 1 and 60),
    -- Income the app adds up itself: charges paid to the pack by kind, and Givebutter.
    source       text unique check (source in ('dues', 'event', 'registration', 'other_charges', 'givebutter')),
    sort         int not null default 100 check (sort between 0 and 10000),
    archived_at  timestamptz,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now(),
    updated_by   uuid references public.adults(id) on delete set null,
    check (source is null or kind = 'income')
);
create unique index finance_categories_name_idx on public.finance_categories(kind, lower(trim(name)));

create trigger finance_categories_stamp before insert or update on public.finance_categories
    for each row execute function private.stamp_updated();

-- A category's kind and source never change (reports and old entries depend on them).
create or replace function private.finance_categories_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    if tg_op = 'UPDATE' then
        new.kind   := old.kind;
        new.source := old.source;
        new.created_at := old.created_at;
    end if;
    new.name := trim(regexp_replace(new.name, '\s+', ' ', 'g'));
    return new;
end;
$$;
revoke execute on function private.finance_categories_guard() from public, anon, authenticated;
create trigger finance_categories_guard before insert or update on public.finance_categories
    for each row execute function private.finance_categories_guard();

insert into public.finance_categories (kind, name, source, sort) values
    ('income',  'Pack dues',                        'dues',          10),
    ('income',  'Event fees',                       'event',         20),
    ('income',  'Registration fees collected',      'registration',  30),
    ('income',  'Other charges paid to the pack',   'other_charges', 40),
    ('income',  'Givebutter fundraisers and donations', 'givebutter', 50),
    ('income',  'Popcorn and other fundraising',    null,            60),
    ('income',  'Donations and sponsors',           null,            70),
    ('income',  'Bank interest',                    null,            80),
    ('income',  'Other income',                     null,            90),
    ('expense', 'Den meetings',                     null,            10),
    ('expense', 'Pack meetings',                    null,            20),
    ('expense', 'Awards and advancement',           null,            30),
    ('expense', 'Pinewood Derby',                   null,            40),
    ('expense', 'Rocket Derby',                     null,            50),
    ('expense', 'Blue and Gold',                    null,            60),
    ('expense', 'Camping and outings',              null,            70),
    ('expense', 'Equipment and storage',            null,            80),
    ('expense', 'Leader training and recognition',  null,            90),
    ('expense', 'Fundraising costs',                null,           100),
    ('expense', 'Registration fees sent to council', null,          110),
    ('expense', 'Bank and payment fees',            null,           120),
    ('expense', 'Supplies and printing',            null,           130),
    ('expense', 'Other expenses',                   null,           140);

-- -----------------------------------------------------------------------------
-- 2. Budget (per season, like '2026-27', July 1 to June 30)
-- -----------------------------------------------------------------------------
create table public.finance_budget (
    season       text not null check (season ~ '^\d{4}-\d{2}$'),
    category_id  uuid not null references public.finance_categories(id) on delete cascade,
    amount_cents int not null check (amount_cents between 0 and 10000000),
    updated_at   timestamptz not null default now(),
    updated_by   uuid references public.adults(id) on delete set null,
    primary key (season, category_id)
);
create trigger finance_budget_stamp before insert or update on public.finance_budget
    for each row execute function private.stamp_updated();

-- -----------------------------------------------------------------------------
-- 3. Other income (hand-entered)
-- -----------------------------------------------------------------------------
create table public.finance_income (
    id            uuid primary key default gen_random_uuid(),
    received_on   date not null check (received_on between '2000-01-01' and '2100-01-01'),
    amount_cents  int not null check (amount_cents between 1 and 10000000),
    category_id   uuid not null references public.finance_categories(id) on delete restrict,
    description   text not null check (length(trim(description)) between 1 and 200),
    received_via  text check (received_via in ('check', 'cash', 'deposit', 'paypal', 'givebutter', 'other')),
    reference     text check (length(reference) <= 60),
    note          text check (length(note) <= 500),
    created_by    uuid references public.adults(id) on delete set null default private.current_adult_id(),
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    updated_by    uuid references public.adults(id) on delete set null
);
create index finance_income_received_idx on public.finance_income(received_on);
create index finance_income_category_idx on public.finance_income(category_id);

create trigger finance_income_stamp before insert or update on public.finance_income
    for each row execute function private.stamp_updated();

-- Only income categories the app doesn't already count (no double counting of dues or Givebutter).
create or replace function private.finance_income_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    if not exists (select 1 from public.finance_categories c
                    where c.id = new.category_id and c.kind = 'income' and c.source is null) then
        raise exception 'Pick an income category the app doesn''t already count on its own'
            using errcode = '22023';
    end if;
    if tg_op = 'UPDATE' then
        new.created_by := old.created_by;
        new.created_at := old.created_at;
    end if;
    new.description := trim(new.description);
    return new;
end;
$$;
revoke execute on function private.finance_income_guard() from public, anon, authenticated;
create trigger finance_income_guard before insert or update on public.finance_income
    for each row execute function private.finance_income_guard();

-- -----------------------------------------------------------------------------
-- 4. Expenses and reimbursements
-- -----------------------------------------------------------------------------
--   paid_by 'pack'   : the pack paid directly (pack card, pack check). Recorded by leadership as paid.
--   paid_by 'member' : someone paid with their own money and is owed it back (adult_id).
--   status           : submitted -> approved -> paid, or declined.
create table public.expenses (
    id              uuid primary key default gen_random_uuid(),
    spent_on        date not null check (spent_on between '2000-01-01' and '2100-01-01'),
    amount_cents    int not null check (amount_cents between 1 and 10000000),
    category_id     uuid references public.finance_categories(id) on delete restrict,
    description     text not null check (length(trim(description)) between 1 and 200),
    vendor          text check (length(vendor) <= 100),
    event_id        uuid references public.events(id) on delete set null,
    den_id          uuid references public.dens(id) on delete set null,
    paid_by         text not null default 'member' check (paid_by in ('pack', 'member')),
    adult_id        uuid references public.adults(id) on delete set null,   -- who is owed (member)
    status          text not null default 'submitted' check (status in ('submitted', 'approved', 'paid', 'declined')),
    pay_me_by       text check (pay_me_by in ('check', 'cash', 'paypal', 'zelle', 'venmo', 'other')),
    note            text check (length(note) <= 500),                       -- from the person asking
    receipt_path    text unique check (receipt_path ~ '^r/[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$'),
    receipt_name    text check (length(receipt_name) between 1 and 200),
    receipt_mime    text check (receipt_mime in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
    receipt_bytes   bigint check (receipt_bytes between 0 and 10485760),
    review_note     text check (length(review_note) <= 500),                -- from leadership (say, why declined)
    approved_by     uuid references public.adults(id) on delete set null,
    approved_at     timestamptz,
    paid_via        text check (paid_via in ('check', 'cash', 'paypal', 'zelle', 'venmo', 'card', 'transfer', 'other')),
    paid_on         date check (paid_on between '2000-01-01' and '2100-01-01'),
    paid_ref        text check (length(paid_ref) <= 60),                    -- check number, transaction id
    settled_by      uuid references public.adults(id) on delete set null,
    created_by      uuid references public.adults(id) on delete set null default private.current_adult_id(),
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    updated_by      uuid references public.adults(id) on delete set null,
    check (paid_by = 'pack' or adult_id is not null),
    check (paid_by = 'member' or status = 'paid'),
    check (status <> 'paid' or paid_on is not null),
    check (status in ('submitted', 'declined') or category_id is not null),
    check ((receipt_path is null) = (receipt_mime is null))
);
create index expenses_spent_idx    on public.expenses(spent_on);
create index expenses_status_idx   on public.expenses(status);
create index expenses_adult_idx    on public.expenses(adult_id);
create index expenses_event_idx    on public.expenses(event_id) where event_id is not null;
create index expenses_category_idx on public.expenses(category_id);

create trigger expenses_stamp before insert or update on public.expenses
    for each row execute function private.stamp_updated();

-- The rules Row Level Security can't express on its own:
--   * A member asking to be paid back sets only the request: it starts 'submitted', for
--     themselves, with a receipt from their own folder, and they can change it only until
--     leadership acts on it.
--   * Leadership approves and pays, and the database records who did it. Nobody approves or
--     pays back their own request (another leadership member has to).
--   * Expense categories only.
create or replace function private.expenses_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
    me uuid := private.current_adult_id();
    lead boolean := private.is_committee();
begin
    if new.category_id is not null
       and not exists (select 1 from public.finance_categories c where c.id = new.category_id and c.kind = 'expense') then
        raise exception 'Pick an expense category' using errcode = '22023';
    end if;

    if tg_op = 'UPDATE' then
        new.created_by := old.created_by;
        new.created_at := old.created_at;
    end if;

    -- The secret key (jobs, scripts) is trusted.
    if me is null and auth.uid() is null then
        return new;
    end if;

    if new.receipt_path is not null
       and (tg_op = 'INSERT' or new.receipt_path is distinct from old.receipt_path)
       and new.receipt_path not like 'r/' || me::text || '/%' then
        raise exception 'A receipt must be your own upload' using errcode = '42501';
    end if;

    if not lead then
        if tg_op = 'UPDATE' and (old.status <> 'submitted' or old.adult_id is distinct from me) then
            raise exception 'Leadership is already handling this request' using errcode = '42501';
        end if;
        if new.paid_by <> 'member' or new.adult_id is distinct from me or new.status <> 'submitted'
           or new.approved_by is not null or new.approved_at is not null
           or new.paid_via is not null or new.paid_on is not null or new.paid_ref is not null
           or new.settled_by is not null
           or new.review_note is distinct from (case when tg_op = 'UPDATE' then old.review_note end) then
            raise exception 'Only pack leadership can approve or pay expenses' using errcode = '42501';
        end if;
        return new;
    end if;

    -- Leadership.
    if new.paid_by = 'member' and new.adult_id = me
       and new.status in ('approved', 'paid')
       and (tg_op = 'INSERT' or old.status is distinct from new.status) then
        raise exception 'Another leadership member has to approve or pay back your own request'
            using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and old.status in ('approved', 'paid') and new.paid_by = 'member'
       and new.adult_id is distinct from old.adult_id then
        raise exception 'Who is owed can''t change once a request is approved' using errcode = '22023';
    end if;

    if new.status in ('approved', 'paid') and (tg_op = 'INSERT' or old.status not in ('approved', 'paid')) then
        new.approved_by := me;
        new.approved_at := now();
    elsif new.status in ('submitted', 'declined') then
        new.approved_by := null;
        new.approved_at := null;
    elsif tg_op = 'UPDATE' then
        new.approved_by := old.approved_by;
        new.approved_at := old.approved_at;
    end if;

    if new.status = 'paid' then
        if tg_op = 'INSERT' or old.status <> 'paid' then
            new.settled_by := me;
        else
            new.settled_by := old.settled_by;
        end if;
    else
        new.settled_by := null;
        new.paid_via := null;
        new.paid_on  := null;
        new.paid_ref := null;
    end if;

    new.description := trim(new.description);
    return new;
end;
$$;
revoke execute on function private.expenses_guard() from public, anon, authenticated;
create trigger expenses_guard before insert or update on public.expenses
    for each row execute function private.expenses_guard();

-- Members delete (withdraw) only their own requests that leadership hasn't acted on.
create or replace function private.expenses_delete_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    if auth.uid() is not null and not private.is_committee()
       and (old.status <> 'submitted' or old.adult_id is distinct from private.current_adult_id()) then
        raise exception 'Leadership is already handling this request' using errcode = '42501';
    end if;
    return old;
end;
$$;
revoke execute on function private.expenses_delete_guard() from public, anon, authenticated;
create trigger expenses_delete_guard before delete on public.expenses
    for each row execute function private.expenses_delete_guard();

-- -----------------------------------------------------------------------------
-- Privileges and Row Level Security
-- -----------------------------------------------------------------------------
revoke all on public.finance_categories, public.finance_budget, public.finance_income, public.expenses
    from anon, authenticated;
grant select on public.finance_categories to authenticated;
grant insert, update, delete on public.finance_categories to authenticated;
grant select, insert, update, delete on public.finance_budget, public.finance_income, public.expenses to authenticated;

alter table public.finance_categories enable row level security;
alter table public.finance_budget     enable row level security;
alter table public.finance_income     enable row level security;
alter table public.expenses           enable row level security;

-- Members see the categories (to file their request); leadership manages them.
create policy finance_categories_read on public.finance_categories for select to authenticated
    using (private.is_member());
create policy finance_categories_add on public.finance_categories for insert to authenticated
    with check (private.is_committee() and source is null);
create policy finance_categories_edit on public.finance_categories for update to authenticated
    using (private.is_committee()) with check (private.is_committee());
-- Deleting a category is possible only while nothing uses it (foreign keys), and never the
-- ones the app counts on its own.
create policy finance_categories_delete on public.finance_categories for delete to authenticated
    using (private.is_committee() and source is null);

create policy finance_budget_all on public.finance_budget for all to authenticated
    using (private.is_committee()) with check (private.is_committee());

create policy finance_income_all on public.finance_income for all to authenticated
    using (private.is_committee()) with check (private.is_committee());

-- Leadership sees every expense; anyone else sees only their own requests.
create policy expenses_read on public.expenses for select to authenticated
    using (private.is_committee() or (private.is_member() and adult_id = private.current_adult_id()));
create policy expenses_insert on public.expenses for insert to authenticated
    with check (private.is_committee()
                or (private.is_member() and adult_id = private.current_adult_id()
                    and paid_by = 'member' and status = 'submitted'));
create policy expenses_update on public.expenses for update to authenticated
    using (private.is_committee()
           or (adult_id = private.current_adult_id() and status = 'submitted'))
    with check (private.is_committee()
                or (adult_id = private.current_adult_id() and status = 'submitted'));
create policy expenses_delete on public.expenses for delete to authenticated
    using (private.is_committee()
           or (adult_id = private.current_adult_id() and status = 'submitted'));

-- -----------------------------------------------------------------------------
-- 5. Receipts bucket: r/<uploader adult id>/<random>.<ext>
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
   set public = false,
       file_size_limit = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;

-- Is this receipt on a request leadership has acted on? Then the uploader can't delete it.
create or replace function private.receipt_locked(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (select 1 from public.expenses e where e.receipt_path = p_path and e.status <> 'submitted')
$$;
revoke execute on function private.receipt_locked(text) from public, anon;
grant execute on function private.receipt_locked(text) to authenticated;

create policy "receipts read" on storage.objects for select to authenticated
    using (bucket_id = 'receipts'
           and (private.is_committee()
                or (private.is_member()
                    and (storage.foldername(name))[1] = 'r'
                    and (storage.foldername(name))[2] = private.current_adult_id()::text)));

create policy "receipts upload" on storage.objects for insert to authenticated
    with check (bucket_id = 'receipts'
                and private.is_member()
                and (storage.foldername(name))[1] = 'r'
                and (storage.foldername(name))[2] = private.current_adult_id()::text);

create policy "receipts delete" on storage.objects for delete to authenticated
    using (bucket_id = 'receipts'
           and (private.is_committee()
                or (private.is_member()
                    and (storage.foldername(name))[1] = 'r'
                    and (storage.foldername(name))[2] = private.current_adult_id()::text
                    and not private.receipt_locked(name))));

-- After a browser upload, the app checks the real size and type before saving the request.
create or replace function public.receipt_upload_info(p_path text)
returns table (size_bytes bigint, mime_type text)
language sql stable security definer set search_path = '' as $$
    select (o.metadata->>'size')::bigint, o.metadata->>'mimetype'
      from storage.objects o
     where o.bucket_id = 'receipts'
       and o.name = p_path
       and private.is_member()
       and p_path like 'r/' || private.current_adult_id()::text || '/%'
$$;
revoke execute on function public.receipt_upload_info(text) from public, anon;
grant execute on function public.receipt_upload_info(text) to authenticated;
