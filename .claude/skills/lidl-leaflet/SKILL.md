---
name: lidl-leaflet
description: Скачивание и разбор рекламного буклета Lidl через Gemini (vision) в grocery.leaflet_offers. Use when a task is about the Lidl flyer/буклет: run or debug the reader, fix wrongly read offers (цена, Lidl Plus, «2+1», фото), change the prompt or schema, check quota, or adapt the approach to another store (Etop, Maxima, Rimi).
---

# Буклет Lidl → Gemini → grocery.leaflet_offers

Код: `packages/scrapers/lidl/src/leaflet.ts` (чистая логика: схема, промпт, проверка ответа), `leaflet-run.ts` (сеть, БД, модели), тесты `leaflet.test.ts`, фикстура `fixtures/leaflet-flyer.json`. Решения и причины: `docs/PLAN.md`, раздел «Буклеты магазинов». Прежде чем чинить, просмотри `docs/findings/`.

## Откуда берётся буклет
- Обзор `https://www.lidl.lv/c/lv-LV/akciju-bukleti/s10024390` → идентификаторы `aktualais-akciju-buklets-…` (текущий и следующий, следующий виден с пятницы). Только честный `User-Agent: BestPriceBot`, заголовки не подделывать (классификатор блокирует; в браузерных проверках тоже).
- `https://endpoints.leaflets.schwarz/v4/flyer?flyer_identifier=<id>` — открытый JSON: период, `pages[].zoom` (2400 px). Товаров в нём нет, только картинки. Ссылки imgproxy подписаны и не протухают.

## Запуск
`pnpm --filter @bestprice/scraper-lidl leaflet [--dry] [--flyers=1] [--pages=4,12-15] [--force]`
- `--dry` ничего не пишет; `--flyers=1` только текущий буклет; `--pages` — выбранные страницы (дёшево проверять правку промпта); `--force` перечитать уже прочитанные (после правки промпта обязательно: страница с любой строкой считается прочитанной).
- Локально БД своя (`.env` → 127.0.0.1:54321); боевая только с явного подтверждения пользователя.
- В CI это job `lidl` в `scrape.yml` (ночью, идемпотентно: прочитанные страницы квоты не тратят). Сырые ответы модели лежат в `packages/scrapers/lidl/debug/leaflet-<дата>-p<N>.json`.

## Модели и квота
Основная `gemini-3.5-flash` (самая точная, ≈60 с/стр., часто 503), запасные `gemini-3.5-flash-lite` → `gemini-3.1-flash-lite` (`modelPool`: упавшая отдыхает 5 мин, потом основная пробуется сама). Переопределение: `GEMINI_MODEL`, `GEMINI_FALLBACK_MODELS`. Лимиты бесплатного уровня смотрит пользователь в AI Studio (3.5-flash-lite и 3.1-flash-lite 15 RPM / 500 RPD; 3.6/3.8-flash 5 RPM / 20 RPD). Расход пишется в `ai_usage` по моделям; потолок `GEMINI_MAX_REQUESTS`.

## Правила чтения (выстраданы, не ломать)
- Схема ответа: **все поля `required`**, необязательность через `nullable`. Иначе модель молча опускает цены (docs/findings/2026-10-31-leaflet-optional-fields.md).
- Названия копировать как напечатано, по-латышски, не переводить.
- Плашка «Ar Lidl Plus» (синий квадрат с логотипом «Plus» у большой цены): модель ставит `card_only=true`, а код сам меняет цены: большая → `price_card`, зачёркнутая → `price`. Без зачёркнутой цена остаётся, условие «Lidl Plus». Правило выражено булевым полем схемы, потому что слабая `3.5-flash-lite` прозу промпта не выполняла (docs/findings/2026-10-31-leaflet-lidl-plus-multibuy.md). Две цены на плитке сразу: обычная в `price`, по карте в `price_card`.
- «2. precei» (плитка «PĒRKOT 1 GAB.» и цена второго товара ниже): это условие, а не скидка. `second_price` в схеме, `price` за один товар, процента и «по карте» нет; на сайте цена второго в условии.
- Скидка на группу без цены: `kind=category` с процентом. «2+1», «4+2» без цены и процента: `kind=category`, суть в `condition`.
- Срок плитки по плашке секции («No sestdienas, 31.10., līdz 01.11.»), иначе срок буклета.
- `photo_box` = [ymin, xmin, ymax, xmax] 0–1000 фото товара; админка режет страницу CSS (`cropStyle`), сайту нужны миниатюры (`leaflet_thumbs`, см. «На сайт»). Поля вокруг рамки не добавлять: в кадр лезут ценники.
- Модели не доверяем: `toLeafletOffers` отбрасывает цену 0/>10 000 €, товар без цены, процент не сходящийся с ценами (допуск 2 п.п.), категорию без процента и без условия. Отброшенное печатается в логе.

## На сайт
В конце запуска `siteOffers` (core) зеркалит действующие записи в `grocery.offers`: лента, категории, сопоставление работают как для других магазинов. Цена по карте = цена акции + условие «Lidl Plus»; «2+1» без цены не зеркалится; дубли склеиваются; старые акции Lidl закрываются `ends_at = сейчас`. Ссылки на буклет у карточки нет. Фото: шаг «Миниатюры» режет фото по `photo_box` (`sharp`) в `leaflet_thumbs`, `image_url` = `/grocery/img/<источник>/<ключ>` (route в apps/web), добирается и для ранее прочитанного без Gemini. После перечитки локально: `pnpm leaflet --flyers=1`, затем `pnpm --filter @bestprice/matcher categorize`, проверка `http://localhost:3001/grocery?store=1`. Браузер кэширует страницу: после смены данных перезагрузить (F5).

## Проверка глазами
Админка `/grocery/admin/leaflet` (локально порт 3001 после `pnpm db:pull` и входа dev@bestprice.local): страница буклета слева, прочитанное справа, рядом фото-вырезка и модель, прочитавшая страницу. Сверяй страницы с плотными плитками и пустые страницы (рекламные плакаты и купоны пусты правильно).

## Дальше / другой магазин
Etop: прямые PDF. Maxima, Rimi: картинки ipaper.io (у Maxima в robots.txt ai-train=no: решает пользователь). Тот же `toLeafletOffers`/промпт, меняется только добыча страниц (`parseFlyer`-аналог) и правила карты лояльности. Перед кодом: skill `site-recon`.
