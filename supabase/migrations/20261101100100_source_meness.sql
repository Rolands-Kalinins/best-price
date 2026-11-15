-- meness: интернет-аптека Mēness (e-menessaptieka.lv), раздел «аптеки». Только добавление строки.
insert into public.sources (slug, name, url, module)
values ('meness', 'Mēness aptieka', 'https://e-menessaptieka.lv', 'pharmacy')
on conflict (slug) do nothing;
