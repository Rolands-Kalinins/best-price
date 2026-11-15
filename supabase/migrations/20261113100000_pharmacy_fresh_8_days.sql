-- Окно свежести аптек 3 → 8 дней (в коде `STALE_DAYS` в pharmacy-view.ts): аптеки парсятся 3 раза в неделю, карточки Apotheka раз в неделю.
-- Та же сигнатура и права, только тело: старый код работает. Применять до слияния кода.
create or replace function pharmacy.group_members(gids bigint[])
returns table (id bigint, group_id bigint, source_id bigint, title text, price numeric, old_price numeric, discount smallint, card_price numeric, card_condition text,
               card_starts_at timestamptz, card_ends_at timestamptz, prescription boolean, url text, image_url text)
language sql stable security invoker set search_path = ''
as $$
  select p.id, p.group_id, p.source_id, p.title, p.price, p.old_price, p.discount, p.card_price, p.card_condition, p.card_starts_at, p.card_ends_at,
         p.prescription, p.url, p.image_url
  from pharmacy.products p
  where p.group_id = any (gids) and p.in_stock and p.last_seen_at > now() - interval '8 days'
$$;
