-- Barbora: интернет-магазин Maxima (barbora.lv), отдельный источник. Только добавление строки, старому коду не мешает.
insert into public.sources (slug, name, url, module)
values ('barbora', 'Barbora', 'https://barbora.lv', 'grocery')
on conflict (slug) do nothing;
