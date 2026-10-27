-- Масштаб: страница листает акции на сервере (тысячи строк), а не фильтрует их в браузере.

-- Скидка в целых процентах: процент скидки на бренд или расчёт по старой цене (как offerDiscount в @bestprice/core).
-- Поиск: название и бренд без регистра и диакритики (те же замены, что searchTerms в @bestprice/core).
alter table grocery.offers
  add column discount smallint generated always as (
    coalesce(
      discount_percent,
      case when price is not null and old_price > price and round((1 - price / old_price) * 100) >= 1
           then round((1 - price / old_price) * 100)::smallint end
    )
  ) stored,
  add column search text generated always as (
    lower(translate(title || ' ' || coalesce(brand, ''), 'āčēģīķļņšūžäöüõ', 'acegiklnsuzaouo'))
  ) stored;

-- (select ...) считается один раз на запрос, а не на каждую строку.
drop policy offers_select on grocery.offers;
create policy offers_select on grocery.offers
  for select to authenticated using ((select public.is_member()));
drop policy price_history_select on grocery.price_history;
create policy price_history_select on grocery.price_history
  for select to authenticated using ((select public.is_member()));

-- Поиск идёт по like '%слово%' с последовательным чтением: до десятков тысяч строк это миллисекунды.
-- ponytail: триграммный индекс (pg_trgm, gin) на search, когда строк станет больше 50 тысяч.
