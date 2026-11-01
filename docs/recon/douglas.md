# Douglas (douglas.lv) — разведка 2026-11-01

Группа: косметика и парфюмерия. Собственная платформа (PHP, Tealium), страницы рендерятся на сервере, обычный `fetch` проходит. API не видно: скролл и пагинация идут обычными ссылками.

## Правила
`robots.txt`: закрыты `/admin/`, `/render/`, `/wysiwyg/`, `/res/check_card_balance`, `/res/apptrack`. Каталог открыт. Sitemap `/lv/sitemap.xml` (149 адресов, только страницы и кампании, товаров в нём нет) и эстонский `douglas.ee`.

## Список (то, что парсим)
```
GET https://www.douglas.lv/lv/katalogs/?&page_size=100&page=N
```
- Размеры страницы: 20, 40, **100** (проверено на `make-up`: 100 плиток; без параметра 20).
- Пагинатор `?&page=N`; на `/lv/katalogs/` последняя страница при 20 на страницу = **710**, то есть ≈14 200 товаров (при 100 на страницу ≈142 запроса по ≈1 МБ+). Разделы для сверки: `make-up` 171 страница (≈3 400), `smarzas` (духи) 119 (≈2 400), `outlet` 33 (≈650).
- Сверка вторым источником не сделана (счётчик товаров на странице не найден).

## Плитка (`div.product_element`)
`a[data-tealium-info]` — JSON с полями: `primary_product_id`, `primary_product_master_id`, `primary_product_brand`, `primary_product_name`/`master_name`, `primary_product_classification` (тип: «Birstošais pūderis»), `primary_product_maincategory`, `primary_product_size` («6.00 g»), `primary_product_variant_name`, `primary_product_price_regular`, `primary_product_price`, `primary_product_onsale` («0»/«1»), `primary_product_availability_status`, **`snd_product_id`** (12 цифр, «871341355510»). Также `data-productclick` в блоках главной.
- У каждого товара есть и вариант (оттенок, объём): цена и EAN у варианта, одна плитка = один вариант с `?item=71869`.
- Доля акционных в выборке: `outlet` 20 из 20 (`onsale=1`), `make-up` 0–3 из 100.
- Раздел акций: главная («Akcija»), `/lv/outlet/`, `/lv/izdevigi/` (на момент замера пустой), кампании (`black-friday`, `singles-day`).

## EAN
`snd_product_id` у всех проверенных плиток (20/20, 100/100) заполнен, но это **12 цифр**, у EAN-13 их 13. Возможно, это UPC или EAN без ведущего нуля или внутренний код. Сверить на пересечении с Drogas (EAN есть), прежде чем использовать как ключ.

## План парсера
1. Обход `/lv/katalogs/?&page_size=100&page=N` до пустой страницы, пауза, повтор при ошибке.
2. Разбор `data-tealium-info`: бренд, название, размер, регулярная и текущая цена, `onsale`, код.
3. Порог по числу товаров (≈14 000), дедупликация по коду варианта.
4. Фикстура: HTML на 100 плиток, плитка с `onsale=1`.

## Риски
14 тыс. товаров × варианты; 142 запроса по ≈1–2 МБ; блокировка IP не проверялась; EAN под вопросом; нет периодов акций.
