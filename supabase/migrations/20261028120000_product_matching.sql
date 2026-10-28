-- Сопоставление одного товара в разных магазинах (FR-37…FR-39). Только добавление: старый код не затронут.

-- Товар = группа акций разных магазинов с одинаковым ключом (бренд | размер | условие | слова), см. match.ts в @bestprice/core.
create table grocery.products (
  id    bigint generated always as identity primary key,
  key   text not null unique,
  title text not null
);

alter table grocery.offers add column product_id bigint references grocery.products (id) on delete set null;
create index offers_product_id_idx on grocery.offers (product_id);

-- Решения админа по паре ключей (не по id акции: ключ Maxima меняется каждую неделю). key_a < key_b.
create table grocery.match_decisions (
  key_a      text not null,
  key_b      text not null,
  same       boolean not null,
  decided_at timestamptz not null default now(),
  primary key (key_a, key_b),
  check (key_a < key_b)
);

-- Предположения алгоритма: перезаписываются при каждом запуске. На сайт не попадают, пока админ не решит.
create table grocery.match_suggestions (
  key_a     text not null,
  key_b     text not null,
  offer_ids bigint[] not null,
  primary key (key_a, key_b),
  check (key_a < key_b)
);

alter table grocery.products          enable row level security;
alter table grocery.match_decisions   enable row level security;
alter table grocery.match_suggestions enable row level security;

create policy products_select on grocery.products
  for select to authenticated using ((select public.is_member()));
create policy match_decisions_admin on grocery.match_decisions
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy match_suggestions_select on grocery.match_suggestions
  for select to authenticated using ((select public.is_admin()));

grant select on grocery.products, grocery.match_suggestions to authenticated;
grant select, insert, update, delete on grocery.match_decisions to authenticated;
grant all on grocery.products, grocery.match_decisions, grocery.match_suggestions to service_role;
