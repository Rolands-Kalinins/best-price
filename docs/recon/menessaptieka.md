# Mēness aptieka (разведка 2026-11-01)

Группа: аптеки. Адрес из задания `menessaptieka.lv` это корпоративный сайт (аптеки, статьи, газета), цен там нет. **Магазин: `https://e-menessaptieka.lv`** (Nuxt, за Cloudflare).

## Правила
- `e-menessaptieka.lv/robots.txt` и `api.e-menessaptieka.lv/robots.txt`: закрыт только `/upload/*`. Sitemap: `/sitemap/sitemap.xml` (статьи, страницы, категории; товаров в нём нет).
- Корпоративный `menessaptieka.lv/robots.txt`: `Disallow: /*?*=*` (к магазину не относится).

## Источник данных: JSON-API, работает голым `fetch` без cookies
```
GET https://api.e-menessaptieka.lv/api/v2/shop/search/products?itemsPerPage=100&page=N
Accept: application/json
```
- `meta.totalItems` = **10 221** (позже 10 220), `lastPage` при 100 на страницу = 103. Ответ: `{links, meta, data[]}`.
- **Глубже 10 000 результатов поиск не отдаёт** (Elasticsearch, `from + size ≤ 10000`): страница 100 отвечает, страница 101 даёт HTTP 400. Поэтому обход идёт ценовыми диапазонами `price[min]=0&price[max]=500` (центы, границы включены); в каждом меньше 10 000 (`docs/findings/2026-11-01-meness-result-window.md`). Сортировка `order[price]=asc|desc` тоже работает. Реализовано в 2.0.0.0.
- `itemsPerPage=300` даёт `500 Internal Server Error`; 100 работает (3.7 МБ на страницу, ≈1.2 с). 2 на страницу = 250 КБ: тяжёлые вложенные поля (`mainTaxon.description` с HTML на 30 КБ), на размер страницы это не влияет, весь обход ≈390 МБ.
- Похожий `simplified-search/products` отдаёт то же самое (размер тот же), выигрыша нет.
- Фильтры в `meta.filters` (бренды со счётчиками, `priceRange`, `catalogPromotions`), `meta.availableTaxons`. Параметры фильтрации не проверялись (можно искать, как отобрать только акции).

## Поля товара (`data[]`)
`code` (внутренний артикул, стабилен), `name`, `slug`, `enabled`, `bundle`, `mainTaxon`, `productTaxons[{name,slug}]` (путь категории, например `vitamini-un-mineralvielas/vitamini/d-vitamins`), `attributeValues[]` (brand, unit-of-measure, form, receipt, otc-medicine, food-supplement, compensation, ...), `defaultVariant`:
- `prices.price` (в центах: 899 = 8,99 €), `prices.originalPrices[]`, `prices.discountPercentages[]`, `prices.startsAt` / `endsAt` (период акции, `"2026-10-01 00:00:00"`), `prices.lowest30DayPrice`, цена по карте лояльности `loyaltyCatalogPromotion*`.
- `stock`, `inStock`, `barcode`.

## Охват (выборка, 100 товаров со страницы 3)
- `barcode`: **0 из 100** (поле всегда `null` в выборке). EAN нет: сопоставление по бренду/размеру (бренд в атрибуте `brand`, размер в названии и `unit-of-measure`).
- С `originalPrices`: 50 из 100 на этой странице (по всему каталогу не считали).
- Атрибут `receipt` / `otc-medicine`: у 63–64 из 100 заполнен; рецептурные нужно отсекать по `receipt`.

## План парсера
1. Обход страниц 1..`lastPage` по 100, пауза 300–500 мс, повтор при 5xx (как в `findings/2026-10-29-maxima-fetch-no-retry.md`).
2. Брать: `code`, `name`, цену, `originalPrices[0]`, период, бренд, путь категории, `inStock`, ссылку `https://e-menessaptieka.lv/p/<slug>` (шаблон ссылки проверить).
3. Отсекать `receipt`, `enabled=false`, без цены. Защита от оборванного обхода: итог должен быть близок к `totalItems`.
4. Фикстура: 2–3 товара со страницы (с акцией и без), без HTML-описаний.

## Риски
- Один запрос 3.7 МБ: уложиться в память несложно, но парсить потоково не нужно.
- API не публичный контракт: может смениться версия (`/api/v2/`).
- Cloudflare: из Actions не проверялось.
- Страница товаров нестабильна при пагинации во время обновления каталога (на Drogas видели 196 дублей из 9 526), дедуплицировать по `code`.
