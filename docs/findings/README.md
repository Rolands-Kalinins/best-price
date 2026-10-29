# Журнал ошибок

Ошибки, которые мы нашли в своём коде и исправили. Перед работой над проблемой посмотри здесь, нет ли похожей. Формат файла и правила: раздел «Журнал ошибок» в `CLAUDE.md`.

| Дата | Файл | Симптом одной строкой |
|---|---|---|
| 2026-10-27 | [client-constant-in-server](2026-10-27-client-constant-in-server.md) | `.split is not a function` на сервере: константа импортирована из `"use client"` модуля |
| 2026-10-27 | [search-escape-backslash](2026-10-27-search-escape-backslash.md) | Поиск «50%» вёл себя как маска, потому что потерялся обратный слэш при записи файла скриптом |
| 2026-10-27 | [rest-1000-rows-cap](2026-10-27-rest-1000-rows-cap.md) | `.limit(10000)` не снимает лимит API в 1000 строк: данные обрезаются молча |
| 2026-10-27 | [maxima-limit-ceiling](2026-10-27-maxima-limit-ceiling.md) | Парсер Maxima упал: акций стало 1136, а `limit=1000` считался «всеми» |
| 2026-10-27 | [stale-css-vercel-cache](2026-10-27-stale-css-vercel-cache.md) | Боевой сайт стал белым: Vercel собрал старый CSS из восстановленного кэша |
| 2026-10-27 | [rimi-timeout-without-retry](2026-10-27-rimi-timeout-without-retry.md) | Парсер Rimi упал в Actions: таймаут запроса без повторов сделал единичный сбой фатальным |
| 2026-10-28 | [matching-hidden-offers](2026-10-28-matching-hidden-offers.md) | Сопоставление: акции товаров вне карточек пропадали из ленты; незнакомое условие считалось «без условия»; колляция БД и порядок ключей в JS |
| 2026-10-28 | [upsert-needs-update-grant](2026-10-28-upsert-needs-update-grant.md) | Кнопка «Убрать» падала `permission denied`: `upsert` требует UPDATE, а роли дали только select, insert, delete; проверка сервисным ключом это не показала |
| 2026-10-28 | [matching-review-round2](2026-10-28-matching-review-round2.md) | Сопоставление: решения и исключения читались без постраничности (потолок 1000), защита сравнивала разные единицы, вторая акция магазина пропадала из ленты |
| 2026-10-29 | [categorize-skipped-after-match-failure](2026-10-29-categorize-skipped-after-match-failure.md) | Документация обещала «categorize выполняется и при сбое match», а в workflow не было `if`: шаг пропускался |
| 2026-10-29 | [maxima-fetch-no-retry](2026-10-29-maxima-fetch-no-retry.md) | Парсер Maxima упал `terminated`: единичный обрыв соединения при чтении 4 МБ ответа без повторов |
