-- Цена по карте магазина (клуб Euroaptieka, «Veselība» Mēness): отдельно от price, который для всех. Только добавление столбцов.
alter table pharmacy.products
  add column card_price     numeric(10,2) check (card_price > 0),
  add column card_condition text,               -- условие, например «Iepērkoties vismaz 9 EUR vērtībā»
  add column card_starts_at timestamptz,
  add column card_ends_at   timestamptz;
