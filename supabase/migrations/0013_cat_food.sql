-- 0013_cat_food.sql
-- Food for the cat: small treats, two to eight coins each, bought and eaten on
-- the spot. Unlike catalog items they are not kept, so they live in their own
-- price list and never touch `inventory` or `room_layout`.
--
-- Feeding only ever spends coins, but it still goes through a SECURITY DEFINER
-- function: the wallet has no write policy, and the price is read from this
-- table, never from the client.

alter type public.transaction_reason add value if not exists 'treat';

-- ------------------------------------------------------------- cat_foods --

create table if not exists public.cat_foods (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  description text,
  price       int not null,
  art_key     text not null,
  sort_order  int not null default 0,

  constraint cat_foods_price check (price between 2 and 8)
);

alter table public.cat_foods enable row level security;

-- A public price list, like the catalog.
drop policy if exists cat_foods_select_all on public.cat_foods;
create policy cat_foods_select_all on public.cat_foods
  for select to anon, authenticated using (true);

revoke insert, update, delete on public.cat_foods from anon, authenticated;

insert into public.cat_foods (slug, name, description, price, art_key, sort_order)
values
  ('kibble',         'Kibble',          'A handful of crunchies. Reliable.',        2, 'kibble',   10),
  ('fish-biscuits',  'Fish biscuits',   'Little fish-shaped ones. Gone in seconds.', 3, 'biscuits', 20),
  ('chicken-bites',  'Chicken bites',   'Poached, shredded, accepted.',             4, 'chicken',  30),
  ('sardine',        'Sardine',         'One whole sardine. Eaten head first.',     5, 'sardine',  40),
  ('tuna',           'Tuna',            'The sound of the tin opening is half of it.', 6, 'tuna',   50),
  ('salmon',         'Salmon',          'A pink flake of pure luxury.',             8, 'salmon',   60)
on conflict (slug) do update set
  name        = excluded.name,
  description = excluded.description,
  price       = excluded.price,
  art_key     = excluded.art_key,
  sort_order  = excluded.sort_order;

-- -------------------------------------------------------------- feed_cat --

create or replace function public.feed_cat(p_food_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user   uuid := auth.uid();
  v_food   public.cat_foods;
  v_coins  bigint;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_food from public.cat_foods where id = p_food_id;
  if not found then
    raise exception 'unknown food' using errcode = 'P0002';
  end if;

  -- Lock the wallet row for the whole check-and-debit.
  select coins into v_coins from public.wallet where user_id = v_user for update;
  if v_coins is null or v_coins < v_food.price then
    raise exception 'not enough coins' using errcode = '23514';
  end if;

  update public.wallet
     set coins = coins - v_food.price, updated_at = now()
   where user_id = v_user;

  insert into public.transactions (user_id, delta, reason, ref_id)
  values (v_user, -v_food.price, 'treat', p_food_id);

  return jsonb_build_object(
    'food_id', p_food_id,
    'spent', v_food.price,
    'coins', v_coins - v_food.price
  );
end;
$$;

revoke all on function public.feed_cat(uuid) from public, anon;
grant execute on function public.feed_cat(uuid) to authenticated;
