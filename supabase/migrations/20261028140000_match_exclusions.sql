-- Акция, которую админ убрал из сопоставления («лишняя» в группе): алгоритм её больше не объединяет. Только добавление.
-- По id акции, а не по ключу: убирается конкретная акция. У Maxima id меняется вместе с неделей, там убирать придётся заново.
create table grocery.match_exclusions (
  offer_id    bigint primary key references grocery.offers (id) on delete cascade,
  excluded_at timestamptz not null default now()
);

alter table grocery.match_exclusions enable row level security;
create policy match_exclusions_admin on grocery.match_exclusions
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

grant select, insert, delete on grocery.match_exclusions to authenticated;
grant all on grocery.match_exclusions to service_role;
