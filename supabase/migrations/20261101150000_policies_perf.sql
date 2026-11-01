-- Замечания get_advisors (performance): auth_rls_initplan для users и multiple_permissive_policies для sources.
-- Поведение доступа не меняется, только план запроса. Работает со старым кодом.

-- (select ...) считается один раз на запрос, а не на каждую строку.
alter policy users_select on public.users
  using ((select public.is_member()) and (id = (select auth.uid()) or (select public.is_admin())));

-- sources_admin (for all) дублировал sources_select на SELECT. Разносим по командам, чтобы на чтение осталась одна политика.
drop policy sources_admin on public.sources;
create policy sources_insert on public.sources
  for insert to authenticated with check ((select public.is_admin()));
create policy sources_update on public.sources
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy sources_delete on public.sources
  for delete to authenticated using ((select public.is_admin()));
