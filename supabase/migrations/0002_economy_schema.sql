-- 0002_economy_schema.sql
-- Tables for sessions, currency, streaks, the catalog, and the room.
--
-- The shape of the RLS here is the whole security model: the anon key is
-- public, so the client gets SELECT on its own rows and nothing else. Every
-- write that creates value — coins, streaks, inventory — happens inside a
-- SECURITY DEFINER function in 0003. `wallet`, `transactions`, `streaks`,
-- `study_sessions` and `inventory` deliberately have no insert/update/delete
-- policy at all.

-- ------------------------------------------------------------------ enums --

do $$ begin
  create type public.session_status as enum ('active', 'completed', 'abandoned');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.transaction_reason as enum
    ('session', 'streak_bonus', 'purchase', 'milestone', 'refund');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.item_category as enum
    ('floor', 'wall', 'rug', 'furniture', 'plant', 'toy', 'light', 'wallcolor', 'decor');
exception when duplicate_object then null; end $$;

-- --------------------------------------------------------------- subjects --

create table if not exists public.subjects (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  color      text not null default '#a7b89b',
  archived   boolean not null default false,
  created_at timestamptz not null default now(),

  constraint subjects_name_len  check (char_length(trim(name)) between 1 and 40),
  constraint subjects_color_hex check (color ~* '^#[0-9a-f]{6}$'),
  unique (user_id, name)
);

create index if not exists subjects_user_idx on public.subjects (user_id) where not archived;

-- --------------------------------------------------------- study_sessions --

create table if not exists public.study_sessions (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users (id) on delete cascade,
  subject_id              uuid references public.subjects (id) on delete set null,
  started_at              timestamptz not null default now(),
  ended_at                timestamptz,
  awarded_seconds         int not null default 0,
  coins_awarded           int not null default 0,
  status                  public.session_status not null default 'active',
  -- Recorded for auditing only. Never trusted, never used in a calculation.
  client_reported_seconds int,
  -- [{ "at": <iso>, "until": <iso|null> }, ...]; subtracted server-side.
  pauses                  jsonb not null default '[]'::jsonb,
  label                   text,

  constraint sessions_award_nonneg  check (awarded_seconds >= 0 and coins_awarded >= 0),
  constraint sessions_ended_after   check (ended_at is null or ended_at >= started_at),
  constraint sessions_label_len     check (label is null or char_length(label) <= 60),
  constraint sessions_pauses_array  check (jsonb_typeof(pauses) = 'array')
);

-- One live session per user, enforced by the database rather than by hope.
create unique index if not exists sessions_one_active_per_user
  on public.study_sessions (user_id) where status = 'active';

create index if not exists sessions_user_started_idx
  on public.study_sessions (user_id, started_at desc);

-- ----------------------------------------------------------------- wallet --

create table if not exists public.wallet (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  coins         bigint not null default 0,
  lifetime_coins bigint not null default 0,
  updated_at    timestamptz not null default now(),

  constraint wallet_nonneg check (coins >= 0 and lifetime_coins >= 0)
);

-- ----------------------------------------------------------- transactions --

create table if not exists public.transactions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  delta      int not null,
  reason     public.transaction_reason not null,
  ref_id     uuid,
  created_at timestamptz not null default now()
);

create index if not exists transactions_user_created_idx
  on public.transactions (user_id, created_at desc);

-- ---------------------------------------------------------------- streaks --

create table if not exists public.streaks (
  user_id           uuid primary key references auth.users (id) on delete cascade,
  current_streak    int not null default 0,
  longest_streak    int not null default 0,
  last_credited_day date,
  freeze_tokens     int not null default 0,
  -- How many completed 7-day blocks have already paid out a freeze token.
  freeze_grants     int not null default 0,

  constraint streaks_nonneg check (
    current_streak >= 0 and longest_streak >= 0 and freeze_tokens between 0 and 2
  )
);

-- ---------------------------------------------------------- catalog_items --

create table if not exists public.catalog_items (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  description text,
  category    public.item_category not null,
  price       int not null,
  -- null = always available. Otherwise {"kind":"streak","days":7} etc.
  unlock_rule jsonb,
  footprint_w int not null default 1,
  footprint_h int not null default 1,
  layer       int not null default 1,
  art_key     text not null,
  sort_order  int not null default 0,

  constraint catalog_price_nonneg check (price >= 0),
  constraint catalog_footprint    check (footprint_w between 1 and 4 and footprint_h between 1 and 4)
);

create index if not exists catalog_category_idx on public.catalog_items (category, sort_order);

-- -------------------------------------------------------------- inventory --

create table if not exists public.inventory (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  item_id     uuid not null references public.catalog_items (id) on delete cascade,
  acquired_at timestamptz not null default now(),
  unique (user_id, item_id)
);

create index if not exists inventory_user_idx on public.inventory (user_id);

-- ------------------------------------------------------------ room_layout --

create table if not exists public.room_layout (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references auth.users (id) on delete cascade,
  item_id  uuid not null references public.catalog_items (id) on delete cascade,
  grid_x   int not null,
  grid_y   int not null,
  rotation smallint not null default 0,
  z_index  int not null default 0,

  constraint room_grid_bounds check (grid_x between 0 and 9 and grid_y between 0 and 9),
  constraint room_rotation    check (rotation between 0 and 3)
);

create index if not exists room_layout_user_idx on public.room_layout (user_id);

-- ------------------------------------------------- signup provisioning ----

-- Runs as the definer so a brand-new user gets all three rows without the
-- authenticated role ever holding insert rights on them.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    -- Google supplies a name; email signup does not.
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  )
  on conflict (id) do nothing;

  insert into public.wallet (user_id) values (new.id) on conflict (user_id) do nothing;
  insert into public.streaks (user_id) values (new.id) on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -------------------------------------------------------------------- RLS --

alter table public.subjects       enable row level security;
alter table public.study_sessions enable row level security;
alter table public.wallet         enable row level security;
alter table public.transactions   enable row level security;
alter table public.streaks        enable row level security;
alter table public.catalog_items  enable row level security;
alter table public.inventory      enable row level security;
alter table public.room_layout    enable row level security;

-- Subjects are plain user data: the client owns them outright.
drop policy if exists subjects_all_own on public.subjects;
create policy subjects_all_own on public.subjects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Read-only for everything the economy writes.
drop policy if exists sessions_select_own on public.study_sessions;
create policy sessions_select_own on public.study_sessions
  for select using (auth.uid() = user_id);

drop policy if exists wallet_select_own on public.wallet;
create policy wallet_select_own on public.wallet
  for select using (auth.uid() = user_id);

drop policy if exists transactions_select_own on public.transactions;
create policy transactions_select_own on public.transactions
  for select using (auth.uid() = user_id);

drop policy if exists streaks_select_own on public.streaks;
create policy streaks_select_own on public.streaks
  for select using (auth.uid() = user_id);

drop policy if exists inventory_select_own on public.inventory;
create policy inventory_select_own on public.inventory
  for select using (auth.uid() = user_id);

-- The catalog is a public price list.
drop policy if exists catalog_select_all on public.catalog_items;
create policy catalog_select_all on public.catalog_items
  for select to anon, authenticated using (true);

-- Room layout is the one place the client writes directly: arranging furniture
-- creates no value, and optimistic UI there is worth the round trips it saves.
-- It still may only place items the user actually owns.
drop policy if exists room_select_own on public.room_layout;
create policy room_select_own on public.room_layout
  for select using (auth.uid() = user_id);

drop policy if exists room_insert_own on public.room_layout;
create policy room_insert_own on public.room_layout
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.inventory i
      where i.user_id = auth.uid() and i.item_id = room_layout.item_id
    )
  );

drop policy if exists room_update_own on public.room_layout;
create policy room_update_own on public.room_layout
  for update using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.inventory i
      where i.user_id = auth.uid() and i.item_id = room_layout.item_id
    )
  );

drop policy if exists room_delete_own on public.room_layout;
create policy room_delete_own on public.room_layout
  for delete using (auth.uid() = user_id);

-- Belt and braces: revoke the table-level grants PostgREST would otherwise
-- expose, so a future policy mistake cannot quietly open a write path.
revoke insert, update, delete on public.wallet         from anon, authenticated;
revoke insert, update, delete on public.transactions   from anon, authenticated;
revoke insert, update, delete on public.streaks        from anon, authenticated;
revoke insert, update, delete on public.study_sessions from anon, authenticated;
revoke insert, update, delete on public.inventory      from anon, authenticated;
revoke insert, update, delete on public.catalog_items  from anon, authenticated;
