# Кнопка «Убрать» падала: upsert требует права UPDATE

## Что случилось
На странице «Сопоставление товаров» кнопка «Убрать из сопоставления» бросала `permission denied for table match_exclusions`, страница показывала «Не удалось загрузить акции».

## Почему возникло
Действие `exclude` писало через `.upsert()`, а это `INSERT … ON CONFLICT DO UPDATE`: ему нужно право UPDATE. В миграции `match_exclusions` я выдал роли `authenticated` только select, insert, delete. Проверял я через сервисную роль и SQL с правами владельца, оба обходят проверку прав и RLS, поэтому ошибку не увидел.

## Как исправлено
Вставка «если ещё нет»: `upsert(..., { ignoreDuplicates: true })` (`ON CONFLICT DO NOTHING`, нужен только insert). Миграция не понадобилась. Под ролью `authenticated` с токеном админа (имитация в SQL с откатом): `DO UPDATE` даёт `permission denied`, `DO NOTHING` проходит.

## Как повлияло на остальной код
Другие записи из браузерной сессии: `match_decisions` (upsert, право UPDATE выдано) и «Вернуть» (delete, право выдано), проверено списком прав `information_schema.role_table_grants`, не вызовом. Остальные вызовы сайта к БД только читают.

## Как не допустить снова
Запись, которую делает браузерная сессия, проверять под ролью `authenticated` (в SQL: `set local role authenticated` и `request.jwt.claims` с `sub` и `email` админа, внутри `begin … rollback`), а не сервисным ключом. Для `upsert` сверять, что у роли есть и INSERT, и UPDATE, или брать `ignoreDuplicates`.
