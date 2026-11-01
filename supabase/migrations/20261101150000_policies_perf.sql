-- Замечание get_advisors (performance): auth_rls_initplan для users. Доступ не меняется, только план запроса. Работает со старым кодом.
-- Без drop policy: инструмент apply_migration считает такую миграцию разрушающей и отклоняет, к тому же alter не оставляет окна без защиты.
-- Не сделано: sources_admin (for all) дублирует sources_select на SELECT (multiple_permissive_policies). Разнести по командам можно только
-- через drop+create, а на таблице из нескольких строк выигрыша нет.

-- (select ...) считается один раз на запрос, а не на каждую строку.
alter policy users_select on public.users
  using ((select public.is_member()) and (id = (select auth.uid()) or (select public.is_admin())));
alter policy sources_select on public.sources using ((select public.is_member()));
alter policy sources_admin on public.sources using ((select public.is_admin())) with check ((select public.is_admin()));
