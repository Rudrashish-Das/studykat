-- 0012_snake_and_teddy.sql
-- Two more toys: a plush snake between the feather wand and the scratching
-- post, and a teddy bear between the cat bed and the cat tree.
--
-- 0005 carries the same rows for a fresh database; this is for the ones already
-- seeded.

insert into public.catalog_items
  (slug, name, description, category, price, unlock_rule, footprint_w, footprint_h, layer, art_key, sort_order)
values
  ('plush-snake', 'Plush snake', 'Harmless. Suspiciously long.',   'toy', 120, null, 1, 1, 2, 'toy-snake/sage', 25),
  ('teddy-bear',  'Teddy bear',  'Has seen things. Says nothing.', 'toy', 420, null, 1, 1, 2, 'teddy/oak',      45)
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
