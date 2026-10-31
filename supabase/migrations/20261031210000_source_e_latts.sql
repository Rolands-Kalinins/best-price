-- e-latts: интернет-магазин LaTS (e-latts.lv), отдельный источник. Только добавление строки, старому коду не мешает.
insert into public.sources (slug, name, url, module)
values ('e-latts', 'e-LaTS', 'https://e-latts.lv', 'grocery')
on conflict (slug) do nothing;
