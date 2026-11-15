-- euroaptieka: интернет-аптека Euroaptieka (euroaptieka.lv), раздел «аптеки». Только добавление строки.
insert into public.sources (slug, name, url, module)
values ('euroaptieka', 'Euroaptieka', 'https://www.euroaptieka.lv', 'pharmacy')
on conflict (slug) do nothing;
