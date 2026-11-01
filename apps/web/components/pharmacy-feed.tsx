"use client";

import { MAX_OFFERS, PAGE_SIZE, PHARMACY_CATEGORIES, type PharmacyQuery, type PharmacySort } from "@bestprice/core";
import { Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";
import { PharmacyCard, type PharmacyRow } from "@/components/pharmacy-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SORT_LABELS: Record<PharmacySort, string> = {
  discount: "Сначала выгодные",
  price: "Сначала дешёвые",
  name: "По алфавиту",
};

const chip =
  "inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none";
const chipOn = "border-primary bg-primary text-primary-foreground";
const chipOff = "bg-card hover:bg-muted";

// Параметры без значений по умолчанию не пишем: ссылка остаётся короткой.
function toSearch(q: PharmacyQuery) {
  const sp = new URLSearchParams();
  if (q.q) sp.set("q", q.q);
  if (q.store !== null) sp.set("store", String(q.store));
  if (q.cat) sp.set("cat", q.cat);
  if (q.sale) sp.set("sale", "1");
  if (q.card) sp.set("card", "1");
  if (q.sort !== "discount") sp.set("sort", q.sort);
  if (q.n > PAGE_SIZE) sp.set("n", String(q.n));
  return sp.toString();
}
const href = (q: PharmacyQuery) => {
  const search = toSearch(q);
  return search ? `/pharmacy?${search}` : "/pharmacy";
};

// Как OfferFeed: фильтры, поиск и сортировка живут в адресе, товары отбирает сервер, в браузер идёт только показанная часть.
export function PharmacyFeed({
  products,
  total,
  stores,
  query,
}: {
  products: PharmacyRow[];
  total: number;
  stores: { id: number; name: string }[];
  query: PharmacyQuery;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const storeName = new Map(stores.map((s) => [s.id, s.name]));

  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  // Поле поиска неуправляемое: после «Назад» подставляем в него текст из адреса (пока в нём не печатают).
  useEffect(() => {
    const el = input.current;
    if (el && el !== document.activeElement && el.value !== query.q) el.value = query.q;
  }, [query.q]);

  // Любое изменение условий начинает список заново; несохранённый текст из поля берём сразу и отменяем отложенный поиск.
  const update = (patch: Partial<PharmacyQuery>) => {
    clearTimeout(timer.current);
    const q = input.current?.value ?? query.q;
    startTransition(() => router.replace(href({ ...query, q, n: PAGE_SIZE, ...patch }), { scroll: false }));
  };

  const search = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => update({}), 300);
  };

  return (
    <section className="space-y-4">
      <div className="space-y-3">
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" aria-hidden />
          <input
            type="search"
            name="q"
            autoComplete="off"
            spellCheck={false}
            aria-label="Поиск по аптекам"
            placeholder="Поиск: vitamīns, ibumetin…"
            ref={input}
            defaultValue={query.q}
            onChange={search}
            className="bg-card focus-visible:ring-ring/50 h-11 w-full rounded-xl border pr-3 pl-9 text-base outline-none focus-visible:ring-3 sm:text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {[{ id: null, name: "Все аптеки" }, ...stores].map((s) => (
            <button
              key={s.id ?? "all"}
              type="button"
              aria-pressed={query.store === s.id}
              onClick={() => update({ store: s.id })}
              className={cn(chip, query.store === s.id ? chipOn : chipOff)}
            >
              {s.name}
            </button>
          ))}
          <button type="button" aria-pressed={query.sale} onClick={() => update({ sale: !query.sale })} className={cn(chip, query.sale ? chipOn : chipOff)}>
            Со скидкой
          </button>
          <button type="button" aria-pressed={query.card} onClick={() => update({ card: !query.card })} className={cn(chip, query.card ? chipOn : chipOff)}>
            Цена по карте
          </button>
        </div>
        {/* Категории в одну прокручиваемую строку, как у акций. */}
        <div role="group" aria-label="Категории" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {[{ slug: null, name: "Все категории" }, ...PHARMACY_CATEGORIES].map((c) => (
            <button
              key={c.slug ?? "all"}
              type="button"
              aria-pressed={query.cat === c.slug}
              onClick={() => update({ cat: c.slug })}
              className={cn(chip, query.cat === c.slug ? chipOn : chipOff)}
            >
              {c.name}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-muted-foreground text-sm tabular-nums" aria-live="polite">
            Найдено: {total}
          </p>
          <select
            aria-label="Сортировка"
            value={query.sort}
            onChange={(e) => update({ sort: e.target.value as PharmacySort })}
            className="bg-card focus-visible:ring-ring/50 h-11 rounded-xl border px-3 text-base outline-none focus-visible:ring-3 sm:text-sm"
          >
            {(Object.keys(SORT_LABELS) as PharmacySort[]).map((k) => (
              <option key={k} value={k}>
                {SORT_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {products.length ? (
        <>
          <ul
            aria-busy={pending}
            className={cn("grid grid-cols-2 gap-3 transition-opacity sm:grid-cols-3 lg:grid-cols-4", pending && "opacity-60")}
          >
            {products.map((p) => (
              <li key={p.id} className="flex">
                <PharmacyCard product={p} storeName={storeName.get(p.source_id) ?? ""} />
              </li>
            ))}
          </ul>
          {total > products.length &&
            (query.n < MAX_OFFERS ? (
              <Link
                href={href({ ...query, n: query.n + PAGE_SIZE })}
                scroll={false}
                prefetch={false}
                className={cn(buttonVariants({ variant: "outline", size: "lg" }), "mx-auto flex min-h-11 w-fit")}
              >
                Показать ещё ({total - products.length})
              </Link>
            ) : (
              <p className="text-muted-foreground text-center text-sm">
                Показаны первые {MAX_OFFERS} из {total}. Уточните поиск или выберите аптеку.
              </p>
            ))}
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-muted-foreground text-sm">Ничего не найдено по этим фильтрам.</p>
          <Button
            variant="outline"
            size="lg"
            className="min-h-11"
            onClick={() => {
              if (input.current) input.current.value = "";
              update({ q: "", store: null, cat: null, sale: false, card: false });
            }}
          >
            Сбросить
          </Button>
        </div>
      )}
    </section>
  );
}
