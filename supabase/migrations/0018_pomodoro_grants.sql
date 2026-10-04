-- 0018_pomodoro_grants.sql
-- Tidy the privileges 0016 and 0017 left at Supabase's defaults. See
-- SECURITY.md, third pass.

-- The Pomodoro arithmetic is pure and touches no stored data, so a signed-in
-- user may still call it — as with `paused_seconds` and `compute_coins` (see
-- 0007). But a signed-out visitor has no session to settle, and has no
-- business making the database loop over a payload of their choosing.
revoke all on function public.paused_seconds_exact(jsonb, timestamptz)                 from public, anon;
revoke all on function public.pomodoro_break_seconds(jsonb, int)                       from public, anon;
revoke all on function public.pomodoro_settle(timestamptz, jsonb, jsonb, timestamptz)  from public, anon;

grant execute on function public.paused_seconds_exact(jsonb, timestamptz)                to authenticated;
grant execute on function public.pomodoro_break_seconds(jsonb, int)                      to authenticated;
grant execute on function public.pomodoro_settle(timestamptz, jsonb, jsonb, timestamptz) to authenticated;

-- A trigger function is not part of the client's API (as 0007 did for the rest).
revoke all on function public.guard_room_layout_placeable() from public, anon, authenticated;
