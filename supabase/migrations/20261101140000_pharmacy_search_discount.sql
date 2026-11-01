-- Поиск и сортировка страницы «Аптеки»: те же вычисляемые столбцы, что у grocery.offers (миграция offers_scale). Только добавление.
alter table pharmacy.products
  -- Название и бренд без регистра и диакритики; запрос нормализуется теми же заменами (core: SEARCH_FROM, SEARCH_TO).
  add column search text generated always as (
    lower(translate(title || ' ' || coalesce(brand, ''), 'āčēģīķļņšūžäöüõ', 'acegiklnsuzaouo'))
  ) stored,
  -- Скидка в процентах по старой цене; null, если старой цены нет или скидка меньше 1%.
  add column discount smallint generated always as (
    case when old_price > price and round((1 - price / old_price) * 100) >= 1
         then round((1 - price / old_price) * 100)::smallint end
  ) stored;

-- Лента сортируется по скидке и цене, отбор по магазину и категории.
create index products_discount_idx on pharmacy.products (discount desc nulls last);
create index products_source_idx on pharmacy.products (source_id);

-- Политики читают is_member() один раз на запрос, а не на каждую строку (как у grocery после offers_scale).
drop policy products_select on pharmacy.products;
create policy products_select on pharmacy.products
  for select to authenticated using ((select public.is_member()));
drop policy price_history_select on pharmacy.price_history;
create policy price_history_select on pharmacy.price_history
  for select to authenticated using ((select public.is_member()));
