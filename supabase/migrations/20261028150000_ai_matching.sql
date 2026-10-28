-- Помощь Gemini при сопоставлении. Только добавление: старый код этих таблиц и столбцов не видит.
-- title_attrs: бренд из названия акций, у которых магазин его не отдаёт (Rimi, Maxima). Ключ — название в нижнем регистре
-- (оно повторяется из недели в неделю, в отличие от id акции Maxima), brand null = «бренда нет», чтобы не спрашивать снова.
-- pair_verdicts: совет модели по паре ключей предположения. prompt_version: после смены промпта старые строки не используются.
-- Сайт эти таблицы не читает: RLS включён, политик нет, доступ только у сервисной роли (матчер).
create table grocery.title_attrs (
  title_key      text     not null,
  prompt_version smallint not null,
  brand          text,
  primary key (title_key, prompt_version)
);

create table grocery.pair_verdicts (
  key_a          text     not null collate "C",
  key_b          text     not null collate "C",
  prompt_version smallint not null,
  same           boolean  not null,
  reason         text     not null,
  primary key (key_a, key_b, prompt_version),
  check (key_a collate "C" < key_b collate "C")
);

alter table grocery.title_attrs   enable row level security;
alter table grocery.pair_verdicts enable row level security;
revoke all on grocery.title_attrs, grocery.pair_verdicts from anon, authenticated;
grant all on grocery.title_attrs, grocery.pair_verdicts to service_role;

-- Совет модели виден админу в очереди (политика match_suggestions_select уже ограничивает чтение админом).
alter table grocery.match_suggestions add column ai_same boolean, add column ai_reason text;
