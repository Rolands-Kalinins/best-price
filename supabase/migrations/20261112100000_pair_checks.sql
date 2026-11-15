-- Вторая проверка пары, которую Gemini назвал одним товаром (автопринятие, 2.12.0.0). Только добавление: старый код таблицу не видит.
-- differs = true: найдено отличие (вкус, вариант, размер), пара идёт в очередь админа; false: пара принимается без админа.
-- Как pair_verdicts: RLS включён, политик нет, доступ только у сервисной роли (матчер); prompt_version — версия промпта.
create table grocery.pair_checks (
  key_a          text     not null collate "C",
  key_b          text     not null collate "C",
  prompt_version smallint not null,
  differs        boolean  not null,
  diff           text     not null,
  primary key (key_a, key_b, prompt_version),
  check (key_a collate "C" < key_b collate "C")
);
alter table grocery.pair_checks enable row level security;
revoke all on grocery.pair_checks from anon, authenticated;
grant all on grocery.pair_checks to service_role;
