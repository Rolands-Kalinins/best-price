"use client";

import { PAGE_SIZE } from "@bestprice/core";
import { Check, Search, SlidersHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { cn } from "@/lib/utils";

const chip =
  "inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full border px-4 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none";
const chipOn = "border-primary bg-primary text-primary-foreground";
const chipOff = "bg-card hover:bg-muted";
const field = "bg-card focus-visible:ring-ring/50 h-11 rounded-xl border px-3 text-base outline-none focus-visible:ring-3 sm:text-sm";

type Base = { q: string; store: number | null; cat: string | null; sort: string; n: number };

// Фильтры, поиск и сортировка живут в адресе, список отбирает сервер: в браузер идёт только показанная часть.
export function useFeed<Q extends Base>(query: Q, href: (q: Q) => string) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  // Поле поиска неуправляемое: после «Назад» или перехода по ссылке подставляем в него текст из адреса (пока в нём не печатают).
  useEffect(() => {
    const el = input.current;
    if (el && el !== document.activeElement && el.value !== query.q) el.value = query.q;
  }, [query.q]);

  // Любое изменение условий начинает список заново (n сбрасывается до одной страницы).
  // Не ушедший на сервер текст из поля берём сразу и отменяем отложенный поиск: иначе он потом затёр бы только что выбранный фильтр.
  const update = (patch: Partial<Q>) => {
    clearTimeout(timer.current);
    const q = input.current?.value ?? query.q;
    startTransition(() => router.replace(href({ ...query, q, n: PAGE_SIZE, ...patch }), { scroll: false }));
  };

  // Поиск уходит на сервер с паузой: запрос на каждую букву был бы лишним.
  const search = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => update({}), 300);
  };

  // Кнопки «Сбросить»: очищает и поле поиска.
  const reset = (patch: Partial<Q>) => {
    if (input.current) input.current.value = "";
    update({ ...patch, q: "" } as Partial<Q>);
  };

  return { pending, input, update, search, reset };
}

export function FeedFilters<Q extends Base>({
  feed: { input, update, search, reset },
  query,
  searchLabel,
  placeholder,
  allStores,
  stores,
  toggles,
  categories,
  sortLabels,
  total,
  cleared,
}: {
  feed: ReturnType<typeof useFeed<Q>>;
  query: Q;
  searchLabel: string;
  placeholder: string;
  allStores: string;
  stores: { id: number; name: string }[];
  // Переключатели («Со скидкой»): patch меняет их значение, on — включён ли.
  toggles: { label: string; on: boolean; patch: Partial<Q> }[];
  categories: readonly { slug: string; name: string }[];
  sortLabels: Record<string, string>;
  total: string;
  // Значения всех фильтров «выключено»: их ставит кнопка «Сбросить».
  cleared: Partial<Q>;
}) {
  // На телефоне чипы свёрнуты: иначе они занимают первый экран, и товаров не видно.
  const [open, setOpen] = useState(false);
  const active = (query.store !== null ? 1 : 0) + (query.cat ? 1 : 0) + toggles.filter((t) => t.on).length;

  // Выбранная категория может оказаться за краем прокручиваемой строки: подводим её в видимую часть (без прокрутки страницы).
  const cats = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = cats.current;
    const el = row?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (row && el) row.scrollLeft = el.offsetLeft - (row.clientWidth - el.offsetWidth) / 2;
  }, [query.cat, open]);

  // Фрагмент, а не обёртка: sticky держится только внутри родителя, а им должна быть вся лента.
  return (
    <>
      {/* Строка поиска закреплена под шапкой: к фильтрам можно вернуться из любого места длинной ленты. */}
      <div className="bg-background/95 sticky top-14 z-10 -mx-4 flex gap-2 px-4 py-2 backdrop-blur">
        <div className="relative flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" aria-hidden />
          <input
            type="search"
            name="q"
            autoComplete="off"
            spellCheck={false}
            aria-label={searchLabel}
            placeholder={placeholder}
            ref={input}
            defaultValue={query.q}
            onChange={search}
            className={cn(field, "w-full pr-3 pl-9")}
          />
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="feed-filters"
          onClick={() => setOpen(!open)}
          className={cn(field, "flex shrink-0 items-center gap-2 font-medium md:hidden", active > 0 && "border-primary")}
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          <span className="max-[359px]:sr-only">Фильтры</span>
          {active > 0 && <span className="tabular-nums">({active})</span>}
        </button>
      </div>

      <div id="feed-filters" className={cn("space-y-3", !open && "max-md:hidden")}>
        <div role="group" aria-label="Магазины" className="flex flex-wrap gap-2">
          {[{ id: null, name: allStores }, ...stores].map((s) => (
            <button
              key={s.id ?? "all"}
              type="button"
              aria-pressed={query.store === s.id}
              onClick={() => update({ store: s.id } as Partial<Q>)}
              className={cn(chip, query.store === s.id ? chipOn : chipOff)}
            >
              {s.name}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Условия" className="flex flex-wrap gap-2">
          {toggles.map((t) => (
            <button key={t.label} type="button" aria-pressed={t.on} onClick={() => update(t.patch)} className={cn(chip, t.on ? chipOn : chipOff)}>
              {t.on && <Check className="size-4" aria-hidden />}
              {t.label}
            </button>
          ))}
        </div>
        {/* Категории в одну прокручиваемую строку: их ~20, в несколько рядов они бы вытеснили ленту. Затухание у края подсказывает, что строка длиннее. */}
        <div
          ref={cats}
          role="group"
          aria-label="Категории"
          className="relative -mx-4 flex gap-2 overflow-x-auto pr-12 pb-1 pl-4 [mask-image:linear-gradient(to_right,#000_calc(100%-2.5rem),transparent)] [scrollbar-width:thin]"
        >
          {[{ slug: null, name: "Все категории" }, ...categories].map((c) => (
            <button
              key={c.slug ?? "all"}
              type="button"
              aria-pressed={query.cat === c.slug}
              onClick={() => update({ cat: c.slug } as Partial<Q>)}
              className={cn(chip, query.cat === c.slug ? chipOn : chipOff)}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <p className="text-muted-foreground text-sm whitespace-nowrap tabular-nums" aria-live="polite">
          Найдено: {total}
        </p>
        {(active > 0 || query.q) && (
          <button
            type="button"
            onClick={() => reset(cleared)}
            className="text-primary focus-visible:ring-ring/50 min-h-11 rounded-lg px-2 text-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3"
          >
            Сбросить фильтры
          </button>
        )}
        <select
          aria-label="Сортировка"
          value={query.sort}
          onChange={(e) => update({ sort: e.target.value } as Partial<Q>)}
          className={cn(field, "ml-auto min-w-0")}
        >
          {Object.entries(sortLabels).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
