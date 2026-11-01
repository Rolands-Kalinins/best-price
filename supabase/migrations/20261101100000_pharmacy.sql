-- Раздел «аптеки»: весь каталог аптек и история цен. Отдельная схема, как grocery (изоляция разделов, docs/PLAN.md).
-- Только добавление: старому коду не мешает.
create schema pharmacy;

-- Товар = позиция каталога аптеки. Ключ (source_id, external_id): тот же товар обновляется на месте.
create table pharmacy.products (
  id           bigint generated always as identity primary key,
  source_id    bigint not null references public.sources (id) on delete cascade,
  external_id  text not null,
  title        text not null,
  brand        text,
  packaging    text,
  price        numeric(10,2) not null check (price > 0),
  old_price    numeric(10,2) check (old_price > 0),
  starts_at    timestamptz,
  ends_at      timestamptz,
  ean          text,
  url          text,
  image_url    text,
  category     text,                                  -- путь категории, как отдаёт магазин
  cat          text,                                  -- наша категория по смыслу (slug из core), заполняет matcher
  prescription boolean not null default false,        -- рецептурный препарат: помечаем, не отбрасываем
  in_stock     boolean not null default true,
  last_seen_at timestamptz not null default now(),
  unique (source_id, external_id)
);
create index products_ean_idx on pharmacy.products (ean) where ean is not null;
create index products_cat_idx on pharmacy.products (cat);

-- Не больше одной строки в день на товар, пишется только при изменении цены (как grocery.price_history).
create table pharmacy.price_history (
  product_id bigint not null references pharmacy.products (id) on delete cascade,
  day        date not null default current_date,
  price      numeric(10,2) not null,
  primary key (product_id, day)
);

create function pharmacy.log_price() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' or old.price is distinct from new.price then
    insert into pharmacy.price_history (product_id, price) values (new.id, new.price)
    on conflict (product_id, day) do update set price = excluded.price;
  end if;
  return new;
end;
$$;

create trigger products_log_price
  after insert or update of price on pharmacy.products
  for each row execute function pharmacy.log_price();

-- RLS: читают участники из белого списка, пишет только service_role (обходит RLS).
alter table pharmacy.products      enable row level security;
alter table pharmacy.price_history enable row level security;

create policy products_select on pharmacy.products
  for select to authenticated using (public.is_member());
create policy price_history_select on pharmacy.price_history
  for select to authenticated using (public.is_member());

grant usage on schema pharmacy to authenticated, service_role;
grant select on all tables in schema pharmacy to authenticated;
grant all on all tables in schema pharmacy to service_role;

-- Открываем схему для PostgREST (supabase-js).
alter role authenticator set pgrst.db_schemas = 'public, graphql_public, grocery, pharmacy';
notify pgrst, 'reload config';
