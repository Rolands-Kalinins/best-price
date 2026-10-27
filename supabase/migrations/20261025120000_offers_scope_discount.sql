-- Скидка на бренд или категорию («−30% на всю продукцию MILKA», Maxima): конкретной цены у неё нет.
-- Такая акция хранится в той же таблице: price пустой, discount_percent заполнен.
alter table grocery.offers
  alter column price drop not null,
  add column discount_percent smallint check (discount_percent between 1 and 100),
  add constraint offers_price_or_discount check (price is not null or discount_percent is not null);

-- Истории цен у акции без цены нет: пропускаем, иначе вставка в price_history (price not null) упадёт.
create or replace function grocery.log_price() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.price is not null and (tg_op = 'INSERT' or old.price is distinct from new.price) then
    insert into grocery.price_history (offer_id, price) values (new.id, new.price)
    on conflict (offer_id, day) do update set price = excluded.price;
  end if;
  return new;
end;
$$;
