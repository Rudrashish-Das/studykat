-- 0009_plant_art.sql
-- Five plants shared two silhouettes: succulent, fern and bonsai were all
-- `plant-small`, monstera and olive tree both `plant-tall`. A 1,500 coin bonsai
-- and a 70 coin succulent were the same drawing in a differently coloured pot.
--
-- Each has its own shape now. 0005 is an idempotent upsert carrying the same
-- values, so a fresh database gets these from the seed; this is for the ones
-- already seeded.

update public.catalog_items set art_key = 'succulent/sage'  where slug = 'succulent';
update public.catalog_items set art_key = 'fern/teal'       where slug = 'fern';
update public.catalog_items set art_key = 'monstera/sage'   where slug = 'monstera';
update public.catalog_items set art_key = 'olive/oak'       where slug = 'olive-tree';

update public.catalog_items set art_key = 'bonsai/walnut'   where slug = 'bonsai';
