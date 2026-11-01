-- benu: интернет-аптека Benu (benu.lv), раздел «аптеки». Только добавление строки.
insert into public.sources (slug, name, url, module)
values ('benu', 'Benu', 'https://www.benu.lv', 'pharmacy')
on conflict (slug) do nothing;
