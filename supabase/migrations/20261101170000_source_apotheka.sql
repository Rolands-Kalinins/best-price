-- apotheka: интернет-аптека Apotheka (apotheka.lv), раздел «аптеки». Только добавление строки.
insert into public.sources (slug, name, url, module)
values ('apotheka', 'Apotheka', 'https://www.apotheka.lv', 'pharmacy')
on conflict (slug) do nothing;
