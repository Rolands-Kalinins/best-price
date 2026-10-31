-- Акции из рекламных буклетов магазинов (читает Gemini по картинкам страниц). Только добавление.
-- Отдельная таблица, не grocery.offers: данные буклета менее надёжны (чтение с картинки), и сравнивать их с ценами сайта надо, а не смешивать.
-- Один буклет = много строк; одна таблица на все магазины, магазин в source_id (новый магазин не требует миграции).
create table grocery.leaflet_offers (
  id               bigint generated always as identity primary key,
  source_id        bigint not null references public.sources (id) on delete cascade,
  flyer_id         text not null,
  page             int not null check (page > 0),
  -- Хэш (буклет, страница, название, размер, цены): тот же товар при повторном запуске обновляется на месте.
  external_id      text not null,
  title            text not null,
  brand            text,
  packaging        text,
  price            numeric(10,2) check (price > 0),
  old_price        numeric(10,2) check (old_price > 0),
  -- Цена по карте магазина (Lidl Plus), когда на плитке две цены; price тогда цена для всех.
  price_card       numeric(10,2) check (price_card > 0),
  -- Цена второго товара по условию «2. precei» (первый по price): условие, а не скидка.
  price_second     numeric(10,2) check (price_second > 0),
  discount_percent smallint check (discount_percent between 1 and 100),
  unit_price       numeric(10,2) check (unit_price > 0),
  unit             text check (unit in ('kg', 'l')),
  condition        text,
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  url              text not null,
  -- Картинка страницы буклета: рядом с таблицей админ сверяет глазами, что прочитал Gemini.
  page_image_url   text,
  -- Какая модель Gemini прочитала страницу: при перегрузке основной её подхватывает запасная, качество у моделей разное.
  model            text,
  -- Рамка фото товара на странице [ymin, xmin, ymax, xmax] в долях 0–1000: страницу режет браузер (CSS), своих картинок не храним.
  photo_box        smallint[] check (cardinality(photo_box) = 4),
  last_seen_at     timestamptz not null default now(),
  unique (source_id, external_id),
  -- Как у offers: скидка на категорию («−30% на молотый кофе Bellarom») без цены, но с процентом; или акция «2+1» без обоих, суть в condition.
  check (price is not null or discount_percent is not null or condition is not null),
  check (starts_at <= ends_at)
);
create index leaflet_offers_flyer_idx on grocery.leaflet_offers (source_id, flyer_id, page);

alter table grocery.leaflet_offers enable row level security;
-- Пока данные черновые (читает модель, точность проверяется): видит только админ. Участникам откроем, когда буклеты пойдут на сайт.
create policy leaflet_offers_select on grocery.leaflet_offers for select to authenticated using ((select public.is_admin()));
grant select on grocery.leaflet_offers to authenticated;
grant all on grocery.leaflet_offers to service_role;

-- Список прочитанных буклетов для страницы админа: период = самая ранняя и самая поздняя дата плиток. Права и RLS берутся у вызывающего.
create view grocery.leaflet_flyers with (security_invoker = true) as
select source_id, flyer_id, min(starts_at) as starts_at, max(ends_at) as ends_at, count(*)::int as offers, count(distinct page)::int as pages
from grocery.leaflet_offers
group by source_id, flyer_id;
grant select on grocery.leaflet_flyers to authenticated;
grant all on grocery.leaflet_flyers to service_role;

-- Миниатюры фото товаров: парсер режет их из страницы буклета по photo_box (sharp, ≈10 КБ webp) и кладёт сюда; сайт отдаёт через
-- /grocery/img/<магазин>/<ключ>. Свои картинки вместо ссылок на сервер магазина: тот не выдерживает 60 страниц по 2400 px разом.
-- Читают участники (картинки идут в общую ленту), в отличие от самих записей буклета.
create table grocery.leaflet_thumbs (
  source_id   bigint not null,
  external_id text not null,
  photo       bytea not null,
  primary key (source_id, external_id),
  foreign key (source_id, external_id) references grocery.leaflet_offers (source_id, external_id) on delete cascade
);
alter table grocery.leaflet_thumbs enable row level security;
create policy leaflet_thumbs_select on grocery.leaflet_thumbs for select to authenticated using ((select public.is_member()));
grant select on grocery.leaflet_thumbs to authenticated;
grant all on grocery.leaflet_thumbs to service_role;
