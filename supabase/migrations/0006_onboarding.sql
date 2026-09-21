-- 0006_onboarding.sql
-- Finishing onboarding is one atomic step: the profile is filled in and the
-- free starter items land in the room together, so nobody can end up onboarded
-- with no floor.

create or replace function public.complete_onboarding(
  p_cat_name    text,
  p_cat_variant int,
  p_daily_goal  int,
  p_timezone    text
)
returns public.profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_row  public.profiles;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if not public.is_valid_timezone(p_timezone) then
    raise exception 'unknown IANA timezone: %', p_timezone using errcode = 'check_violation';
  end if;

  update public.profiles
     set cat_name           = trim(p_cat_name),
         cat_variant        = least(greatest(p_cat_variant, 0), 2),
         daily_goal_minutes = least(greatest(p_daily_goal, 5), 720),
         timezone           = p_timezone,
         onboarded_at       = coalesce(onboarded_at, now())
   where id = v_user
   returning * into v_row;

  if not found then
    raise exception 'profile missing' using errcode = 'P0002';
  end if;

  perform public.grant_starter_items(v_user);
  return v_row;
end;
$$;

revoke all on function public.complete_onboarding(text, int, int, text) from public, anon;
grant execute on function public.complete_onboarding(text, int, int, text) to authenticated;

-- Backfill for anyone created before this migration ran.
do $$
declare r record;
begin
  for r in select id from public.profiles where onboarded_at is not null loop
    perform public.grant_starter_items(r.id);
  end loop;
end $$;
