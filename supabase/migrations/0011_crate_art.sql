-- 0011_crate_art.sql
-- The wooden crate shared `box-low` with the stool, so it drew as a plain box.
-- It has its own shape now — planks, battens and a brace.
--
-- 0005 is an idempotent upsert and carries the same value, so a fresh database
-- gets this from the seed; this is for the ones already seeded.

update public.catalog_items
   set art_key = 'crate/oak'
 where slug = 'crate';
