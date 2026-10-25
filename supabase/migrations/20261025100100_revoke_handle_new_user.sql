-- Триггерная функция не должна вызываться через REST API.
revoke all on function public.handle_new_user() from public, anon, authenticated;
