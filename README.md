# BestPrice

Личный проект: сравнение акционных цен в латвийских магазинах (продукты, аптеки). Парсеры собирают акции в Supabase, сайт на Next.js показывает их и сопоставляет одинаковые товары между магазинами.

Монорепозиторий (pnpm): `apps/web` (сайт), `packages/core` (общая логика), `packages/matcher` (сопоставление товаров), `packages/scrapers/*` (по пакету на магазин). Архитектура и решения: [docs/PLAN.md](docs/PLAN.md), требования: [tasks/prd-bestprice.md](tasks/prd-bestprice.md), история версий: [docs/CHANGELOG.md](docs/CHANGELOG.md).

## Запуск локально

Нужны Node 24, pnpm и Docker.

```
pnpm install
pnpm db:start        # локальный Supabase; ключи покажет pnpm db:status
pnpm dev             # переменные: apps/web/.env.local (образец: .env.example)
pnpm test
```

Вход на сайт через Google; локально можно войти по паролю из `supabase/seed.sql` (только локальная БД).

## Парсеры

Честный `User-Agent`, соблюдение `robots.txt`, защиту магазинов не обходим (см. [docs/PLAN.md](docs/PLAN.md)). Данные в `fixtures/` пакетов парсеров: небольшие образцы ответов магазинов для тестов формата.

Секреты (`SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`) лежат только в GitHub Secrets и локальном `.env`, в репозиторий не попадают.

## Лицензия

Лицензия не выбрана: по умолчанию все права сохранены за автором. Код открыт для чтения.
