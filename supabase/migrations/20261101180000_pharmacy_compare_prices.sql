-- Сравнение цен аптек: тот же товар по штрихкоду в наличии, виденный парсером за последние 3 дня. Только добавление.
-- security invoker: RLS таблицы (is_member) действует как при обычном запросе. Массив в теле запроса, а не в адресе: на странице до 1000 товаров.
create function pharmacy.compare_prices(eans text[])
returns table (ean text, source_id bigint, price numeric, in_stock boolean, url text)
language sql stable security invoker set search_path = ''
as $$
  select p.ean, p.source_id, p.price, p.in_stock, p.url
  from pharmacy.products p
  where p.ean = any (eans) and p.in_stock and p.last_seen_at > now() - interval '3 days'
$$;
grant execute on function pharmacy.compare_prices(text[]) to authenticated, service_role;
