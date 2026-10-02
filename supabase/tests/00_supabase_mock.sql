-- Minimal stand-in for the parts of Supabase the migration depends on,
-- so the schema and policies can be tested on plain Postgres.
-- (Not needed in a real Supabase project.)
do $$ begin
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
exception when duplicate_object then null;   -- roles are cluster-wide; fine if they exist
end $$;
grant anon, authenticated, service_role to postgres;

create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text unique, last_sign_in_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$
    select nullif(nullif(current_setting('request.jwt.claims', true), '')::json->>'sub', '')::uuid
$$;
create function auth.role() returns text language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), '')::json->>'role', current_user::text)
$$;
create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
grant usage on schema auth to anon, authenticated, service_role;

create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, metadata jsonb, created_at timestamptz default now());
create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.objects to authenticated;

-- Supabase default: API roles get ALL on new public tables (the migration tightens this)
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
