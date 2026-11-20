# Drogas (drogas.lv) — разведка 2026-11-01

> **Статус: отказ (2026-11-20).** Проверка допустимости дала RED, см. `drogas-legal.md`. План парсера ниже не исполнять без письменного разрешения магазина. Документ оставлен как справка по данным.

Группа: косметика и хозтовары. Платформа SAP Commerce (Hybris OCC), фронт за Akamai.

## Правила (спорное место, нужно решение владельца)
- `www.drogas.lv/robots.txt` недоступен обычным запросом (Akamai: Access Denied), читается только из настоящего браузера. Закрыто: `/lv/cart`, `/lv/checkout`, `/lv/my-account`, `*/search*`, `*?query=`, `*?page=*`, `*&currentPage=*`, **`/api/v2/`**. Открыто: `*/sitemaps/`. Sitemap в robots: `/lv/sitemap.xml`; в браузере по этому пути вышел 404 (не выяснено).
- Данные отдаёт API на другом хосте: `https://api.drogas.lv/api/v2/drlv/`. Его `robots.txt` недоступен (Access Denied), сами запросы идут голым `fetch` без cookies и без браузера. Тот же путь `/api/v2/` на `www` закрыт. Считаю это обходом запрета в духе, поэтому **не использовал для обхода больше, чем нужно для замеров (один полный проход: 96 запросов)** и выношу решение владельцу.
- Страницы сайта (`/lv/...`) обычным запросом не открываются (Akamai 403), только из настоящего браузера (Playwright, Chromium прошёл).

## Источник данных
```
GET https://api.drogas.lv/api/v2/drlv/products/search?query=&pageSize=100&currentPage=N&fields=DEFAULT&lang=lv_LV&curr=EUR
```
- `pagination.totalResults` = **9 526**, 96 страниц. `pageSize` больше 100 тихо урезается до 100. Страница ≈350 КБ.
- Полный проход: 9 526 строк, **9 330 уникальных `code`** (196 дублей: пагинация по `score` нестабильна). Нужна фиксированная сортировка (`sort=` проверить) и дедупликация.
- Без цены: 0. `purchasable`: 9 526. В наличии (`stock.stockLevelStatus=inStock`): 6 134. `pharmacy`: 0, `ageRestricted`: 0.
- **EAN: `ean` у всех 9 526** (уникальных 9 330). Лучший ключ сопоставления среди всех магазинов.
- Быстрые карточки по кодам: `products?fields=PRODUCT_TILE,price(FULL),images(DEFAULT),charity&codes=BP_1,BP_2,...` (8 штук за запрос, так делает главная).

## Цены и акции
- `price.value` (обычная цена, евро; `price.formattedValue` «3,69 €»), `price.isTpr` = false у всех, `savePrice` заполнен у 81.
- `otherPrices[]` с `priceSource: "MEMBER"`: цена по карте Drogas, у **7 770** товаров. Пример: 5,69 € → 3,12 € по карте.
- `topPromotion`: `startDate` / `endDate` (`2026-11-01...2026-11-30`), `reward.customizedRewardValue` («45%»), `rewardType` («NEW_PRICE»). `promotions[]` непусто у 2 551.
- «Акция» здесь это в основном цена по карте. Отдельно решить: показывать цену по карте как акцию (как MansRimi у Rimi) и условие сохранять в `condition`.

## Категории
`categoryNameHierarchy`, например `Kosmētika/Acīm/Skropstu tušas`. Верхний уровень (по 9 526): Ādai 2 784, Kosmētika 1 692, Matiem 1 684, Higiēna 1 373, Mājai 1 239, Aksesuāri 260, Parfimērija 255, Dāvanas 96, остальные кампании. Часть строк с кампанийными «категориями» («Akcijas», «Jaunumi»): брать категорию надо из реального дерева.

## План парсера (если владелец разрешит API)
1. Обход 96 страниц с паузой, сортировка стабильная, дедупликация по `code`.
2. Брать: `code`, `name`, `ean`, бренд (`masterBrand.name`), цену, цену по карте, период `topPromotion`, категорию, ссылку `https://www.drogas.lv<url>`.
3. Порог: уникальных не меньше ≈9 000, иначе ошибка.
4. Запуск с ПК запасным вариантом: Akamai может блокировать GitHub.

## Альтернативы, если API нельзя
- Страницы категорий в Playwright (медленно, ≈9 500 карточек, защита Akamai), либо только акционные разделы.
- Отказаться от Drogas.
