-- 0010_cactus.sql
-- A cactus for the plant shelf, priced between the succulent and the fern.
--
-- 0005 carries the same row for a fresh database; this is for the ones already
-- seeded.

insert into public.catalog_items
  (slug, name, description, category, price, unlock_rule, footprint_w, footprint_h, layer, art_key, sort_order)
values
  ('cactus', 'Cactus', 'Prickly, but means well.', 'plant', 110, null, 1, 1, 2, 'cactus/oak', 15)
on conflict (slug) do update set
  name        = excluded.name,
  description = excluded.description,
  category    = excluded.category,
  price       = excluded.price,
  unlock_rule = excluded.unlock_rule,
  footprint_w = excluded.footprint_w,
  footprint_h = excluded.footprint_h,
  layer       = excluded.layer,
  art_key     = excluded.art_key,
  sort_order  = excluded.sort_order;
