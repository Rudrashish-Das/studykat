-- 00_shim.sql
-- Recreates just enough of Supabase's environment to run the migrations and
-- the test suite against a plain Postgres container. Supabase provides all of
-- this itself; nothing here ships to production.
--
-- See supabase/tests/README.md for how to run it.

-- The roles PostgREST authenticates as.
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;

grant usage on schema public to anon, authenticated, service_role;

-- Supabase grants the API roles full table privileges and relies on RLS to do
-- the actual gatekeeping. Reproducing that is the point: it is what makes the
-- "client cannot write to wallet" assertions meaningful rather than vacuous.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

-- The auth schema, reduced to the parts the migrations touch.
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id                  uuid primary key default gen_random_uuid(),
  instance_id         uuid,
  aud                 text,
  role                text,
  email               text unique,
  encrypted_password  text,
  email_confirmed_at  timestamptz,
  raw_user_meta_data  jsonb default '{}'::jsonb,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- `gen_random_uuid()` has been in core since PostgreSQL 13 and Supabase runs
-- well past that, so pgcrypto is not actually required — but ask for it anyway
-- where it is available, and do not fail where it is not (PGlite, for one).
do $$
begin
  execute 'create extension if not exists pgcrypto';
exception when others then
  null;
end $$;

-- Supabase reads the signed JWT that PostgREST puts in `request.jwt.claims`.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', 'anon');
$$;

-- Test helpers live in 01_helpers.sql, which runs after the migrations:
-- they reference tables the migrations create.
