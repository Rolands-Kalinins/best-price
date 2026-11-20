# Drogas (drogas.lv) — проверка допустимости, 2026-11-20

Не юридическая консультация. Разведка данных: `docs/recon/drogas.md` (2026-11-01).

## 1. Хосты
- `www.drogas.lv` (сайт, условия, robots).
- `api.drogas.lv` (API Hybris OCC, `/api/v2/drlv/`, откуда мы собирались брать каталог).
- CDN картинок не проверялся (фото не берём, только ссылки).

## 2. robots.txt (читался из браузера Playwright; обычный запрос получает Akamai 403 Access Denied)
**`www.drogas.lv/robots.txt`**, `User-agent: *`, закрыто: `/lv|ru/cart`, `checkout`, `my-account`, `login`, `register`, `/lv|ru/*q=*`, `/lv|ru/view/`, **`/api/v2/`**, `*/search*`, `*?query=*`, `*?page=*`, `*&currentPage=*`, `*?search=*`. Открыто: `*/sitemaps/`. Crawl-delay нет. Content-Signal / ai-train нет. Sitemap: `/lv/sitemap.xml`, `/ru/sitemap.xml`.
**`api.drogas.lv/robots.txt`**: `User-agent: *` `Allow: /`; только `Amazonbot` `Disallow: /`.
Спорное: на `www` путь `/api/v2/` закрыт, а на хосте API robots разрешает всё. По правилу skill это выносится владельцу, мы читаем именно тот же API-путь. `X-Robots-Tag` и `<meta name="robots">` каталога не проверялись.

## 3. Документы (прочитано 2026-11-20)
| Документ | URL | Прочитан |
|---|---|---|
| Lietošanas noteikumi интернет-магазина (lv) | `https://www.drogas.lv/lv/eveikala-noteikumi` | **целиком** (20 605 знаков) |
| То же (ru) | `https://www.drogas.lv/ru/eveikala-noteikumi` | абзацы про ИС, обход, коммерцию (по ключевым словам) |
| Программа лояльности | `https://www.drogas.lv/lv/Noteikumi` | только поиск по ключевым словам: про каталог ничего, одна строка © |
| Privātuma politika | `https://www.drogas.lv/lv/privatuma_politika` | не читалась (про персональные данные) |

Ключевые цитаты (lv, абзац об интеллектуальной собственности, номера пункта нет):
> «Mums pieder vai ir licencētas autortiesības, **datubāžu tiesības**, preču zīmes, domēnu nosaukumi un citas intelektuālā īpašuma tiesības visos interneta veikala www.drogas.lv materiālos un informācijā („IĪ saturs”). Jūs varat lejupielādēt vai izdrukāt … IĪ satura kopijas **tikai savām personīgajām, nekomerciālām vajadzībām** … **Bez Mūsu īpašas piekrišanas Jūs nedrīkstat uzņēmējdarbības nolūkā vai citas komerciālas izmantošanas nolūkā kopēt vai adaptēt** interneta veikala www.drogas.lv IĪ saturu, izkārtojumu vai kodu, **vai izveidot arhīvu vai datubāzi, kas satur visu IĪ saturu vai tā daļas.**»

ru: «Без Нашего согласия в целях предпринимательской деятельности или других коммерческих целях запрещается копировать или адаптировать ИС-контент …, создавать архив или базу данных, полностью или частично дублирующую ИС-контент.»

Об обходе защиты (там же): «Jūs nedrīkstat traucēt pienācīgai … darbībai un, jo īpaši, **censties apiet drošību** … vai kā citādi iejaukties … darbībā». Условия «обязательны для посетителя»; использование сайта = согласие («Apmeklējot, lietojot vai izmantojot … Jūs apliecināt, ka … piekrītat»).
Слов «bot», «scraper», «robots», «automatizēts» в условиях нет.

## 4. Какие данные берём
Название, цена, EAN, бренд, категория, URL: сами по себе факты. Но мы берём **весь каталог (≈9 500 позиций) и храним его как свою базу**: это ровно «datubāzi, kas satur visu IĪ saturu vai tā daļas» в коммерческих целях (сайт сравнения цен, пусть и некоммерческий пока). Право создателя базы данных (директива 96/9/EC) магазин заявил прямо. Фото и описания не копируем (только ссылка), отзывы не берём. Цена по карте Drogas (`MEMBER`) относится к программе лояльности, условий на неё не нашли.

## 5. Доступ и защита
Вход не нужен (anon API). **Akamai блокирует обычные запросы (403) для `www` и `robots.txt`**, пропускает настоящий браузер; запросы к `api.drogas.lv` голым `fetch` проходили. Капчи нет. Любое использование браузера или подмены, чтобы пройти Akamai, = обход, RED.

## 6. Официальные альтернативы
Не искали на сайте. Контакт для запроса: `drogas@drogas.lv`, тел. 67084800. Возможный фид для сравнения цен (salidzini.lv и т.п.) не проверялся.

## 7. Нагрузка
Из recon: 96 запросов по ≈350 КБ на полный обход, один раз в сутки, с паузой.

## 8. Вердикт: **RED**
Основания: (1) условия прямо запрещают в коммерческих целях без согласия копировать содержимое и «создавать архив или базу данных» из него, право на базу данных заявлено; (2) robots основного сайта закрывает именно `/api/v2/`, которым мы собирались пользоваться; (3) доступ к страницам прикрыт Akamai. Слова «скрапер» нет, но запрет создания базы эквивалентен нашей задаче.
Решить владельцу: письмо в `drogas@drogas.lv` с просьбой о письменном разрешении или фиде (цель, объём, ночью, свой User-Agent), иначе отказ от Drogas. До ответа код и боевой парсер не писать, `docs/recon/drogas.md` («план парсера») не исполнять.

## 9. Не проверено
- Политика конфиденциальности и русская версия условий не читались целиком (только ключевые абзацы).
- Условия программы лояльности: поиск по ключевым словам.
- `X-Robots-Tag`, `<meta name="robots">`, `/.well-known/`, `/llms.txt`, `/ai.txt`.
- Старые редакции условий (web.archive.org); снимок документа в `backups/legal/` не сохранён.
- Условия и robots CDN картинок.
- Существование официального фида или API для партнёров.
