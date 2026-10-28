-- Учёт квоты Gemini для админки. Только добавление.
-- ai_usage: счётчики по дням (день по тихоокеанскому времени, в нём Google сбрасывает суточный лимит) и моделям. Пишет матчер
-- через add_ai_usage (атомарное приращение). Считает только запросы матчера: остальное на том же проекте Google не видно.
-- ai_limits: лимиты модели из Google AI Studio (RPM, TPM, RPD); значения меняются вручную в SQL, когда Google их меняет.
create table grocery.ai_limits (
  model text primary key,
  rpm   int not null,
  tpm   int not null,
  rpd   int not null
);
insert into grocery.ai_limits (model, rpm, tpm, rpd) values ('gemini-3.1-flash-lite', 15, 250000, 500);

create table grocery.ai_usage (
  day               date   not null,
  model             text   not null,
  requests          int    not null default 0,
  tokens_in         bigint not null default 0,
  tokens_out        bigint not null default 0,
  errors            int    not null default 0,
  quota_hits        int    not null default 0,
  last_error        text,
  last_quota_hit_at timestamptz,
  updated_at        timestamptz not null default now(),
  primary key (day, model)
);

alter table grocery.ai_limits enable row level security;
alter table grocery.ai_usage  enable row level security;
create policy ai_limits_select on grocery.ai_limits for select to authenticated using ((select public.is_admin()));
create policy ai_usage_select  on grocery.ai_usage  for select to authenticated using ((select public.is_admin()));
grant select on grocery.ai_limits, grocery.ai_usage to authenticated;
grant all on grocery.ai_limits, grocery.ai_usage to service_role;

create function grocery.add_ai_usage(
  p_day date, p_model text, p_requests int, p_tokens_in bigint, p_tokens_out bigint, p_errors int, p_quota_hits int,
  p_last_error text, p_quota_hit_at timestamptz
) returns void
language sql
set search_path = ''
as $$
  insert into grocery.ai_usage as u (day, model, requests, tokens_in, tokens_out, errors, quota_hits, last_error, last_quota_hit_at)
  values (p_day, p_model, p_requests, p_tokens_in, p_tokens_out, p_errors, p_quota_hits, p_last_error, p_quota_hit_at)
  on conflict (day, model) do update set
    requests          = u.requests + excluded.requests,
    tokens_in         = u.tokens_in + excluded.tokens_in,
    tokens_out        = u.tokens_out + excluded.tokens_out,
    errors            = u.errors + excluded.errors,
    quota_hits        = u.quota_hits + excluded.quota_hits,
    last_error        = coalesce(excluded.last_error, u.last_error),
    last_quota_hit_at = coalesce(excluded.last_quota_hit_at, u.last_quota_hit_at),
    updated_at        = now();
$$;
revoke execute on function grocery.add_ai_usage(date, text, int, bigint, bigint, int, int, text, timestamptz) from public, anon, authenticated;
grant execute on function grocery.add_ai_usage(date, text, int, bigint, bigint, int, int, text, timestamptz) to service_role;
