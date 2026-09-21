-- 01_helpers.sql
-- Runs after the migrations, because these reference the tables they create.
--
-- !! NEVER INSTALL THIS ON A DATABASE WITH REAL ACCOUNTS !!
--
-- These fixtures are SECURITY DEFINER and must be callable by the
-- `authenticated` role, because the tests run as that role in order to prove
-- what RLS blocks. That means that while they are installed, ANY SIGNED-IN
-- USER CAN CALL tst.set_coins() AND MINT THEMSELVES UNLIMITED CURRENCY.
--
-- They are for a throwaway Postgres container or a scratch Supabase project
-- only. The guard below makes the file fail closed if someone pastes it into
-- the SQL editor of a live project: it refuses to install unless the session
-- has explicitly opted in *and* the database has almost no accounts in it.
--
-- Tear them down when you are finished:   drop schema tst cascade;

do $$
declare v_users int;
begin
  if coalesce(current_setting('studykat.i_know_this_is_a_test_database', true), '') <> 'yes' then
    raise exception using
      errcode = 'insufficient_privilege',
      message = 'refusing to install test fixtures',
      detail  = 'These helpers let any signed-in user mint coins while installed.',
      hint    = 'If this really is a throwaway database, run: '
                || 'set studykat.i_know_this_is_a_test_database = ''yes'';';
  end if;

  select count(*) into v_users from auth.users;
  if v_users > 5 then
    raise exception using
      errcode = 'insufficient_privilege',
      message = format('refusing to install test fixtures: %s accounts exist', v_users),
      hint    = 'This looks like a real database. Use a scratch project instead.';
  end if;
end $$;

-- --------------------------------------------------------- test helpers --
-- Once a test switches to the `authenticated` role it loses the ability to set
-- up its own fixtures — which is exactly the guarantee under test. These
-- helpers are owned by the superuser and marked SECURITY DEFINER so a test can
-- still arrange the world without weakening what it is asserting.

create schema if not exists tst;

create or replace function tst.become(p_user uuid)
returns void
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text,
    true
  );
  perform set_config('role', 'authenticated', true);
end;
$$;

create or replace function tst.as_superuser()
returns void
language plpgsql
as $$
begin
  perform set_config('role', 'postgres', true);
end;
$$;

create or replace function tst.backdate_session(p_id uuid, p_interval interval)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.study_sessions set started_at = now() - p_interval where id = p_id;
$$;

create or replace function tst.set_streak(
  p_user uuid,
  p_current int,
  p_last date,
  p_tokens int default 0,
  p_grants int default 0
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.streaks
     set current_streak = p_current,
         last_credited_day = p_last,
         freeze_tokens = p_tokens,
         freeze_grants = p_grants
   where user_id = p_user;
$$;

create or replace function tst.set_coins(p_user uuid, p_coins bigint)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.wallet set coins = p_coins where user_id = p_user;
$$;

create or replace function tst.clear_sessions(p_user uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.transactions where user_id = p_user;
  delete from public.study_sessions where user_id = p_user;
$$;

create or replace function tst.set_timezone(p_user uuid, p_tz text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.profiles set timezone = p_tz where id = p_user;
$$;

create or replace function tst.coins_of(p_user uuid)
returns bigint
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select coins from public.wallet where user_id = p_user;
$$;

create or replace function tst.streak_of(p_user uuid)
returns public.streaks
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select * from public.streaks where user_id = p_user;
$$;

-- `authenticated` only, and only because the tests run as that role.
grant usage on schema tst to authenticated;
grant execute on all functions in schema tst to authenticated;
