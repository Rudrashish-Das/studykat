-- 0005_catalog_seed.sql
-- The shop. 53 items.
--
-- Price curve: a 25-minute session pays about 26 coins, so the cheapest items
-- (40-90) are two sessions away and land in week one. The mid tier (150-800)
-- is a few days each. The top of the curve (2400-4500) is genuinely weeks of
-- daily study, which is the point — the room should still have somewhere to go
-- after a month.
--
-- `art_key` is "<shape>/<material>". The Phase 5 renderer draws the shape from
-- a shared isometric recipe and recolours it from the material, which is how 53
-- items exist without 53 hand-drawn sprites.
--
-- floor / wall / wallcolor are room-wide surfaces rather than placed objects:
-- the renderer uses whichever one the user has placed, ignoring its grid cell.

insert into public.catalog_items
  (slug, name, description, category, price, unlock_rule, footprint_w, footprint_h, layer, art_key, sort_order)
values
  -- ---------------------------------------------------------------- floors
  ('pine-floor',       'Pine boards',       'Where everyone starts.',                      'floor',     0,    null,                                      1, 1, 0, 'floor/pine',           10),
  ('oak-floor',        'Oak boards',        'Warmer, and it hides crumbs.',                'floor',     220,  null,                                      1, 1, 0, 'floor/oak',            20),
  ('checker-tile',     'Checkered tile',    'A kitchen floor that wandered in.',           'floor',     520,  null,                                      1, 1, 0, 'floor/checker',        30),
  ('herringbone',      'Herringbone',       'Laid one small plank at a time.',             'floor',     900,  '{"kind":"lifetime_hours","hours":25}',    1, 1, 0, 'floor/herringbone',    40),
  ('tatami-floor',     'Tatami mats',       'Smells faintly of straw.',                    'floor',     1400, '{"kind":"streak","days":14}',             1, 1, 0, 'floor/tatami',         50),

  -- ----------------------------------------------------------------- walls
  ('plaster-wall',     'Plain plaster',     'Honest, if unambitious.',                     'wall',      0,    null,                                      1, 1, 0, 'wall/plaster',         10),
  ('wainscot-wall',    'Wainscoting',       'Half panelling, all comfort.',                'wall',      380,  null,                                      1, 1, 0, 'wall/wainscot',        20),
  ('brick-wall',       'Painted brick',     'Old building, new paint.',                    'wall',      760,  null,                                      1, 1, 0, 'wall/brick',           30),
  ('panel-wall',       'Timber panelling',  'Floor to ceiling, knot for knot.',            'wall',      1600, '{"kind":"lifetime_hours","hours":50}',    1, 1, 0, 'wall/panel',           40),

  -- ------------------------------------------------------------ wallcolour
  ('cream-wash',       'Cream wash',        'Barely a colour. Restful.',                   'wallcolor', 90,   null,                                      1, 1, 0, 'wallcolor/cream',      10),
  ('sage-wash',        'Sage wash',         'The colour of a quiet afternoon.',            'wallcolor', 150,  null,                                      1, 1, 0, 'wallcolor/sage',       20),
  ('rose-wash',        'Dusty rose wash',   'Flatters everything, including cats.',        'wallcolor', 150,  null,                                      1, 1, 0, 'wallcolor/rose',       30),
  ('teal-wash',        'Muted teal wash',   'Cool without being cold.',                    'wallcolor', 150,  null,                                      1, 1, 0, 'wallcolor/teal',       40),

  -- ------------------------------------------------------------------ rugs
  ('round-rug-rose',   'Round rug',         'Exactly one cat in diameter.',                'rug',       60,   null,                                      2, 2, 1, 'rug-round/rose',       10),
  ('diamond-rug-sage', 'Woven mat',         'Green, and a little scratchy.',               'rug',       80,   null,                                      2, 2, 1, 'rug-diamond/sage',     20),
  ('runner-teal',      'Hallway runner',    'Long enough for a running start.',            'rug',       140,  null,                                      3, 1, 1, 'rug-diamond/teal',     30),
  ('braided-cream',    'Braided rug',       'Someone''s grandmother made this.',           'rug',       300,  null,                                      3, 3, 1, 'rug-round/cream',      40),
  ('persian-rug',      'Patterned rug',     'Far too good to put a bowl on.',              'rug',       1100, '{"kind":"streak","days":7}',              3, 3, 1, 'rug-diamond/rose',     50),

  -- ------------------------------------------------------------- furniture
  ('stool',            'Little stool',      'Holds one mug or one cat.',                   'furniture', 45,   null,                                      1, 1, 2, 'box-low/pine',         10),
  ('crate',            'Wooden crate',      'Storage, seating, or a fort.',                'furniture', 55,   null,                                      1, 1, 2, 'box-low/oak',          20),
  ('side-table',       'Side table',        'For the things you put down.',                'furniture', 90,   null,                                      1, 1, 2, 'table/oak',            30),
  ('chair',            'Wooden chair',      'Upright, like your posture should be.',       'furniture', 120,  null,                                      1, 1, 2, 'chair/oak',            40),
  ('desk',             'Study desk',        'The whole reason we are here.',               'furniture', 180,  null,                                      2, 1, 2, 'desk/oak',             50),
  ('armchair',         'Armchair',          'Dangerously comfortable.',                    'furniture', 420,  null,                                      1, 1, 2, 'armchair/sage',        60),
  ('bookcase',         'Bookcase',          'Fills up faster than you expect.',            'furniture', 560,  null,                                      1, 2, 2, 'bookcase/walnut',      70),
  ('sofa',             'Small sofa',        'Two people, or one person and a cat.',        'furniture', 780,  null,                                      2, 1, 2, 'sofa/rose',            80),
  ('bed',              'Bed',               'You have earned a nap.',                      'furniture', 950,  null,                                      2, 2, 2, 'bed/cream',            90),
  ('wardrobe',         'Wardrobe',          'Deeper than it looks.',                       'furniture', 1300, '{"kind":"lifetime_hours","hours":25}',    1, 2, 2, 'wardrobe/walnut',      100),
  ('grandfather-clock','Grandfather clock', 'Keeps better time than you do.',              'furniture', 2400, '{"kind":"streak","days":30}',             1, 1, 2, 'grandfather/walnut',   110),
  ('piano',            'Upright piano',     'Slightly out of tune. Endearing.',            'furniture', 4500, '{"kind":"lifetime_hours","hours":100}',   2, 1, 2, 'piano/char',           120),

  -- ---------------------------------------------------------------- plants
  ('succulent',        'Succulent',         'Survives anything, including you.',           'plant',     70,   null,                                      1, 1, 2, 'succulent/sage',       10),
  ('fern',             'Fern',              'Dramatic about water.',                       'plant',     160,  null,                                      1, 1, 2, 'fern/teal',            20),
  ('monstera',         'Monstera',          'Holes on purpose.',                           'plant',     340,  null,                                      1, 1, 2, 'monstera/sage',        30),
  ('olive-tree',       'Olive tree',        'Will not fruit indoors. Try anyway.',         'plant',     720,  null,                                      1, 1, 2, 'olive/oak',            40),
  ('bonsai',           'Bonsai',            'Years of patience in a small pot.',           'plant',     1500, '{"kind":"lifetime_hours","hours":50}',    1, 1, 2, 'bonsai/walnut',        50),

  -- ------------------------------------------------------------------ toys
  ('yarn-ball',        'Ball of yarn',      'Destined to end up under the sofa.',          'toy',       40,   null,                                      1, 1, 2, 'toy-ball/rose',        10),
  ('feather-wand',     'Feather wand',      'Batteries not required.',                     'toy',       75,   null,                                      1, 1, 2, 'toy-wand/teal',        20),
  ('scratching-post',  'Scratching post',   'Bought to save the sofa. Worked partly.',     'toy',       230,  null,                                      1, 1, 2, 'tallbox/pine',         30),
  ('cat-bed',          'Cat bed',           'Will be ignored in favour of a box.',         'toy',       310,  null,                                      1, 1, 2, 'catbed/rose',          40),
  ('cat-tree',         'Cat tree',          'A whole apartment, vertically.',              'toy',       880,  null,                                      1, 1, 2, 'cattree/pine',         50),
  ('cardboard-castle', 'Cardboard castle',  'Cost nothing. Worth everything.',             'toy',       1900, '{"kind":"streak","days":14}',             2, 2, 2, 'castle/oak',           60),

  -- ----------------------------------------------------------------- light
  ('candle',           'Candle',            'Mind the tail.',                              'light',     85,   null,                                      1, 1, 2, 'candle/cream',         10),
  ('table-lamp',       'Table lamp',        'A small pool of warm light.',                 'light',     190,  null,                                      1, 1, 2, 'lamp-table/cream',     20),
  ('floor-lamp',       'Floor lamp',        'Reads over your shoulder.',                   'light',     410,  null,                                      1, 1, 2, 'lamp-floor/cream',     30),
  ('paper-lantern',    'Paper lantern',     'Glows like a moon on a stick.',               'light',     640,  null,                                      1, 1, 2, 'lantern/cream',        40),
  ('fairy-lights',     'String lights',     'Up all year. No apologies.',                  'light',     1050, '{"kind":"streak","days":7}',              1, 1, 3, 'fairylights/cream',    50),

  -- ----------------------------------------------------------------- decor
  ('trophy-shelf',     'Trophy shelf',      'Fills itself as you hit milestones.',         'decor',     0,    null,                                      1, 1, 3, 'trophyshelf/oak',      10),
  ('poster',           'Poster',            'Corners will not stay down.',                 'decor',     65,   null,                                      1, 1, 3, 'poster/teal',          20),
  ('bookstack',        'Stack of books',    'Read two of them.',                           'decor',     95,   null,                                      1, 1, 2, 'bookstack/rose',       30),
  ('wall-clock',       'Wall clock',        'Ticks quietly. Mostly.',                      'decor',     150,  null,                                      1, 1, 3, 'clock/walnut',         40),
  ('framed-photo',     'Framed photo',      'Someone you like.',                           'decor',     210,  null,                                      1, 1, 3, 'frame/oak',            50),
  ('tea-set',          'Tea set',           'For the long sessions.',                      'decor',     280,  null,                                      1, 1, 2, 'teaset/cream',         60),
  ('window-box',       'Window box',        'Flowers on the sill.',                        'decor',     600,  null,                                      1, 1, 3, 'windowbox/sage',       70),
  ('star-map',         'Star map',          'The sky on a night that mattered.',           'decor',     2100, '{"kind":"lifetime_hours","hours":50}',    1, 1, 3, 'starmap/char',         80)

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

-- Everyone starts with the free items already owned, so a brand-new room has a
-- floor, walls, and somewhere for trophies to land.
create or replace function public.grant_starter_items(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.inventory (user_id, item_id)
  select p_user, id from public.catalog_items where price = 0
  on conflict (user_id, item_id) do nothing;

  -- Place the free floor and walls; everything else the user arranges.
  insert into public.room_layout (user_id, item_id, grid_x, grid_y, rotation, z_index)
  select p_user, id, 0, 0, 0, 0
    from public.catalog_items
   where slug in ('pine-floor', 'plaster-wall')
     and not exists (
       select 1 from public.room_layout r
        where r.user_id = p_user and r.item_id = catalog_items.id
     );
end;
$$;

revoke all on function public.grant_starter_items(uuid) from public, anon, authenticated;
