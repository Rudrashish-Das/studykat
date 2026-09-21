-- 0001_profiles.sql
-- Identity: one profile row per auth user. The row is created by a trigger at
-- signup (see 0002, which runs after the wallet and streak tables exist) so the
-- client never needs insert rights on anything.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- helpers --

-- A 16-character seed from an unambiguous alphabet (no 0/O, no 1/l). This is
-- the only input to the cat generator, so once set it must never change.
create or replace function public.generate_cat_seed()
returns text
language plpgsql
volatile
as $$
declare
  alphabet constant text := 'abcdefghijkmnopqrstuvwxyz23456789';
  result text := '';
  i int;
begin
  for i in 1..16 loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return result;
end;
$$;

-- Catalog lookup, so it is stable rather than immutable — which is why the
-- timezone is validated by trigger below and not by a CHECK constraint.
create or replace function public.is_valid_timezone(tz text)
returns boolean
language sql
stable
as $$
  select exists (select 1 from pg_timezone_names where name = tz);
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- --------------------------------------------------------------- profiles --

create table if not exists public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  display_name        text,
  cat_name            text        not null default 'Cat',
  cat_seed            text        not null default public.generate_cat_seed(),
  -- Which of the three onboarding candidates the user picked. The seed alone
  -- fixes what the three are; this records which one is theirs.
  cat_variant         smallint    not null default 0,
  daily_goal_minutes  int         not null default 60,
  timezone            text        not null default 'UTC',
  onboarded_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint profiles_cat_name_len    check (char_length(trim(cat_name)) between 1 and 24),
  constraint profiles_cat_seed_len    check (char_length(cat_seed) = 16),
  constraint profiles_cat_variant_rng check (cat_variant between 0 and 2),
  constraint profiles_goal_range      check (daily_goal_minutes between 5 and 720)
);

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Reject a bogus timezone at write time rather than silently bucketing a
-- user's days into UTC, and refuse to let the cat seed be rerolled — otherwise
-- "unique to your account" means "unique until you press refresh". RLS cannot
-- express either rule, so they live in a trigger.
create or replace function public.guard_profile_writes()
returns trigger
language plpgsql
as $$
begin
  if not public.is_valid_timezone(new.timezone) then
    raise exception 'unknown IANA timezone: %', new.timezone
      using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE' then
    if new.cat_seed is distinct from old.cat_seed then
      raise exception 'cat_seed is immutable' using errcode = 'check_violation';
    end if;
    if new.id is distinct from old.id then
      raise exception 'profile id is immutable' using errcode = 'check_violation';
    end if;
    -- Onboarding is a one-way door; it must not be un-set to farm the flow.
    if old.onboarded_at is not null and new.onboarded_at is null then
      raise exception 'onboarded_at cannot be cleared' using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_writes on public.profiles;
create trigger profiles_guard_writes
  before insert or update on public.profiles
  for each row execute function public.guard_profile_writes();

-- -------------------------------------------------------------------- RLS --

alter table public.profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (auth.uid() = id);

-- Update only. No insert policy — rows come from the signup trigger. No delete
-- policy — the row goes when the auth user goes, by cascade.
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
