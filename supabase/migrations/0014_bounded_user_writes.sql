-- 0014_bounded_user_writes.sql
-- Fixes from the second security pass. See SECURITY.md.
--
-- 0007 bounded `room_layout`, but two other things the client writes directly
-- were still unbounded: the free-text `profiles.display_name`, and the number
-- of rows in `subjects`. Either could be used to fill a free-tier database
-- from a single account.

-- ===================================================================== 1 ===
-- `display_name` was the only client-writable text column with no length
-- check. Trim anything already oversized, then constrain it.

update public.profiles
   set display_name = left(display_name, 80)
 where char_length(display_name) > 80;

alter table public.profiles
  drop constraint if exists profiles_display_name_len;
alter table public.profiles
  add constraint profiles_display_name_len
  check (display_name is null or char_length(display_name) <= 80);

-- The signup trigger copies the name out of `raw_user_meta_data`, which an
-- email signup can set to anything. Truncate there, so a long name shortens
-- rather than failing the signup outright.
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
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), 80)
  )
  on conflict (id) do nothing;

  insert into public.wallet (user_id) values (new.id) on conflict (user_id) do nothing;
  insert into public.streaks (user_id) values (new.id) on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

-- ===================================================================== 2 ===
-- The client owns `subjects` outright, so nothing stopped a loop inserting
-- rows forever. Archived subjects still count: archiving is how the UI hides a
-- subject, not a way around the ceiling.

create or replace function public.guard_subjects_size()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if (select count(*) from public.subjects where user_id = new.user_id) >= 50 then
    -- Shown to the user as "Could not add that subject: <this>".
    raise exception 'you can have at most 50 subjects' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists subjects_guard_size on public.subjects;
create trigger subjects_guard_size
  before insert on public.subjects
  for each row execute function public.guard_subjects_size();

revoke all on function public.guard_subjects_size() from public, anon, authenticated;
