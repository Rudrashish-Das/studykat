-- 0017_server_pomodoro.sql
-- Pomodoro, decided by the database.
--
-- The settings live on the profile, so every device agrees on them. When a
-- session starts they are copied onto it, so changing them mid-session cannot
-- reshape a session already running. And the breaks are the server's: every
-- session call first "settles" the session, writing in any break that has
-- come due at the exact moment it came due, and closing any break that has
-- run its course when the user asked to carry on automatically. A client that
-- never pauses, or a tab closed for an hour, still ends with the same pauses
-- — and the same pay — as one that watched every second.
--
-- Pauses gain a `reason`: 'break' (written here) or 'manual' (the Pause
-- button). Older pauses have none and count as manual.

-- ---------------------------------------------------------- the settings --

alter table public.profiles
  add column if not exists timer_mode          text    not null default 'stopwatch',
  add column if not exists focus_minutes       int     not null default 25,
  add column if not exists short_break_minutes int     not null default 5,
  add column if not exists long_break_minutes  int     not null default 15,
  add column if not exists long_break_every    int     not null default 4,
  add column if not exists auto_resume         boolean not null default false;

alter table public.profiles drop constraint if exists profiles_timer_mode;
alter table public.profiles add constraint profiles_timer_mode
  check (timer_mode in ('stopwatch', 'pomodoro'));
alter table public.profiles drop constraint if exists profiles_pomodoro_lengths;
alter table public.profiles add constraint profiles_pomodoro_lengths check (
  focus_minutes       between 5 and 120 and
  short_break_minutes between 1 and 30  and
  long_break_minutes  between 5 and 60  and
  long_break_every    between 2 and 8
);

-- The copy a session runs by. Null for a stopwatch session.
alter table public.study_sessions
  add column if not exists pomodoro jsonb;
alter table public.study_sessions drop constraint if exists sessions_pomodoro_object;
alter table public.study_sessions add constraint sessions_pomodoro_object
  check (pomodoro is null or jsonb_typeof(pomodoro) = 'object');

-- --------------------------------------------------------------- helpers --

-- Like `paused_seconds`, but not rounded: break boundaries are placed by it.
create or replace function public.paused_seconds_exact(p_pauses jsonb, p_now timestamptz)
returns numeric
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(
    sum(greatest(0, extract(epoch from (
      coalesce((p ->> 'until')::timestamptz, p_now) - (p ->> 'at')::timestamptz
    )))),
    0
  )
  from jsonb_array_elements(p_pauses) as p;
$$;

-- How long break number `p_break` (1-based) lasts: every Nth is the long one.
create or replace function public.pomodoro_break_seconds(p_cfg jsonb, p_break int)
returns numeric
language sql
immutable
set search_path = public, pg_temp
as $$
  select 60 * case
    when p_break % (p_cfg ->> 'long_break_every')::int = 0
      then (p_cfg ->> 'long_break_minutes')::int
    else (p_cfg ->> 'short_break_minutes')::int
  end;
$$;

-- The pauses as they should be at `p_now`: every break that has come due
-- written in, and every break that has run out closed if the session carries
-- on by itself. Pure, so the client mirrors it exactly (src/lib/pomodoro.ts).
--
-- Block N ends when focused time reaches N × the focus length, and break N
-- follows it, so the number of break pauses is the number of blocks handled.
-- Ending a break early ("Skip break") just closes it sooner.
create or replace function public.pomodoro_settle(
  p_started timestamptz,
  p_pauses  jsonb,
  p_cfg     jsonb,
  p_now     timestamptz
)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_max_seconds constant int := 180 * 60;  -- end_session's ceiling
  v_focus   numeric := (p_cfg ->> 'focus_minutes')::int * 60;
  v_pauses  jsonb := p_pauses;
  v_n       int;
  v_last    jsonb;
  v_breaks  int;
  v_focused numeric;
  v_target  numeric;
  v_at      timestamptz;
begin
  if p_cfg is null then
    return p_pauses;
  end if;

  -- Bounded: at most one break per five minutes of a 180-minute session.
  for i in 1..100 loop
    v_n := jsonb_array_length(v_pauses);
    v_last := case when v_n > 0 then v_pauses -> (v_n - 1) end;
    select count(*) into v_breaks
      from jsonb_array_elements(v_pauses) p where p ->> 'reason' = 'break';

    if v_last is not null and v_last ->> 'until' is null then
      -- On a pause. Only a break, set to carry on by itself, moves on.
      exit when v_last ->> 'reason' is distinct from 'break'
             or not coalesce((p_cfg ->> 'auto_resume')::boolean, false);
      v_at := (v_last ->> 'at')::timestamptz
              + make_interval(secs => public.pomodoro_break_seconds(p_cfg, v_breaks));
      exit when v_at > p_now;
      v_pauses := jsonb_set(v_pauses, array[(v_n - 1)::text, 'until'], to_jsonb(v_at));
    else
      -- Running. Has the next block's end gone by?
      v_target := (v_breaks + 1) * v_focus;
      exit when v_target > v_max_seconds;
      v_focused := extract(epoch from (p_now - p_started))
                   - public.paused_seconds_exact(v_pauses, p_now);
      exit when v_focused < v_target;
      v_at := p_now - make_interval(secs => v_focused - v_target);
      -- Never before the stretch it ends (rounding aside, it cannot be).
      if v_last is not null then
        v_at := greatest(v_at, (v_last ->> 'until')::timestamptz);
      end if;
      v_pauses := v_pauses || jsonb_build_array(
        jsonb_build_object('at', to_jsonb(v_at), 'until', null, 'reason', 'break')
      );
    end if;
  end loop;

  return v_pauses;
end;
$$;

-- Settle one session row, which the caller has locked. Internal.
create or replace function public.settle_pomodoro(p_row public.study_sessions)
returns public.study_sessions
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_pauses jsonb;
  v_row    public.study_sessions := p_row;
begin
  if p_row.pomodoro is null or p_row.status <> 'active' then
    return p_row;
  end if;
  v_pauses := public.pomodoro_settle(p_row.started_at, p_row.pauses, p_row.pomodoro, now());
  if v_pauses is distinct from p_row.pauses then
    update public.study_sessions set pauses = v_pauses
     where id = p_row.id
     returning * into v_row;
  end if;
  return v_row;
end;
$$;

revoke all on function public.settle_pomodoro(public.study_sessions) from public, anon, authenticated;

-- ---------------------------------------------------------- start_session --
-- As in 0003, plus the copy of the profile's timer settings.

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
  v_user    uuid := auth.uid();
  v_row     public.study_sessions;
  v_profile public.profiles;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  update public.study_sessions
     set status = 'abandoned',
         ended_at = coalesce(ended_at, now())
   where user_id = v_user
     and status = 'active'
     and started_at < now() - interval '8 hours';

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

  select * into v_profile from public.profiles where id = v_user;

  insert into public.study_sessions (user_id, subject_id, started_at, label, pomodoro)
  values (
    v_user,
    p_subject_id,
    now(),
    nullif(trim(coalesce(p_label, '')), ''),
    case when v_profile.timer_mode = 'pomodoro' then jsonb_build_object(
      'focus_minutes',       v_profile.focus_minutes,
      'short_break_minutes', v_profile.short_break_minutes,
      'long_break_minutes',  v_profile.long_break_minutes,
      'long_break_every',    v_profile.long_break_every,
      'auto_resume',         v_profile.auto_resume
    ) end
  )
  returning * into v_row;

  return v_row;
end;
$$;

-- ---------------------------------------------------------- sync_session --
-- Write in whatever is due. Clients call it when their own reckoning says a
-- block or a break has just ended; any device may, and it is idempotent.

create or replace function public.sync_session(p_session_id uuid)
returns public.study_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.study_sessions;
begin
  select * into v_row from public.study_sessions
   where id = p_session_id and user_id = auth.uid() and status = 'active'
   for update;
  if not found then
    raise exception 'no active session' using errcode = 'P0002';
  end if;
  return public.settle_pomodoro(v_row);
end;
$$;

-- ---------------------------------------------------- pause / resume ------
-- As in 0007, settling first, and tagging the pause as the user's own.

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

  v_row := public.settle_pomodoro(v_row);

  -- Already paused, or on a break? Leave the open interval alone.
  if jsonb_array_length(v_row.pauses) > 0
     and (v_row.pauses -> (jsonb_array_length(v_row.pauses) - 1) ->> 'until') is null then
    return v_row;
  end if;

  if jsonb_array_length(v_row.pauses) >= 100 then
    raise exception 'too many pauses in one session' using errcode = 'check_violation';
  end if;

  update public.study_sessions
     set pauses = v_row.pauses || jsonb_build_array(
       jsonb_build_object('at', to_jsonb(now()), 'until', null, 'reason', 'manual')
     )
   where id = p_session_id
   returning * into v_row;

  return v_row;
end;
$$;

-- Resuming ends a manual pause, or cuts a break short.
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

  v_row := public.settle_pomodoro(v_row);

  v_last := jsonb_array_length(v_row.pauses) - 1;
  if v_last < 0 or (v_row.pauses -> v_last ->> 'until') is not null then
    return v_row; -- not paused
  end if;

  update public.study_sessions
     set pauses = jsonb_set(v_row.pauses, array[v_last::text, 'until'], to_jsonb(now()))
   where id = p_session_id
   returning * into v_row;

  return v_row;
end;
$$;

-- ------------------------------------------------------------ end_session --
-- The payout logic stays exactly as 0003 wrote it; it just runs on a settled
-- session. So the old function is kept under another name, out of reach of
-- clients, and `end_session` settles and hands over to it.

do $$ begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'end_session_settled'
  ) then
    alter function public.end_session(uuid, int) rename to end_session_settled;
  end if;
end $$;

revoke all on function public.end_session_settled(uuid, int) from public, anon, authenticated;

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
  v_row public.study_sessions;
begin
  select * into v_row from public.study_sessions
   where id = p_session_id and user_id = auth.uid()
   for update;
  if found then
    perform public.settle_pomodoro(v_row);
  end if;
  return public.end_session_settled(p_session_id, p_client_seconds);
end;
$$;

-- --------------------------------------------------------------- privileges

revoke all on function public.sync_session(uuid)    from public, anon;
revoke all on function public.pause_session(uuid)   from public, anon;
revoke all on function public.resume_session(uuid)  from public, anon;
revoke all on function public.end_session(uuid, int) from public, anon;
revoke all on function public.start_session(uuid, text) from public, anon;

grant execute on function public.sync_session(uuid)       to authenticated;
grant execute on function public.pause_session(uuid)      to authenticated;
grant execute on function public.resume_session(uuid)     to authenticated;
grant execute on function public.end_session(uuid, int)   to authenticated;
grant execute on function public.start_session(uuid, text) to authenticated;
