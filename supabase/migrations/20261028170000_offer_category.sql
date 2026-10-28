-- Категория акции для фильтра на странице («молочные», «мясо» и т.д.). Только добавление: старый код столбец не видит.
-- Значение — slug из CATEGORIES (packages/core/src/categories-data.ts); null = ещё не раскладывали, 'other' = ни одна основа не подошла.
-- Ставит шаг categorize после парсеров (packages/matcher), парсеры столбец не трогают: upsert перечисляет столбцы явно.
-- Индекса нет: поиск по search тоже читает таблицу последовательно, до десятков тысяч строк это миллисекунды.
alter table grocery.offers add column cat text;
comment on column grocery.offers.cat is 'slug категории из CATEGORIES (@bestprice/core); null — не раскладывали, other — ничего не подошло';
