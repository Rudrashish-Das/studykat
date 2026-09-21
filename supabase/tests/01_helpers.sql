-- 01_helpers.sql
-- Runs after the migrations, because these reference the tables they create.
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

grant usage on schema tst to anon, authenticated;
grant execute on all functions in schema tst to anon, authenticated;
