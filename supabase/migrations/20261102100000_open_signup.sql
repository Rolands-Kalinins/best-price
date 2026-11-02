-- Открытая регистрация: любой, кто вошёл через Google (в JWT есть email), получает права участника.
-- Белый список allowed_emails теперь только назначает роль admin (handle_new_user). is_admin не меняется.
-- create or replace сохраняет grants (authenticated), anon по-прежнему не может вызвать функцию.
create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'email', '') <> '';
$$;
