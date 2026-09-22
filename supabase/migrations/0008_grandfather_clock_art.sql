-- 0008_grandfather_clock_art.sql
-- The grandfather clock shared `tallbox` with the scratching post, so a 2,400
-- coin item unlocked at a 30-day streak drew as a plain brown box. It has its
-- own shape now — case, face and pendulum.
--
-- 0005 is an idempotent upsert and carries the same value, so a fresh database
-- gets this from the seed; this is for the ones already seeded.

update public.catalog_items
   set art_key = 'grandfather/walnut'
 where slug = 'grandfather-clock';
