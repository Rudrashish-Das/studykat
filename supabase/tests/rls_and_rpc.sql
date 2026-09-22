-- rls_and_rpc.sql
-- Assertions for the security model and the economy. Any failure aborts.
--
--   docker compose -f supabase/tests/docker-compose.yml up -d
--   ./supabase/tests/run.sh
--
-- Everything runs inside one transaction and rolls back at the end, so it is
-- safe to run repeatedly — including against a scratch Supabase project.

begin;

-- ------------------------------------------------------------- fixtures --

-- Two users, so cross-user isolation is testable. User A lives in
-- Pacific/Kiritimati (UTC+14) on purpose: for most of the UTC day it is already
-- tomorrow there, so anything that computes "today" in UTC gets it wrong.
insert into auth.users (id, aud, role, email, email_confirmed_at)
values
  ('11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'a@example.test', now()),
  ('22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'b@example.test', now());

do $$
begin
  assert (select count(*) from public.profiles) = 2, 'profiles not created by the signup trigger';
  assert (select count(*) from public.wallet)   = 2, 'wallet not created by the signup trigger';
  assert (select count(*) from public.streaks)  = 2, 'streaks not created by the signup trigger';
  assert (select count(distinct cat_seed) from public.profiles) = 2,
    'two users were given the same cat seed';
  assert (select bool_and(char_length(cat_seed) = 16) from public.profiles),
    'cat seeds are the wrong length';
end $$;

select tst.set_timezone('11111111-1111-1111-1111-111111111111', 'Pacific/Kiritimati');

-- Onboard user A, which also grants the free starter items.
select tst.become('11111111-1111-1111-1111-111111111111');
select public.complete_onboarding('Mochi', 1, 60, 'Pacific/Kiritimati');

do $$
begin
  assert (select onboarded_at is not null from public.profiles
           where id = '11111111-1111-1111-1111-111111111111'),
    'complete_onboarding did not mark the profile onboarded';
  assert (select count(*) from public.inventory) >= 3,
    'starter items were not granted';
  assert (select count(*) from public.room_layout) = 2,
    'the free floor and walls were not placed';
end $$;

-- ================================================================ RLS ====
-- The headline guarantee: a client holding the public anon key cannot mint
-- currency, forge a session, or grant itself an item.

do $$
declare v_blocked boolean := false;
begin
  begin
    update public.wallet set coins = coins + 1000000
     where user_id = '11111111-1111-1111-1111-111111111111';
    -- An RLS-filtered UPDATE with no matching policy affects zero rows instead
    -- of raising, so treat either outcome as blocked but insist the balance
    -- did not move.
    v_blocked := true;
  exception when insufficient_privilege then v_blocked := true;
  end;
  assert v_blocked, 'the client could write to wallet directly';
  assert tst.coins_of('11111111-1111-1111-1111-111111111111') = 0,
    'the wallet balance changed from a direct client write';
end $$;

do $$
declare v_blocked boolean := false;
begin
  begin
    insert into public.transactions (user_id, delta, reason)
    values ('11111111-1111-1111-1111-111111111111', 9999, 'session');
  exception when insufficient_privilege then v_blocked := true;
  end;
  assert v_blocked, 'the client could forge a transaction';
end $$;

do $$
declare v_blocked boolean := false;
begin
  begin
    update public.streaks set current_streak = 365, longest_streak = 365
     where user_id = '11111111-1111-1111-1111-111111111111';
    v_blocked := true;
  exception when insufficient_privilege then v_blocked := true;
  end;
  assert v_blocked, 'the client could write its own streak';
  assert (tst.streak_of('11111111-1111-1111-1111-111111111111')).current_streak = 0,
    'the streak changed from a direct client write';
end $$;

do $$
declare v_blocked boolean := false;
begin
  begin
    insert into public.inventory (user_id, item_id)
    select '11111111-1111-1111-1111-111111111111', id
      from public.catalog_items where slug = 'piano';
  exception when insufficient_privilege then v_blocked := true;
  end;
  assert v_blocked, 'the client could grant itself an item';
end $$;

do $$
declare v_blocked boolean := false;
begin
  begin
    insert into public.study_sessions (user_id, started_at, awarded_seconds, status)
    values ('11111111-1111-1111-1111-111111111111', now(), 99999, 'completed');
  exception when insufficient_privilege then v_blocked := true;
  end;
  assert v_blocked, 'the client could forge a completed study session';
end $$;

-- Cross-user isolation.
do $$
begin
  assert (select count(*) from public.profiles) = 1, 'user A can see other profiles';
  assert (select count(*) from public.wallet)   = 1, 'user A can see other wallets';
  assert (select count(*) from public.streaks)  = 1, 'user A can see other streaks';
  -- The catalog is a public price list, so it stays fully visible.
  assert (select count(*) from public.catalog_items) >= 40, 'the catalog is not readable';
end $$;

-- The cat seed must not be rerollable, or "unique to your account" means
-- "unique until you press refresh".
do $$
declare v_blocked boolean := false;
begin
  begin
    update public.profiles set cat_seed = 'aaaaaaaaaaaaaaaa'
     where id = '11111111-1111-1111-1111-111111111111';
  exception when check_violation then v_blocked := true;
  end;
  assert v_blocked, 'the cat seed was rerollable';
end $$;

-- A bogus timezone must be rejected rather than silently bucketing days in UTC.
do $$
declare v_blocked boolean := false;
begin
  begin
    update public.profiles set timezone = 'Mars/Olympus'
     where id = '11111111-1111-1111-1111-111111111111';
  exception when check_violation then v_blocked := true;
  end;
  assert v_blocked, 'an unknown timezone was accepted';
end $$;

-- ======================================================== coin formula ====
-- The same table of cases as src/lib/economy/coins.test.ts.

do $$
declare r record;
begin
  select * into r from public.compute_coins(299, 0, 0, false);
  assert r.total = 0, format('4m59s should pay 0, paid %s', r.total);

  select * into r from public.compute_coins(300, 0, 0, false);
  assert r.total = 5, format('5m should pay 5, paid %s', r.total);

  select * into r from public.compute_coins(750, 0, 0, false);
  assert r.total = 12, format('12m30s should pay 12, paid %s', r.total);

  select * into r from public.compute_coins(25 * 60, 0, 0, false);
  assert r.total = 25, format('25m should pay 25, paid %s', r.total);

  -- 45 + (45-25)*0.25 = 50
  select * into r from public.compute_coins(45 * 60, 0, 0, false);
  assert r.total = 50, format('45m should pay 50, paid %s', r.total);

  -- The bonus stops accruing at minute 90: 90 + 16.25 = 106.25 -> 106
  select * into r from public.compute_coins(90 * 60, 0, 0, false);
  assert r.total = 106, format('90m should pay 106, paid %s', r.total);

  -- 120 + 16.25 = 136.25 -> 136
  select * into r from public.compute_coins(120 * 60, 0, 0, false);
  assert r.total = 136, format('120m should pay 136, paid %s', r.total);

  -- 68.75 x 1.2 = 82.5 -> 83
  select * into r from public.compute_coins(60 * 60, 10, 0, false);
  assert r.total = 83, format('1h at a 10-day streak should pay 83, paid %s', r.total);

  select * into r from public.compute_coins(60 * 60, 30, 0, false);
  assert r.streak_mult = 1.60, format('a 30-day streak should be 1.6x, was %s', r.streak_mult);
  assert r.total = 110, format('1h at a 30-day streak should pay 110, paid %s', r.total);

  select * into r from public.compute_coins(60 * 60, 365, 0, false);
  assert r.streak_mult = 1.60, 'the streak multiplier did not cap at 30 days';

  select * into r from public.compute_coins(60 * 60, 0, 390, false);
  assert r.total = 10, format('the cap should leave 10, paid %s', r.total);
  assert r.daily_cap_hit, 'daily_cap_hit was not reported';

  select * into r from public.compute_coins(60 * 60, 0, 400, false);
  assert r.total = 0, 'the cap should pay nothing once reached';

  -- The goal bonus is added after the cap, so it survives a capped day.
  select * into r from public.compute_coins(60 * 60, 0, 400, true);
  assert r.total = 30, format('the goal bonus should still pay 30, paid %s', r.total);

  -- Thresholds.
  assert public.streak_threshold_minutes(60) = 30, 'a 60m goal should need 30m';
  assert public.streak_threshold_minutes(20) = 15, 'the 15m floor should win for small goals';
  assert public.streak_threshold_minutes(45) = 23, 'a 45m goal should need 23m';
end $$;

-- ===================================================== session lifecycle ==

do $$
declare
  v_session public.study_sessions;
  v_second  public.study_sessions;
  v_result  jsonb;
  v_user    uuid := '11111111-1111-1111-1111-111111111111';
  v_coins   bigint;
begin
  v_session := public.start_session(null, 'Algebra');
  assert v_session.status = 'active', 'the session did not start active';
  assert v_session.label = 'Algebra', 'the session label was not stored';

  -- Only ever one active session.
  v_second := public.start_session(null, null);
  assert v_second.id = v_session.id, 'a second start_session created a second active session';

  -- Backdate it half an hour. end_session must measure that itself and ignore
  -- the absurd number the "client" reports.
  perform tst.backdate_session(v_session.id, interval '30 minutes');
  v_result := public.end_session(v_session.id, 999999);

  assert (v_result ->> 'focused_seconds')::int between 1795 and 1805,
    format('expected about 1800 focused seconds, got %s', v_result ->> 'focused_seconds');
  assert (select client_reported_seconds from public.study_sessions where id = v_session.id) = 999999,
    'client_reported_seconds was not stored for auditing';
  assert (v_result ->> 'coins_awarded')::int > 0, 'a 30-minute session paid nothing';
  assert (v_result ->> 'credited')::boolean, 'a 30-minute session was not credited';

  -- Ending twice must not pay twice.
  v_coins := tst.coins_of(v_user);
  perform public.end_session(v_session.id, 100);
  assert tst.coins_of(v_user) = v_coins, 'ending a session twice paid twice';
end $$;

-- A paused stretch is subtracted from the measured duration.
do $$
declare
  v_session public.study_sessions;
  v_result  jsonb;
begin
  perform tst.clear_sessions('11111111-1111-1111-1111-111111111111');
  v_session := public.start_session(null, null);
  perform tst.backdate_session(v_session.id, interval '40 minutes');
  perform public.pause_session(v_session.id);
  -- Pausing twice in a row must not open a second interval.
  perform public.pause_session(v_session.id);
  perform public.resume_session(v_session.id);
  v_result := public.end_session(v_session.id, null);
  assert (v_result ->> 'focused_seconds')::int between 2380 and 2400,
    format('a brief pause should barely change the total, got %s', v_result ->> 'focused_seconds');
end $$;

-- The 180-minute ceiling.
do $$
declare
  v_session public.study_sessions;
  v_result  jsonb;
begin
  perform tst.clear_sessions('11111111-1111-1111-1111-111111111111');
  v_session := public.start_session(null, null);
  perform tst.backdate_session(v_session.id, interval '7 hours');
  v_result := public.end_session(v_session.id, null);
  assert (v_result ->> 'focused_seconds')::int = 180 * 60,
    format('a runaway session should clamp to 180 minutes, got %s', v_result ->> 'focused_seconds');
end $$;

-- A session left running overnight is retired rather than paid out later.
do $$
declare
  v_old public.study_sessions;
  v_new public.study_sessions;
begin
  perform tst.clear_sessions('11111111-1111-1111-1111-111111111111');
  v_old := public.start_session(null, null);
  perform tst.backdate_session(v_old.id, interval '9 hours');
  v_new := public.start_session(null, null);
  assert v_new.id <> v_old.id, 'a stale session blocked a new one';
  assert (select status from public.study_sessions where id = v_old.id) = 'abandoned',
    'the stale session was not abandoned';
  perform public.abandon_session(v_new.id);
end $$;

-- ================================================== streaks across days ==

do $$
declare
  v_tz    text := 'Pacific/Kiritimati';
  v_user  uuid := '11111111-1111-1111-1111-111111111111';
  v_today date := public.local_day(now(), v_tz);
  v_s     public.study_sessions;
begin
  -- A fresh start: the first credited day is a streak of 1, on the local day.
  perform tst.clear_sessions(v_user);
  perform tst.set_streak(v_user, 0, null, 0, 0);

  v_s := public.start_session(null, null);
  perform tst.backdate_session(v_s.id, interval '40 minutes');
  perform public.end_session(v_s.id, null);

  assert (tst.streak_of(v_user)).current_streak = 1,
    'the first credited day should start a streak of 1';
  assert (tst.streak_of(v_user)).last_credited_day = v_today,
    'the streak was credited to the wrong local day';

  -- Yesterday to today advances, and the seventh day grants a freeze token.
  perform tst.clear_sessions(v_user);
  perform tst.set_streak(v_user, 6, v_today - 1, 0, 0);
  v_s := public.start_session(null, null);
  perform tst.backdate_session(v_s.id, interval '40 minutes');
  perform public.end_session(v_s.id, null);

  assert (tst.streak_of(v_user)).current_streak = 7,
    format('a consecutive day should advance to 7, got %s', (tst.streak_of(v_user)).current_streak);
  assert (tst.streak_of(v_user)).freeze_tokens = 1,
    'a 7-day streak did not grant a freeze token';

  -- A one-day gap with a token in hand: the token covers it.
  perform tst.clear_sessions(v_user);
  perform tst.set_streak(v_user, 7, v_today - 2, 1, 1);
  v_s := public.start_session(null, null);
  perform tst.backdate_session(v_s.id, interval '40 minutes');
  perform public.end_session(v_s.id, null);

  assert (tst.streak_of(v_user)).current_streak = 8,
    'a freeze token did not cover a one-day gap';
  assert (tst.streak_of(v_user)).freeze_tokens = 0, 'the freeze token was not spent';

  -- Two missed days is more than one token can cover.
  perform tst.clear_sessions(v_user);
  perform tst.set_streak(v_user, 8, v_today - 3, 1, 1);
  v_s := public.start_session(null, null);
  perform tst.backdate_session(v_s.id, interval '40 minutes');
  perform public.end_session(v_s.id, null);

  assert (tst.streak_of(v_user)).current_streak = 1,
    'one token stretched over two missed days';
  assert (tst.streak_of(v_user)).freeze_tokens = 1, 'a token was spent on an uncoverable gap';

  -- The record survives a reset.
  assert (tst.streak_of(v_user)).longest_streak >= 8, 'longest_streak was lost on reset';

  -- A second session the same day must not advance the streak again.
  perform tst.clear_sessions(v_user);
  perform tst.set_streak(v_user, 4, v_today, 0, 0);
  v_s := public.start_session(null, null);
  perform tst.backdate_session(v_s.id, interval '40 minutes');
  perform public.end_session(v_s.id, null);
  assert (tst.streak_of(v_user)).current_streak = 4,
    'a second session on the same day advanced the streak again';
end $$;

-- A day below the threshold does not count, and neither does a short session.
do $$
declare
  v_user   uuid := '11111111-1111-1111-1111-111111111111';
  v_s      public.study_sessions;
  v_result jsonb;
begin
  perform tst.clear_sessions(v_user);
  perform tst.set_streak(v_user, 0, null, 0, 0);

  -- Four minutes: below the five-minute floor entirely.
  v_s := public.start_session(null, null);
  perform tst.backdate_session(v_s.id, interval '4 minutes');
  v_result := public.end_session(v_s.id, null);
  assert (v_result ->> 'coins_awarded')::int = 0, 'a 4-minute session paid coins';
  assert not (v_result ->> 'credited')::boolean, 'a 4-minute session was credited';
  assert (tst.streak_of(v_user)).current_streak = 0, 'a 4-minute session credited the day';

  -- Twenty minutes clears the floor but not the 30-minute daily threshold.
  v_s := public.start_session(null, null);
  perform tst.backdate_session(v_s.id, interval '20 minutes');
  v_result := public.end_session(v_s.id, null);
  assert (v_result ->> 'coins_awarded')::int > 0, 'a 20-minute session paid nothing';
  assert (tst.streak_of(v_user)).current_streak = 0,
    'a day below the threshold advanced the streak';
end $$;

-- The goal bonus pays once a day, not once a session.
do $$
declare
  v_user   uuid := '11111111-1111-1111-1111-111111111111';
  v_s      public.study_sessions;
  v_first  jsonb;
  v_second jsonb;
begin
  perform tst.clear_sessions(v_user);
  perform tst.set_streak(v_user, 0, null, 0, 0);

  -- 70 minutes clears the 60-minute goal outright.
  v_s := public.start_session(null, null);
  perform tst.backdate_session(v_s.id, interval '70 minutes');
  v_first := public.end_session(v_s.id, null);
  assert (v_first ->> 'goal_bonus')::int = 30, 'the goal bonus was not paid on meeting the goal';

  v_s := public.start_session(null, null);
  perform tst.backdate_session(v_s.id, interval '30 minutes');
  v_second := public.end_session(v_s.id, null);
  assert (v_second ->> 'goal_bonus')::int = 0, 'the goal bonus was paid twice in one day';
end $$;

-- The daily cap holds across several sessions.
do $$
declare
  v_user uuid := '11111111-1111-1111-1111-111111111111';
  v_s    public.study_sessions;
  i      int;
begin
  perform tst.clear_sessions(v_user);
  perform tst.set_streak(v_user, 0, null, 0, 0);
  perform tst.set_coins(v_user, 0);

  for i in 1..5 loop
    v_s := public.start_session(null, null);
    perform tst.backdate_session(v_s.id, interval '150 minutes');
    perform public.end_session(v_s.id, null);
  end loop;

  -- 400 from sessions, plus the one-off 30 for meeting the goal.
  assert tst.coins_of(v_user) <= 430,
    format('the daily cap did not hold: %s coins', tst.coins_of(v_user));
  assert tst.coins_of(v_user) >= 400,
    format('five long sessions should reach the cap, got %s', tst.coins_of(v_user));
end $$;

-- ============================================================ purchases ==

do $$
declare
  v_user    uuid := '11111111-1111-1111-1111-111111111111';
  v_item    public.catalog_items;
  v_locked  public.catalog_items;
  v_blocked boolean;
begin
  select * into v_item   from public.catalog_items where slug = 'yarn-ball';
  select * into v_locked from public.catalog_items where slug = 'piano';

  perform tst.set_coins(v_user, 10);
  v_blocked := false;
  begin
    perform public.purchase_item(v_item.id);
  exception when check_violation then v_blocked := true;
  end;
  assert v_blocked, 'bought an item without enough coins';

  perform tst.set_coins(v_user, 500);
  perform public.purchase_item(v_item.id);
  assert tst.coins_of(v_user) = 500 - v_item.price, 'the purchase debited the wrong amount';
  assert exists (select 1 from public.inventory where user_id = v_user and item_id = v_item.id),
    'the purchase did not grant the item';
  assert exists (
    select 1 from public.transactions
     where user_id = v_user and reason = 'purchase' and delta = -v_item.price
  ), 'the purchase did not write a transaction';

  v_blocked := false;
  begin
    perform public.purchase_item(v_item.id);
  exception when unique_violation then v_blocked := true;
  end;
  assert v_blocked, 'bought the same item twice';

  -- Locked items stay locked even when affordable.
  perform tst.set_coins(v_user, 99999);
  v_blocked := false;
  begin
    perform public.purchase_item(v_locked.id);
  exception when insufficient_privilege then v_blocked := true;
  end;
  assert v_blocked, 'bought an item whose unlock condition was not met';
end $$;

-- A layout row may only reference an item the user owns.
do $$
declare
  v_user    uuid := '11111111-1111-1111-1111-111111111111';
  v_unowned uuid;
  v_owned   uuid;
  v_blocked boolean := false;
begin
  select id into v_unowned from public.catalog_items
   where id not in (select item_id from public.inventory where user_id = v_user)
   limit 1;

  begin
    insert into public.room_layout (user_id, item_id, grid_x, grid_y)
    values (v_user, v_unowned, 1, 1);
  exception when insufficient_privilege then v_blocked := true;
  end;
  assert v_blocked, 'placed an item the user does not own';

  -- But an owned one is fine — this is the one table the client may write.
  -- It has to be one that is not already placed: the starter floor and walls
  -- are, and one item may only appear in the room once.
  select i.item_id into v_owned
    from public.inventory i
   where i.user_id = v_user
     and not exists (
       select 1 from public.room_layout r
        where r.user_id = v_user and r.item_id = i.item_id
     )
   limit 1;
  assert v_owned is not null, 'no unplaced owned item to test placement with';
  insert into public.room_layout (user_id, item_id, grid_x, grid_y) values (v_user, v_owned, 4, 4);

  -- Off-grid placements are rejected by the check constraint.
  v_blocked := false;
  begin
    insert into public.room_layout (user_id, item_id, grid_x, grid_y) values (v_user, v_owned, 12, 3);
  exception when check_violation then v_blocked := true;
  end;
  assert v_blocked, 'a placement outside the 10x10 grid was accepted';
end $$;

-- ============================================================= get_today ==

do $$
declare v_today jsonb;
begin
  v_today := public.get_today();
  assert (v_today ->> 'local_day')::date = public.local_day(now(), 'Pacific/Kiritimati'),
    'get_today reported the wrong local day';
  assert (v_today ->> 'daily_goal_minutes')::int = 60, 'get_today reported the wrong goal';
  assert (v_today ->> 'streak_day_threshold_minutes')::int = 30,
    'get_today reported the wrong streak threshold';
  assert (v_today ->> 'server_now') is not null, 'get_today did not return the server clock';
end $$;

-- =============================================================== stats ====

do $$
declare v_rows int;
begin
  select count(*) into v_rows from public.get_daily_totals(30);
  assert v_rows = 30, format('get_daily_totals(30) returned %s rows', v_rows);
  -- Gaps are filled, so the heatmap does not have to.
  assert (select bool_and(seconds >= 0) from public.get_daily_totals(30)),
    'get_daily_totals returned a negative total';
end $$;

-- ====================================================== hardening (0007) ==
-- Regression tests for the security audit findings. See SECURITY.md.

-- The internal rollup helpers took an arbitrary user id and were callable by
-- any signed-in user, which leaked another account's study time.
do $$
declare v_blocked boolean;
begin
  v_blocked := false;
  begin
    perform public.credited_seconds_on('22222222-2222-2222-2222-222222222222', 'UTC', current_date);
  exception when insufficient_privilege then v_blocked := true;
  end;
  assert v_blocked, 'credited_seconds_on is still callable by the client';

  v_blocked := false;
  begin
    perform public.session_coins_on('22222222-2222-2222-2222-222222222222', 'UTC', current_date);
  exception when insufficient_privilege then v_blocked := true;
  end;
  assert v_blocked, 'session_coins_on is still callable by the client';

  v_blocked := false;
  begin
    perform public.goal_bonus_paid_on('22222222-2222-2222-2222-222222222222', 'UTC', current_date);
  exception when insufficient_privilege then v_blocked := true;
  end;
  assert v_blocked, 'goal_bonus_paid_on is still callable by the client';
end $$;

-- Revoking those must not have broken the functions that call them: a
-- SECURITY DEFINER body runs as the definer, which still holds EXECUTE.
do $$
declare
  v_user uuid := '11111111-1111-1111-1111-111111111111';
  v_s    public.study_sessions;
  v_r    jsonb;
begin
  perform tst.clear_sessions(v_user);
  perform tst.set_streak(v_user, 0, null, 0, 0);
  v_s := public.start_session(null, null);
  perform tst.backdate_session(v_s.id, interval '40 minutes');
  v_r := public.end_session(v_s.id, null);
  assert (v_r ->> 'coins_awarded')::int > 0,
    'end_session broke after revoking its internal helpers';
  assert (public.get_today() ->> 'minutes_today')::int > 0,
    'get_today broke after revoking its internal helpers';
end $$;

-- A trigger function has no business being RPC-callable.
do $$
declare v_blocked boolean := false;
begin
  begin
    perform public.handle_new_user();
  exception
    when insufficient_privilege then v_blocked := true;
    when others then v_blocked := false;
  end;
  assert v_blocked, 'handle_new_user is still callable by the client';
end $$;

-- Every SECURITY DEFINER function must pin a search_path, and must not leave
-- pg_temp to be searched first.
do $$
declare r record;
begin
  for r in
    select p.proname, p.proconfig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
  loop
    assert r.proconfig is not null,
      format('%s is SECURITY DEFINER with a mutable search_path', r.proname);
    assert exists (
      select 1 from unnest(r.proconfig) c
       where c like 'search_path=%' and c like '%pg_temp%'
    ), format('%s does not name pg_temp in its search_path', r.proname);
  end loop;
end $$;

-- One owned item cannot be placed twice.
do $$
declare
  v_user    uuid := '11111111-1111-1111-1111-111111111111';
  v_owned   uuid;
  v_blocked boolean := false;
begin
  select item_id into v_owned from public.inventory where user_id = v_user limit 1;
  delete from public.room_layout where user_id = v_user and item_id = v_owned;
  insert into public.room_layout (user_id, item_id, grid_x, grid_y) values (v_user, v_owned, 2, 2);
  begin
    insert into public.room_layout (user_id, item_id, grid_x, grid_y) values (v_user, v_owned, 5, 5);
  exception when unique_violation then v_blocked := true;
  end;
  assert v_blocked, 'the same item could be placed twice';
end $$;

-- Timezone changes are rate-limited, because they move the boundary the daily
-- coin cap and the streak are bucketed by: flipping it repeatedly could reset a
-- capped day or credit one stretch of study to two days.
--
-- The fixture at the top of this file already moved this profile's timezone
-- once, which started the clock, so the next change must be refused.
do $$
declare v_blocked boolean := false;
begin
  begin
    update public.profiles set timezone = 'Europe/London'
     where id = '11111111-1111-1111-1111-111111111111';
  exception when check_violation then v_blocked := true;
  end;
  assert v_blocked, 'timezone could be changed twice within 24 hours';

  -- And the rate-limit clock itself must not be clearable by the client.
  update public.profiles set timezone_changed_at = null
   where id = '11111111-1111-1111-1111-111111111111';
  assert (select timezone_changed_at is not null from public.profiles
           where id = '11111111-1111-1111-1111-111111111111'),
    'the client could reset its own timezone rate-limit clock';
end $$;

rollback;

\echo ''
\echo '  All assertions passed.'
\echo ''
