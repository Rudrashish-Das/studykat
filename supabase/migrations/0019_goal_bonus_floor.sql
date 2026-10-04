-- 0019_goal_bonus_floor.sql
-- The daily goal is the user's to set, down to 5 minutes, and the 30-coin goal
-- bonus was paid the moment it was met — so a 5-minute goal paid 30 coins for
-- 5 minutes' study, six times the rate of studying itself. The goal still
-- counts as met at whatever the user chose; the *bonus* now also needs a
-- 30-minute day, so it can never pay more than the study did. See SECURITY.md,
-- third pass, finding 15.
--
-- Mirrored by `goalBonusThresholdMinutes` in src/lib/economy/coins.ts.

create or replace function public.goal_bonus_threshold_minutes(p_daily_goal int)
returns int
language sql
immutable
set search_path = public, pg_temp
as $$
  select greatest(30, p_daily_goal);
$$;

revoke all on function public.goal_bonus_threshold_minutes(int) from public, anon;
grant execute on function public.goal_bonus_threshold_minutes(int) to authenticated;

-- The payout, as 0003 wrote it (renamed by 0017), with only step 4 changed.
create or replace function public.end_session_settled(
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

  -- 4. Goal bonus: once a day, when the goal is met and at least 30 minutes are in.
  v_goal_met_after  := v_minutes_today >= v_profile.daily_goal_minutes;
  v_goal_met_before := public.goal_bonus_paid_on(v_user, v_profile.timezone, v_today);
  v_pay_goal_bonus  := v_goal_met_after
                       and v_minutes_today >= public.goal_bonus_threshold_minutes(v_profile.daily_goal_minutes)
                       and not v_goal_met_before;

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

revoke all on function public.end_session_settled(uuid, int) from public, anon, authenticated;
