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
| 2026-10-31 | [leaflet-optional-fields](2026-10-31-leaflet-optional-fields.md) | Парсер буклета принял 1 запись из 7: модель не возвращала цены, когда поля схемы необязательны (и переводила названия) |
| 2026-10-31 | [leaflet-lidl-plus-multibuy](2026-10-31-leaflet-lidl-plus-multibuy.md) | Парсер буклета: цена по карте Lidl Plus читалась как обычная (слабая модель не следовала прозе), акции «2+1» отбрасывались |
| 2026-10-31 | [barbora-condition-format](2026-10-31-barbora-condition-format.md) | Парсер Barbora: условие «Pērkot 2 vai vairāk» не распознавалось `conditionKind`, 358 акций не склеились бы с другими магазинами |
| 2026-10-31 | [elatts-title-class](2026-10-31-elatts-title-class.md) | Парсер e-latts: 4 акции с длинным названием (`-oTitle -sLong`) отбрасывались, фикстура не покрывала вариант разметки |
| 2026-11-01 | [meness-result-window](2026-11-01-meness-result-window.md) | Парсер Mēness: HTTP 400 на странице 101, поиск не отдаёт глубже 10 000 результатов; обход разбит на ценовые диапазоны |
| 2026-11-01 | [prd-fr-numbering](2026-11-01-prd-fr-numbering.md) | PRD: новые требования аптек получили занятые номера FR-61 и FR-62, «хвост» grep показал не максимум; перенумерованы в FR-63…67 |
| 2026-11-03 | [barbora-count-gap](2026-11-03-barbora-count-gap.md) | Парсер Barbora: `count` включает ~1–3% позиций, которые API не отдаёт, строгая проверка «получено ≥ count» роняла прогон; введён допуск 5% |
| 2026-11-12 | [lidl-thumb-crop-rounding](2026-11-12-lidl-thumb-crop-rounding.md) | Lidl: `cropRegion` округлял left и width независимо, рамка у края выходила на 1 px за страницу (sharp: bad extract area), прогоны падали с 07.11; округляются края, плохая рамка пропускается, а не роняет запуск |
| 2026-11-01 | [expandlist-hidden-not-skipped](2026-11-01-expandlist-hidden-not-skipped.md) | «Где дешевле»: карточки скрыты CSS, но все 200 уходили в страницу (2,5 МБ, 3,7 с); теперь сервер строит только видимые, остальные по `?all=1` |
| 2026-11-12 | [meness-connection-drops](2026-11-12-meness-connection-drops.md) | Парсер Mēness: на раннерах GitHub сайт рвал соединение серией (`terminated`), 3 попыток на ≈105 запросов не хватало; попыток 6, повторы логируются |
| 2026-11-12 | [db-pull-source-ids](2026-11-12-db-pull-source-ids.md) | `db:pull` падал на внешнем ключе: id магазинов в боевой и локальной БД разные (Barbora 5 и 7), совпавший номер лёг бы не в тот магазин. `source_id` переводится по slug. |
| 2026-11-13 | [stale-warning-after-schedule-split](2026-11-13-stale-warning-after-schedule-split.md) | После перехода на редкие запуски сайт показал бы «данные устарели» (порог 48 ч), а cron в одной группе `concurrency` отменяли бы друг друга |
| 2026-11-14 | [meness-taxon-format](2026-11-14-meness-taxon-format.md) | Mēness: сайт убрал `slug` из `productTaxons`, `category()` падала на каждом товаре («не разобрано N из N»); категория теперь из `mainTaxon`. |
| 2026-11-15 | [conflict-markers-pushed](2026-11-15-conflict-markers-pushed.md) | Маркеры конфликта слияния попали в коммит и push ветки PR: скрипт не нашёл блок (CRLF), команды шли через `;` |
