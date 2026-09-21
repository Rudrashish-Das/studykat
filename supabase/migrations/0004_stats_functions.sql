-- 0004_stats_functions.sql
-- Read-only rollups for the Stats screen. These are SECURITY DEFINER only so
-- they can bucket by the user's timezone without the client sending one; they
-- read nothing outside the caller's own rows.

-- One row per local day in the range, including days with nothing on them, so
-- the heatmap does not have to fill gaps in JavaScript.
create or replace function public.get_daily_totals(p_days int default 365)
returns table (day date, seconds int, sessions int, coins int)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_tz   text;
  v_to   date;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select timezone into v_tz from public.profiles where id = v_user;
  v_to := public.local_day(now(), v_tz);

  return query
  with span as (
    select generate_series(
      v_to - (greatest(least(p_days, 730), 1) - 1),
      v_to,
      interval '1 day'
    )::date as day
  ),
  totals as (
    select public.local_day(s.ended_at, v_tz) as day,
           sum(s.awarded_seconds)::int        as seconds,
           count(*)::int                      as sessions,
           sum(s.coins_awarded)::int          as coins
      from public.study_sessions s
     where s.user_id = v_user
       and s.status = 'completed'
       and s.awarded_seconds >= 300
       and s.ended_at >= (v_to - 730)::timestamp at time zone v_tz
     group by 1
  )
  select span.day,
         coalesce(totals.seconds, 0),
         coalesce(totals.sessions, 0),
         coalesce(totals.coins, 0)
    from span
    left join totals on totals.day = span.day
   order by span.day;
end;
$$;

create or replace function public.get_subject_totals()
returns table (subject_id uuid, name text, color text, seconds int, sessions int)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.subject_id,
         coalesce(sub.name, 'No subject') as name,
         coalesce(sub.color, '#c99a6b')   as color,
         sum(s.awarded_seconds)::int      as seconds,
         count(*)::int                    as sessions
    from public.study_sessions s
    left join public.subjects sub on sub.id = s.subject_id
   where s.user_id = auth.uid()
     and s.status = 'completed'
     and s.awarded_seconds >= 300
   group by s.subject_id, sub.name, sub.color
   order by seconds desc;
$$;

revoke all on function public.get_daily_totals(int)   from public, anon;
revoke all on function public.get_subject_totals()    from public, anon;
grant execute on function public.get_daily_totals(int) to authenticated;
grant execute on function public.get_subject_totals() to authenticated;
