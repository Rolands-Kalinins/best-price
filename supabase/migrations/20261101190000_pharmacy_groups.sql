-- Группы «один и тот же товар в разных аптеках» (core/pharmacy-match.ts: общий штрихкод или ключ названия). Только добавление: старому коду не мешает.
-- group_id: общий номер группы (пусто = товар сам по себе); group_rep: показывать ли товар отдельной карточкой на странице (true у самого дешёвого
-- в наличии и у всех вне групп; по умолчанию true, чтобы новый товар сразу был виден). Ставит шаг matcher `pharmacy-groups` после каждого парсера.
alter table pharmacy.products add column group_id bigint, add column group_rep boolean not null default true;
create index products_group_id_idx on pharmacy.products (group_id) where group_id is not null;

-- Массовая запись групп одним запросом (unnest). Только для matcher (service_role): в браузер не отдаём.
create function pharmacy.set_groups(ids bigint[], gids bigint[], reps boolean[])
returns void
language sql security invoker set search_path = ''
as $$
  update pharmacy.products p set group_id = v.g, group_rep = v.r from unnest(ids, gids, reps) as v (i, g, r) where p.id = v.i
$$;
revoke execute on function pharmacy.set_groups(bigint[], bigint[], boolean[]) from public, anon, authenticated;
grant execute on function pharmacy.set_groups(bigint[], bigint[], boolean[]) to service_role;

-- Участники групп для показанных карточек (только в наличии, виденные за последние 3 дня). security invoker: RLS как при обычном запросе.
-- Массив в теле запроса, а не в адресе: на странице до 1000 товаров.
create function pharmacy.group_members(gids bigint[])
returns table (id bigint, group_id bigint, source_id bigint, title text, price numeric, old_price numeric, discount smallint, card_price numeric, card_condition text,
               card_starts_at timestamptz, card_ends_at timestamptz, prescription boolean, url text, image_url text)
language sql stable security invoker set search_path = ''
as $$
  select p.id, p.group_id, p.source_id, p.title, p.price, p.old_price, p.discount, p.card_price, p.card_condition, p.card_starts_at, p.card_ends_at,
         p.prescription, p.url, p.image_url
  from pharmacy.products p
  where p.group_id = any (gids) and p.in_stock and p.last_seen_at > now() - interval '3 days'
$$;
grant execute on function pharmacy.group_members(bigint[]) to authenticated, service_role;
