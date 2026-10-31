-- Правка акций админом (страница /grocery/admin/offers). Только добавление, старый код работает как раньше.
-- locked_fields: какие поля админ поправил руками. Парсеры пишут акции через upsert и о правках не знают, поэтому защита в самой таблице:
-- триггер возвращает закреплённые поля к прежним значениям, если обновляет не админ. Строка с другим external_id (парсер переименовал
-- товар) — новая акция, правки на неё не переносятся.
alter table grocery.offers
  add column locked_fields text[] not null default '{}',
  add column edited_at timestamptz;

create function grocery.offers_keep_locked() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Правка админа (через сайт, роль authenticated) проходит как есть; парсер (service_role, auth.uid() пуст) не трогает закреплённое.
  if (select public.is_admin()) or cardinality(old.locked_fields) = 0 then
    return new;
  end if;
  new := jsonb_populate_record(new, (select coalesce(jsonb_object_agg(k, to_jsonb(old) -> k), '{}') from unnest(old.locked_fields) k));
  return new;
end;
$$;
create trigger offers_keep_locked before update on grocery.offers for each row execute function grocery.offers_keep_locked();

-- Админ меняет только перечисленные столбцы (не source_id, external_id, last_seen_at и т.п.).
create policy offers_admin_update on grocery.offers for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
grant update (title, brand, packaging, condition, price, old_price, discount_percent, unit_price, unit, ends_at, image_url, locked_fields, edited_at)
  on grocery.offers to authenticated;

-- Правка цены админом тоже попадает в историю цен: триггер log_price пишет в price_history, куда у authenticated прав нет, поэтому он
-- работает с правами владельца (пишет только id и цену той же строки). Тело функции не меняется.
alter function grocery.log_price() security definer set search_path = '';
