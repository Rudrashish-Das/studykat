-- 0007_hardening.sql
-- Fixes found during the security audit. See SECURITY.md for the write-up.
--
-- Nothing here changes behaviour for a well-behaved client; it closes paths a
-- hostile one could take with the public anon key.

-- ===================================================================== 1 ===
-- Cross-user disclosure: three SECURITY DEFINER helpers take an arbitrary
-- `p_user uuid`, and Supabase grants EXECUTE on public functions to
-- `authenticated` by default. Any signed-in user could therefore call
--
--   select credited_seconds_on('<someone-else>', 'UTC', '2026-09-21');
--
-- over PostgREST and read another account's study time, coin total, or goal
-- status. They are internals of end_session and get_today, so nobody outside
-- the database should be able to call them at all.

revoke all on function public.credited_seconds_on(uuid, text, date) from public, anon, authenticated;
revoke all on function public.session_coins_on(uuid, text, date)    from public, anon, authenticated;
revoke all on function public.goal_bonus_paid_on(uuid, text, date)  from public, anon, authenticated;

-- ===================================================================== 2 ===
-- `handle_new_user` is SECURITY DEFINER but pinned only `search_path = public`.
-- When pg_temp is not named explicitly it is searched *first*, so a user who
-- can create temporary objects could shadow a name the function resolves and
-- have it run their code as the definer (the CVE-2018-1058 shape). Name
-- pg_temp last so it is searched last.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  )
  on conflict (id) do nothing;

  insert into public.wallet (user_id) values (new.id) on conflict (user_id) do nothing;
  insert into public.streaks (user_id) values (new.id) on conflict (user_id) do nothing;

  return new;
end;
$$;

-- Same ordering fix for the one function that reaches into `auth`.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

-- ===================================================================== 3 ===
-- Pin a search_path on the remaining functions. These are not SECURITY
-- DEFINER, so the risk is lower, but a mutable search_path on a function that
-- a definer-context trigger invokes is exactly the kind of thing that becomes
-- a problem later. (Supabase's own linter flags these as
-- `function_search_path_mutable`.)

alter function public.generate_cat_seed()              set search_path = public, pg_temp;
alter function public.is_valid_timezone(text)          set search_path = public, pg_temp;
alter function public.touch_updated_at()               set search_path = public, pg_temp;
alter function public.guard_profile_writes()           set search_path = public, pg_temp;
alter function public.local_day(timestamptz, text)     set search_path = public, pg_temp;
alter function public.paused_seconds(jsonb, timestamptz) set search_path = public, pg_temp;
alter function public.compute_coins(int, int, int, boolean) set search_path = public, pg_temp;
alter function public.streak_threshold_minutes(int)    set search_path = public, pg_temp;

-- ===================================================================== 4 ===
-- Defence in depth: nothing below is dangerous on its own, but none of it is
-- part of the client's API either, so it should not be reachable over
-- PostgREST. `handle_new_user` in particular is a trigger function that has no
-- business being RPC-callable.

revoke all on function public.handle_new_user()        from public, anon, authenticated;
revoke all on function public.touch_updated_at()       from public, anon, authenticated;
revoke all on function public.guard_profile_writes()   from public, anon, authenticated;
revoke all on function public.generate_cat_seed()      from public, anon, authenticated;

-- Deliberately NOT revoked: `compute_coins`, `paused_seconds`, `local_day`,
-- `is_valid_timezone` and `streak_threshold_minutes`. They are pure functions
-- over no user data, they leak nothing, and being able to ask the database
-- what it thinks your local day is — or to check its arithmetic against the
-- client's mirror of the coin rules — is worth more than the hypothetical
-- tidiness of hiding them.

-- ===================================================================== 5 ===
-- Changing timezone moves the boundary that the daily coin cap and the streak
-- are bucketed by, so repeatedly switching it could reset a capped day or
-- credit the same stretch of study to two different days. Rate-limit it.
--
-- This does not make the boundary tamper-proof — it bounds the abuse to one
-- shift per day, which for a single-player app where the only person cheated
-- is yourself is the right trade against making travel annoying.

alter table public.profiles
  add column if not exists timezone_changed_at timestamptz;

create or replace function public.guard_profile_writes()
returns trigger
language plpgsql
set search_path = public, pg_temp
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

    if new.timezone is distinct from old.timezone then
      if old.timezone_changed_at is not null
         and old.timezone_changed_at > now() - interval '24 hours' then
        raise exception 'timezone can only be changed once a day'
          using errcode = 'check_violation';
      end if;
      new.timezone_changed_at := now();
    else
      new.timezone_changed_at := old.timezone_changed_at;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_profile_writes() from public, anon, authenticated;

-- ===================================================================== 6 ===
-- `room_layout` is the one table the client writes directly. The policy checks
-- ownership but nothing stopped a client inserting the same owned item a
-- thousand times, which is both a gameplay integrity hole (one sofa, ten in
-- the room) and unbounded growth on a free-tier database.

-- Collapse any duplicates that already exist, keeping the earliest row.
delete from public.room_layout a
 using public.room_layout b
 where a.user_id = b.user_id
   and a.item_id = b.item_id
   and a.ctid > b.ctid;

create unique index if not exists room_layout_one_per_item
  on public.room_layout (user_id, item_id);

-- And a hard ceiling, well above a full 10x10 room.
create or replace function public.guard_room_layout_size()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if (select count(*) from public.room_layout where user_id = new.user_id) >= 200 then
    raise exception 'too many items placed' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists room_layout_guard_size on public.room_layout;
create trigger room_layout_guard_size
  before insert on public.room_layout
  for each row execute function public.guard_room_layout_size();

revoke all on function public.guard_room_layout_size() from public, anon, authenticated;

-- ===================================================================== 7 ===
-- Pausing appends an interval to a jsonb array. The client cannot write that
-- column directly, but it can call pause/resume in a loop, and each pair adds
-- an object. Cap it so a session's row cannot be grown without bound.

create or replace function public.pause_session(p_session_id uuid)
returns public.study_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_row  public.study_sessions;
begin
  select * into v_row from public.study_sessions
   where id = p_session_id and user_id = v_user and status = 'active'
   for update;

  if not found then
    raise exception 'no active session' using errcode = 'P0002';
  end if;

  -- Already paused? Leave the existing open interval alone.
  if jsonb_array_length(v_row.pauses) > 0
     and (v_row.pauses -> (jsonb_array_length(v_row.pauses) - 1) ->> 'until') is null then
    return v_row;
  end if;

  if jsonb_array_length(v_row.pauses) >= 100 then
    raise exception 'too many pauses in one session' using errcode = 'check_violation';
  end if;

  update public.study_sessions
     set pauses = v_row.pauses || jsonb_build_array(
       jsonb_build_object('at', to_jsonb(now()), 'until', null)
     )
   where id = p_session_id
   returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.pause_session(uuid) from public, anon;
grant execute on function public.pause_session(uuid) to authenticated;
