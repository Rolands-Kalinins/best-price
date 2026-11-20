# Словарь формулировок для проверки ToS

Начальный список, не исчерпывающий. Растёт по правилу «нашли случайно» (см. `SKILL.md`). Поиск без учёта регистра, учитывать латышские падежи (искать по основе). Каждое совпадение читать в контексте абзаца.

## Прямой запрет (RED)

| Формулировка | Язык | Где найдена |
|---|---|---|
| боты, скраперы и скрипты запрещены (п. 1.9.1) | lv/ru | Mēness, `e-menessaptieka.lv/lietosanas-noteikumi` |
| robot, bot, scraper, crawler, spider, script, automated means/tools | en | общее |
| robots, boti, skrāperi, skripti, automatizēti līdzekļi, rāpuļprogrammas | lv | общее |
| data mining, data extraction, harvesting, datu ieguve, datu iegūšana, datu izguve | en/lv | общее |
| робот, бот, скрапинг, парсинг, автоматизированный сбор, извлечение данных | ru | общее |

## Расплывчатое (YELLOW, даже без слова «скрапинг»)

| Формулировка | Язык | Где найдена |
|---|---|---|
| «копирование, размножение, републикация, передача третьим лицам, изменение или иное использование» информации и фото без разрешения (п. 2.2) | lv/ru | Apotheka, `apotheka.lv/apothekalv-lietosanas-noteikumi`; ответственность за убытки (п. 16.1), закрытие доступа (п. 19.2) |
| «иное использование», «любое использование», «другие данные», «любым способом» | ru | Apotheka |
| kopēšana, pavairošana, republicēšana, nodošana trešajām personām, citāda izmantošana | lv | Apotheka |
| without prior written consent / permission, bez iepriekšējas rakstiskas piekrišanas / atļaujas | en/lv | общее |
| commercial use, komerciāliem nolūkiem, komerciāla izmantošana | en/lv | общее |
| content, catalogue, descriptions, photos are property of the seller (autortiesības, īpašums, intelektuālais īpašums) | en/lv | общее |
| database rights, datubāzes veidotāja tiesības, sui generis, 96/9/EC | en/lv | общее |
| liable for damages, atbild par zaudējumiem, zaudējumu atlīdzināšana | en/lv | Apotheka |
| right to block / close access (tiesības slēgt piekļuvi, bloķēt) | lv | Apotheka п. 19.2 |
| excessive load, pārmērīga slodze, disrupt, traucēt vietnes darbību | en/lv | общее |

## Нейтральное, но не проверка (не считать защитой)

- Политика конфиденциальности, правила программы лояльности (Paldies, Rimi, Etop): про персональные данные, не про данные каталога.
- «Условий сайта нет» = YELLOW, не GREEN: нет документа, значит нет и разрешения; действует авторское право и право базы данных по умолчанию.

## Где ещё смотреть (кроме страницы «Условия»)

- Подвал главной, cookie-баннер, страница «О нас → Юридическая информация», `impressum`.
- Условия **магазина**, а не корпоративного сайта (у Mēness разные домены).
- Условия **API/CDN-хоста**, если он другой (`api.*`, `cdn.*`, `static.*`).
- `robots.txt` каждого хоста, `X-Robots-Tag`, `<meta name="robots">`, `/.well-known/`, `/ai.txt`, `/llms.txt`, `/security.txt` (контакт для запроса).
- Тело ответа блокировки (403/429/451) и текст страницы «Access Denied»: иногда содержит ссылку на условия.
- Версии на lv / ru / en: могут расходиться.
- Старая версия условий (web.archive.org): что изменилось.
