-- 0003_economy_functions.sql
-- All economy logic. These run as SECURITY DEFINER because the tables they
-- write have no write policy at all — this file is the only way coins, streaks
-- and inventory can change.
--
-- Two rules every function here keeps:
--   1. Duration is measured from the database clock. Whatever the client says
--      is stored in `client_reported_seconds` for auditing and never read back
--      into a calculation.
--   2. "Day" means a day in the user's stored IANA timezone, never UTC and
--      never the browser's guess at read time.

-- ---------------------------------------------------------------- helpers --

create or replace function public.local_day(ts timestamptz, tz text)
returns date
language sql
stable
as $$
  select (ts at time zone tz)::date;
$$;

comment on function public.local_day is
  'The calendar day `ts` falls on for someone living in `tz`.';

-- Seconds spent paused, with an open-ended pause closed at `p_now`.
create or replace function public.paused_seconds(p_pauses jsonb, p_now timestamptz)
returns int
language sql
immutable
as $$
  select coalesce(
    sum(
      greatest(
        0,
        extract(epoch from (
          coalesce((p ->> 'until')::timestamptz, p_now) - (p ->> 'at')::timestamptz
        ))
      )
    )::int,
    0
  )
  from jsonb_array_elements(p_pauses) as p;
$$;

-- ----------------------------------------------------------- coin formula --

-- The whole economy, in one place, so it can be tuned without hunting.
--
--   base        = floor(focused_minutes)                    1 coin per minute
--   tier_bonus  = 25% of base for the portion beyond 25 min, counting at most
--                 the first 90 minutes of the session
--   streak_mult = 1 + min(current_streak, 30) * 0.02        up to 1.6x
--   capped      = min(round((base + tier_bonus) * streak_mult), remaining_cap)
--   goal_bonus  = +30, added after the cap, once on the day the goal is met
--
-- Sessions under 5 minutes earn nothing. Callers pass the streak value that
-- will stand for today (i.e. after any advancement this session triggers), so
-- every session on a given day uses the same multiplier.
create or replace function public.compute_coins(
  p_focused_seconds int,
  p_current_streak  int,
  p_coins_today     int,
  p_goal_bonus      boolean
)
returns table (
  base            int,
  tier_bonus      numeric,
  streak_mult     numeric,
  gross           int,
  capped          int,
  goal_bonus      int,
  total           int,
  daily_cap_hit   boolean
)
language plpgsql
immutable
as $$
declare
  v_min_seconds  constant int     := 300;   -- under 5 minutes earns nothing
  v_tier_start   constant int     := 25;    -- bonus applies beyond this minute
  v_tier_end     constant int     := 90;    -- and stops counting here
  v_tier_rate    constant numeric := 0.25;
  v_daily_cap    constant int     := 400;
  v_goal_bonus   constant int     := 30;
  v_streak_cap   constant int     := 30;
  v_streak_step  constant numeric := 0.02;

  v_bonus_minutes int;
  v_remaining     int;
begin
  base          := 0;
  tier_bonus    := 0;
  streak_mult   := 1 + least(greatest(p_current_streak, 0), v_streak_cap) * v_streak_step;
  gross         := 0;
  capped        := 0;
  goal_bonus    := 0;
  total         := 0;
  daily_cap_hit := false;

  if p_focused_seconds < v_min_seconds then
    return next;
    return;
  end if;

  base            := floor(p_focused_seconds / 60.0)::int;
  v_bonus_minutes := greatest(0, least(base, v_tier_end) - v_tier_start);
  tier_bonus      := v_bonus_minutes * v_tier_rate;

  gross     := round((base + tier_bonus) * streak_mult)::int;
  v_remaining := greatest(0, v_daily_cap - greatest(p_coins_today, 0));
  capped      := least(gross, v_remaining);
  daily_cap_hit := capped < gross;

  if p_goal_bonus then
    goal_bonus := v_goal_bonus;
  end if;

  total := capped + goal_bonus;
  return next;
end;
$$;

-- The minutes that make a day "count" for the streak: max(15, half the goal).
create or replace function public.streak_threshold_minutes(p_daily_goal int)
returns int
language sql
immutable
as $$
  select greatest(15, ceil(p_daily_goal / 2.0)::int);
$$;

-- ------------------------------------------------------- per-day rollups --

-- Credited seconds for one local day. A session counts once it is completed
-- and cleared the 5-minute floor.
create or replace function public.credited_seconds_on(p_user uuid, p_tz text, p_day date)
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(sum(s.awarded_seconds), 0)::int
  from public.study_sessions s
  where s.user_id = p_user
    and s.status = 'completed'
    and s.awarded_seconds >= 300
    and public.local_day(s.ended_at, p_tz) = p_day;
$$;

create or replace function public.session_coins_on(p_user uuid, p_tz text, p_day date)
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(sum(t.delta), 0)::int
  from public.transactions t
  where t.user_id = p_user
    and t.reason = 'session'
    and public.local_day(t.created_at, p_tz) = p_day;
$$;

-- `milestone` is reserved for the once-a-day goal bonus.
create or replace function public.goal_bonus_paid_on(p_user uuid, p_tz text, p_day date)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.transactions t
    where t.user_id = p_user
      and t.reason = 'milestone'
      and public.local_day(t.created_at, p_tz) = p_day
  );
$$;

-- --------------------------------------------------------- start_session --

create or replace function public.start_session(
  p_subject_id uuid default null,
  p_label      text default null
)
returns public.study_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_row  public.study_sessions;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- A session left running overnight is not eight hours of studying. Retire it
  -- rather than letting it block a new one or pay out later.
  update public.study_sessions
     set status = 'abandoned',
         ended_at = coalesce(ended_at, now())
   where user_id = v_user
     and status = 'active'
     and started_at < now() - interval '8 hours';

  -- Restarting while a fresh session is live is a no-op, not an error: it is
  -- almost always a second tab, and returning the live row is what the client
  -- wants anyway.
  select * into v_row
    from public.study_sessions
   where user_id = v_user and status = 'active'
   limit 1;

  if found then
    return v_row;
  end if;

  if p_subject_id is not null and not exists (
    select 1 from public.subjects where id = p_subject_id and user_id = v_user
  ) then
    raise exception 'unknown subject' using errcode = '23503';
  end if;

  insert into public.study_sessions (user_id, subject_id, started_at, label)
  values (v_user, p_subject_id, now(), nullif(trim(coalesce(p_label, '')), ''))
  returning * into v_row;

  return v_row;
end;
$$;

-- ---------------------------------------------------- pause / resume ------

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

  update public.study_sessions
     set pauses = v_row.pauses || jsonb_build_array(
       jsonb_build_object('at', to_jsonb(now()), 'until', null)
     )
   where id = p_session_id
   returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.resume_session(p_session_id uuid)
returns public.study_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_row  public.study_sessions;
  v_last int;
begin
  select * into v_row from public.study_sessions
   where id = p_session_id and user_id = v_user and status = 'active'
   for update;

  if not found then
    raise exception 'no active session' using errcode = 'P0002';
  end if;

  v_last := jsonb_array_length(v_row.pauses) - 1;
  if v_last < 0 or (v_row.pauses -> v_last ->> 'until') is not null then
    return v_row; -- not paused
  end if;

  update public.study_sessions
     set pauses = jsonb_set(
       v_row.pauses,
       array[v_last::text, 'until'],
       to_jsonb(now())
     )
   where id = p_session_id
   returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.abandon_session(p_session_id uuid)
returns public.study_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.study_sessions;
begin
  update public.study_sessions
     set status = 'abandoned', ended_at = now()
   where id = p_session_id and user_id = auth.uid() and status = 'active'
   returning * into v_row;

  if not found then
    raise exception 'no active session' using errcode = 'P0002';
  end if;
  return v_row;
end;
$$;

-- ------------------------------------------------------------ end_session --

create or replace function public.end_session(
  p_session_id     uuid,
  p_client_seconds int default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user             uuid := auth.uid();
  v_now              timestamptz := now();
  v_max_seconds      constant int := 180 * 60;  -- clamp a runaway session
  v_min_seconds      constant int := 300;

  v_session          public.study_sessions;
  v_profile          public.profiles;
  v_streak           public.streaks;

  v_elapsed          int;
  v_paused           int;
  v_focused          int;
  v_today            date;
  v_threshold        int;
  v_seconds_today    int;
  v_minutes_today    int;
  v_coins_today      int;
  v_goal_met_before  boolean;
  v_goal_met_after   boolean;
  v_pay_goal_bonus   boolean := false;

  v_streak_before    int;
  v_streak_after     int;
  v_streak_advanced  boolean := false;
  v_freeze_used      boolean := false;
  v_gap              int;
  v_new_grants       int;

  v_award            record;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_session from public.study_sessions
   where id = p_session_id and user_id = v_user
   for update;

  if not found then
    raise exception 'session not found' using errcode = 'P0002';
  end if;

  -- Ending an already-ended session must not pay twice.
  if v_session.status <> 'active' then
    return jsonb_build_object(
      'session_id', v_session.id,
      'focused_seconds', v_session.awarded_seconds,
      'credited', v_session.awarded_seconds >= v_min_seconds,
      'coins_awarded', v_session.coins_awarded,
      'base_coins', 0, 'tier_bonus', 0, 'streak_multiplier', 1,
      'goal_bonus', 0, 'daily_cap_hit', false,
      'already_ended', true
    );
  end if;

  select * into v_profile from public.profiles where id = v_user;
  select * into v_streak  from public.streaks  where user_id = v_user for update;

  -- 1. Duration, measured here. `p_client_seconds` is only ever stored.
  v_elapsed := greatest(0, extract(epoch from (v_now - v_session.started_at))::int);
  v_paused  := public.paused_seconds(v_session.pauses, v_now);
  v_focused := least(greatest(0, v_elapsed - v_paused), v_max_seconds);

  v_today     := public.local_day(v_now, v_profile.timezone);
  v_threshold := public.streak_threshold_minutes(v_profile.daily_goal_minutes);

  -- 2. Close the session first, so the rollups below include it.
  update public.study_sessions
     set status = 'completed',
         ended_at = v_now,
         awarded_seconds = case when v_focused >= v_min_seconds then v_focused else 0 end,
         client_reported_seconds = p_client_seconds
   where id = v_session.id
   returning * into v_session;

  v_seconds_today := public.credited_seconds_on(v_user, v_profile.timezone, v_today);
  v_minutes_today := floor(v_seconds_today / 60.0)::int;
  v_coins_today   := public.session_coins_on(v_user, v_profile.timezone, v_today);

  -- 3. Streak, before coins — so every session on a day uses one multiplier.
  v_streak_before := v_streak.current_streak;
  v_streak_after  := v_streak.current_streak;

  if v_minutes_today >= v_threshold and v_streak.last_credited_day is distinct from v_today then
    if v_streak.last_credited_day is null then
      v_streak_after := 1;
    else
      v_gap := v_today - v_streak.last_credited_day;
      if v_gap = 1 then
        v_streak_after := v_streak.current_streak + 1;
      elsif v_gap = 2 and v_streak.freeze_tokens > 0 then
        -- A freeze token covers exactly one missed day.
        v_streak_after := v_streak.current_streak + 1;
        v_freeze_used  := true;
      else
        v_streak_after := 1;
      end if;
    end if;

    v_streak_advanced := true;
    v_new_grants := floor(v_streak_after / 7.0)::int;

    update public.streaks
       set current_streak    = v_streak_after,
           longest_streak    = greatest(longest_streak, v_streak_after),
           last_credited_day = v_today,
           freeze_tokens     = least(
             2,
             greatest(0, freeze_tokens - (case when v_freeze_used then 1 else 0 end))
               + greatest(0, v_new_grants - freeze_grants)
           ),
           freeze_grants     = v_new_grants
     where user_id = v_user
     returning * into v_streak;
  end if;

  -- 4. Goal bonus: once, on the day the goal is first met.
  v_goal_met_after  := v_minutes_today >= v_profile.daily_goal_minutes;
  v_goal_met_before := public.goal_bonus_paid_on(v_user, v_profile.timezone, v_today);
  v_pay_goal_bonus  := v_goal_met_after and not v_goal_met_before;

  -- 5. Coins.
  select * into v_award from public.compute_coins(
    v_focused,
    v_streak_after,
    v_coins_today,
    v_pay_goal_bonus
  );

  if v_award.capped > 0 then
    insert into public.transactions (user_id, delta, reason, ref_id)
    values (v_user, v_award.capped, 'session', v_session.id);
  end if;

  if v_award.goal_bonus > 0 then
    insert into public.transactions (user_id, delta, reason, ref_id)
    values (v_user, v_award.goal_bonus, 'milestone', v_session.id);
  end if;

  if v_award.total > 0 then
    update public.wallet
       set coins = coins + v_award.total,
           lifetime_coins = lifetime_coins + v_award.total,
           updated_at = v_now
     where user_id = v_user;

    update public.study_sessions
       set coins_awarded = v_award.total
     where id = v_session.id;
  end if;

  return jsonb_build_object(
    'session_id',        v_session.id,
    'focused_seconds',   v_focused,
    'credited',          v_focused >= v_min_seconds,
    'coins_awarded',     v_award.total,
    'base_coins',        v_award.base,
    'tier_bonus',        v_award.tier_bonus,
    'streak_multiplier', v_award.streak_mult,
    'goal_bonus',        v_award.goal_bonus,
    'daily_cap_hit',     v_award.daily_cap_hit,
    'current_streak',    v_streak.current_streak,
    'previous_streak',   v_streak_before,
    'streak_advanced',   v_streak_advanced,
    'freeze_used',       v_freeze_used,
    'goal_met',          v_goal_met_after,
    'minutes_today',     v_minutes_today,
    'already_ended',     false
  );
end;
$$;

-- ------------------------------------------------------------- get_today --

-- Everything the HUD needs, computed in the user's timezone, in one round trip.
create or replace function public.get_today()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user    uuid := auth.uid();
  v_profile public.profiles;
  v_streak  public.streaks;
  v_wallet  public.wallet;
  v_today   date;
  v_seconds int;
  v_minutes int;
  v_lifetime bigint;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_profile from public.profiles where id = v_user;
  select * into v_streak  from public.streaks  where user_id = v_user;
  select * into v_wallet  from public.wallet   where user_id = v_user;

  v_today   := public.local_day(now(), v_profile.timezone);
  v_seconds := public.credited_seconds_on(v_user, v_profile.timezone, v_today);
  v_minutes := floor(v_seconds / 60.0)::int;

  select coalesce(sum(awarded_seconds), 0) into v_lifetime
    from public.study_sessions
   where user_id = v_user and status = 'completed';

  return jsonb_build_object(
    -- The client anchors its timer to this rather than trusting the device
    -- clock, which can be minutes off.
    'server_now',                    now(),
    'local_day',                     v_today,
    'minutes_today',                 v_minutes,
    'daily_goal_minutes',            v_profile.daily_goal_minutes,
    'goal_met',                      v_minutes >= v_profile.daily_goal_minutes,
    'streak_day_threshold_minutes',  public.streak_threshold_minutes(v_profile.daily_goal_minutes),
    'streak_day_met',                v_minutes >= public.streak_threshold_minutes(v_profile.daily_goal_minutes),
    'coins_from_sessions_today',     public.session_coins_on(v_user, v_profile.timezone, v_today),
    'current_streak',                v_streak.current_streak,
    'longest_streak',                v_streak.longest_streak,
    'freeze_tokens',                 v_streak.freeze_tokens,
    'coins',                         v_wallet.coins,
    'lifetime_coins',                v_wallet.lifetime_coins,
    'lifetime_seconds',              v_lifetime
  );
end;
$$;

-- --------------------------------------------------------- purchase_item --

create or replace function public.purchase_item(p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user     uuid := auth.uid();
  v_item     public.catalog_items;
  v_wallet   public.wallet;
  v_streak   public.streaks;
  v_lifetime_seconds bigint;
  v_rule     jsonb;
  v_ok       boolean := true;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_item from public.catalog_items where id = p_item_id;
  if not found then
    raise exception 'unknown item' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.inventory where user_id = v_user and item_id = p_item_id) then
    raise exception 'already owned' using errcode = '23505';
  end if;

  -- Lock the wallet row for the whole check-and-debit.
  select * into v_wallet from public.wallet where user_id = v_user for update;
  select * into v_streak from public.streaks where user_id = v_user;

  v_rule := v_item.unlock_rule;
  if v_rule is not null then
    select coalesce(sum(awarded_seconds), 0) into v_lifetime_seconds
      from public.study_sessions where user_id = v_user and status = 'completed';

    v_ok := case v_rule ->> 'kind'
      when 'streak'         then greatest(v_streak.current_streak, v_streak.longest_streak)
                                   >= (v_rule ->> 'days')::int
      when 'lifetime_hours' then v_lifetime_seconds >= (v_rule ->> 'hours')::numeric * 3600
      when 'lifetime_coins' then v_wallet.lifetime_coins >= (v_rule ->> 'coins')::bigint
      else true
    end;

    if not v_ok then
      raise exception 'item is still locked' using errcode = '42501';
    end if;
  end if;

  if v_wallet.coins < v_item.price then
    raise exception 'not enough coins' using errcode = '23514';
  end if;

  update public.wallet
     set coins = coins - v_item.price, updated_at = now()
   where user_id = v_user;

  insert into public.inventory (user_id, item_id) values (v_user, p_item_id);

  insert into public.transactions (user_id, delta, reason, ref_id)
  values (v_user, -v_item.price, 'purchase', p_item_id);

  return jsonb_build_object(
    'item_id', p_item_id,
    'spent', v_item.price,
    'coins', v_wallet.coins - v_item.price
  );
end;
$$;

-- ------------------------------------------------------------ delete_me ---

-- Settings offers account deletion; deleting the auth user cascades everything.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, pg_temp, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

-- ------------------------------------------------------------- privileges --

-- SECURITY DEFINER plus a public schema means EXECUTE has to be deliberate.
revoke all on function public.start_session(uuid, text)        from public, anon;
revoke all on function public.end_session(uuid, int)           from public, anon;
revoke all on function public.pause_session(uuid)              from public, anon;
revoke all on function public.resume_session(uuid)             from public, anon;
revoke all on function public.abandon_session(uuid)            from public, anon;
revoke all on function public.purchase_item(uuid)              from public, anon;
revoke all on function public.get_today()                      from public, anon;
revoke all on function public.delete_my_account()              from public, anon;

grant execute on function public.start_session(uuid, text)     to authenticated;
grant execute on function public.end_session(uuid, int)        to authenticated;
grant execute on function public.pause_session(uuid)           to authenticated;
grant execute on function public.resume_session(uuid)          to authenticated;
grant execute on function public.abandon_session(uuid)         to authenticated;
grant execute on function public.purchase_item(uuid)           to authenticated;
grant execute on function public.get_today()                   to authenticated;
grant execute on function public.delete_my_account()           to authenticated;
