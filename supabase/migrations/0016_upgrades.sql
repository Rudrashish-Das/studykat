-- 0016_upgrades.sql
-- The upgrades themselves. The timer — stopwatch and Pomodoro alike — the
-- sound switch, the volume and the bell chime stay free; the extra sounds here
-- are earned.
--
-- `art_key` is `upgrade/<key>`, and the key is what the app checks ownership
-- by — keep them in step with `UPGRADES` in src/lib/preferences.ts.

insert into public.catalog_items
  (slug, name, description, category, price, unlock_rule, footprint_w, footprint_h, layer, art_key, sort_order)
values
  ('upgrade-chimes', 'Chime pack', 'Two more timer sounds: a rising chime and a wooden marimba.',
     'upgrade', 80, null, 1, 1, 1, 'upgrade/chimes', 20),
  ('upgrade-meow-alarm', 'Meow alarm', 'Your cat tells you when time is up. Insistently.',
     'upgrade', 120, '{"kind":"streak","days":3}', 1, 1, 1, 'upgrade/meow-alarm', 30),
  ('upgrade-cat-voice', 'Cat voice', 'Meows when petted, purrs when happy, crunches at mealtimes.',
     'upgrade', 100, null, 1, 1, 1, 'upgrade/cat-voice', 40),
  ('upgrade-room-sounds', 'Room sounds', 'Toys rattle, plants rustle, the piano goes plink.',
     'upgrade', 140, null, 1, 1, 1, 'upgrade/room-sounds', 50)
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

-- An upgrade is owned, not placed. The room policies only check ownership, so
-- refuse upgrades here rather than let one turn up as an invisible tile.
create or replace function public.guard_room_layout_placeable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from public.catalog_items
     where id = new.item_id and category = 'upgrade'
  ) then
    raise exception 'upgrades cannot be placed in the room' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists room_layout_guard_placeable on public.room_layout;
create trigger room_layout_guard_placeable
  before insert or update of item_id on public.room_layout
  for each row execute function public.guard_room_layout_placeable();
