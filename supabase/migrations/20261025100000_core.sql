-- Ядро: белый список, пользователи и роли, источники, журнал запусков парсеров.

-- Белый список email (FR-5). Пустой список = никто не получает данные.
create table public.allowed_emails (
  email text primary key check (email = lower(email)),
  role  text not null default 'member' check (role in ('admin', 'member'))
);

-- Пользователи и роли (FR-7). Строка создаётся при первом входе через Google.
create table public.users (
  id    uuid primary key references auth.users (id) on delete cascade,
  email text not null check (email = lower(email)),
  role  text not null default 'member' check (role in ('admin', 'member'))
);

-- Магазины-источники (FR-8). module = раздел сайта, к которому относится источник.
create table public.sources (
  id      bigint generated always as identity primary key,
  slug    text not null unique,
  name    text not null,
  url     text not null,
  module  text not null,
  enabled boolean not null default true
);

-- Журнал запусков парсеров (FR-8, FR-13, FR-29).
create table public.scrape_runs (
  id            bigint generated always as identity primary key,
  source_id     bigint not null references public.sources (id) on delete cascade,
  started_at    timestamptz not null,
  finished_at   timestamptz not null default now(),
  status        text not null check (status in ('success', 'failed')),
  items_count   integer not null default 0,
  invalid_count integer not null default 0,
  error         text
);
create index scrape_runs_source_started_idx on public.scrape_runs (source_id, started_at desc);

-- Проверки доступа. security definer, чтобы читать allowed_emails/users в обход их RLS.
create function public.is_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.allowed_emails
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_member() and exists (
    select 1 from public.users where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_member() from public, anon;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_member() to authenticated;
grant execute on function public.is_admin() to authenticated;

-- При первом входе создаём строку в users. Роль берём из белого списка.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.users (id, email, role)
  values (
    new.id,
    lower(new.email),
    coalesce((select role from public.allowed_emails where email = lower(new.email)), 'member')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS: anon не получает ничего, authenticated только через политики.
alter table public.allowed_emails enable row level security;
alter table public.users          enable row level security;
alter table public.sources        enable row level security;
alter table public.scrape_runs    enable row level security;

revoke all on public.allowed_emails, public.users, public.sources, public.scrape_runs from anon;

create policy allowed_emails_admin on public.allowed_emails
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy users_select on public.users
  for select to authenticated
  using (public.is_member() and (id = auth.uid() or public.is_admin()));

create policy sources_select on public.sources
  for select to authenticated using (public.is_member());
create policy sources_admin on public.sources
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy scrape_runs_select on public.scrape_runs
  for select to authenticated using (public.is_member());

-- Запись в scrape_runs идёт только через service_role (он обходит RLS).

insert into public.sources (slug, name, url, module) values
  ('lidl',   'Lidl',   'https://www.lidl.lv',  'grocery'),
  ('maxima', 'Maxima', 'https://www.maxima.lv', 'grocery'),
  ('etop',   'Etop',   'https://www.etop.lv', 'grocery'),
  ('rimi',   'Rimi',   'https://www.rimi.lv',  'grocery');

insert into public.allowed_emails (email, role) values ('rolands915@gmail.com', 'admin');
