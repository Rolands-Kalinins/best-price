-- Раздел «продукты»: акции магазинов и история цен (FR-10, FR-35).
create schema grocery;

-- Акция = товар магазина. Ключ (source_id, external_id): тот же товар в новую неделю обновляется на месте.
create table grocery.offers (
  id           bigint generated always as identity primary key,
  source_id    bigint not null references public.sources (id) on delete cascade,
  external_id  text not null,
  title        text not null,
  brand        text,
  packaging    text,
  price        numeric(10,2) not null check (price > 0),
  old_price    numeric(10,2) check (old_price > 0),
  unit_price   numeric(10,2) check (unit_price > 0),
  unit         text check (unit in ('kg', 'l')),
  condition    text,
  starts_at    timestamptz,
  ends_at      timestamptz,
  ean          text,
  url          text,
  image_url    text,
  category     text,
  last_seen_at timestamptz not null default now(),
  unique (source_id, external_id)
);
create index offers_ends_at_idx on grocery.offers (ends_at);

-- Не больше одной строки в день на товар, пишется только при изменении цены (FR-35).
create table grocery.price_history (
  offer_id bigint not null references grocery.offers (id) on delete cascade,
  day      date not null default current_date,
  price    numeric(10,2) not null,
  primary key (offer_id, day)
);

create function grocery.log_price() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' or old.price is distinct from new.price then
    insert into grocery.price_history (offer_id, price) values (new.id, new.price)
    on conflict (offer_id, day) do update set price = excluded.price;
  end if;
  return new;
end;
$$;

create trigger offers_log_price
  after insert or update of price on grocery.offers
  for each row execute function grocery.log_price();

-- RLS: читают участники из белого списка, пишет только service_role (обходит RLS).
alter table grocery.offers        enable row level security;
alter table grocery.price_history enable row level security;

create policy offers_select on grocery.offers
  for select to authenticated using (public.is_member());
create policy price_history_select on grocery.price_history
  for select to authenticated using (public.is_member());

grant usage on schema grocery to authenticated, service_role;
grant select on all tables in schema grocery to authenticated;
grant all on all tables in schema grocery to service_role;

-- Открываем схему для PostgREST (supabase-js).
alter role authenticator set pgrst.db_schemas = 'public, graphql_public, grocery';
notify pgrst, 'reload config';
