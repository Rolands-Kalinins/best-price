-- Журнал запусков парсеров (статусы, ошибки, счётчики) видит только админ: страница /grocery/admin/scrapers.
-- Обычным участникам нужна лишь метка «обновлено X назад» (FR-17): отдаём её функцией, без статусов и текстов ошибок.
-- Порядок выката: миграция до кода; пока не вышел новый код, у участников нет метки «обновлено» (старая страница читает таблицу напрямую).
drop policy scrape_runs_select on public.scrape_runs;
create policy scrape_runs_select on public.scrape_runs
  for select to authenticated using ((select public.is_admin()));

create function public.last_scrape_success() returns table (source_id bigint, finished_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.source_id, max(r.finished_at)
  from public.scrape_runs r
  where public.is_member() and r.status = 'success'
  group by r.source_id;
$$;
revoke all on function public.last_scrape_success() from public, anon;
grant execute on function public.last_scrape_success() to authenticated;
