"use client";

import { MAX_OFFERS, PAGE_SIZE, type OfferQuery, type OfferSort } from "@bestprice/core";
import { Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";
import { OfferCard, type OfferRow } from "@/components/offer-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SORT_LABELS: Record<OfferSort, string> = {
  discount: "Сначала выгодные",
  price: "Сначала дешёвые",
  ends: "Скоро закончатся",
};

const chip =
  "inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none";
const chipOn = "border-primary bg-primary text-primary-foreground";
const chipOff = "bg-card hover:bg-muted";

// Параметры без значений по умолчанию не пишем: ссылка остаётся короткой.
function toSearch(q: OfferQuery) {
  const sp = new URLSearchParams();
  if (q.q) sp.set("q", q.q);
  if (q.store !== null) sp.set("store", String(q.store));
  if (q.cond) sp.set("cond", "1");
  if (q.scope) sp.set("scope", "1");
  if (q.sort !== "discount") sp.set("sort", q.sort);
  if (q.n > PAGE_SIZE) sp.set("n", String(q.n));
  return sp.toString();
}
const href = (q: OfferQuery) => {
  const search = toSearch(q);
  return search ? `/grocery?${search}` : "/grocery";
};

// Фильтры, поиск и сортировка живут в адресе, акции отбирает сервер: в базе тысячи строк, в браузер идёт только показанная часть.
export function OfferFeed({
  offers,
  total,
  stores,
  query,
}: {
  offers: OfferRow[];
  total: number;
  stores: { id: number; name: string }[];
  query: OfferQuery;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const storeName = new Map(stores.map((s) => [s.id, s.name]));

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
  const update = (patch: Partial<OfferQuery>) => {
    clearTimeout(timer.current);
    const q = input.current?.value ?? query.q;
    startTransition(() => router.replace(href({ ...query, q, n: PAGE_SIZE, ...patch }), { scroll: false }));
  };

  // Поиск уходит на сервер с паузой: запрос на каждую букву был бы лишним.
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
            aria-label="Поиск по акциям"
            placeholder="Поиск: молоко, piens, Milka…"
            ref={input}
            defaultValue={query.q}
            onChange={search}
            className="bg-card focus-visible:ring-ring/50 h-11 w-full rounded-xl border pr-3 pl-9 text-base outline-none focus-visible:ring-3 sm:text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {[{ id: null, name: "Все магазины" }, ...stores].map((s) => (
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
          <button
            type="button"
            aria-pressed={query.cond}
            onClick={() => update({ cond: !query.cond })}
            className={cn(chip, query.cond ? chipOn : chipOff)}
          >
            С условием
          </button>
          <button
            type="button"
            aria-pressed={query.scope}
            onClick={() => update({ scope: !query.scope })}
            className={cn(chip, query.scope ? chipOn : chipOff)}
          >
            Скидки на бренд или категорию
          </button>
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-muted-foreground text-sm tabular-nums" aria-live="polite">
            Найдено: {total}
          </p>
          <select
            aria-label="Сортировка"
            value={query.sort}
            onChange={(e) => update({ sort: e.target.value as OfferSort })}
            className="bg-card focus-visible:ring-ring/50 h-11 rounded-xl border px-3 text-base outline-none focus-visible:ring-3 sm:text-sm"
          >
            {(Object.keys(SORT_LABELS) as OfferSort[]).map((k) => (
              <option key={k} value={k}>
                {SORT_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {offers.length ? (
        <>
          <ul
            aria-busy={pending}
            className={cn("grid grid-cols-2 gap-3 transition-opacity sm:grid-cols-3 lg:grid-cols-4", pending && "opacity-60")}
          >
            {offers.map((o) => (
              <li key={o.id} className="flex">
                <OfferCard offer={o} storeName={storeName.get(o.source_id) ?? ""} />
              </li>
            ))}
          </ul>
          {total > offers.length &&
            (query.n < MAX_OFFERS ? (
              <Link
                href={href({ ...query, n: query.n + PAGE_SIZE })}
                scroll={false}
                prefetch={false}
                className={cn(buttonVariants({ variant: "outline", size: "lg" }), "mx-auto flex min-h-11 w-fit")}
              >
                Показать ещё ({total - offers.length})
              </Link>
            ) : (
              <p className="text-muted-foreground text-center text-sm">
                Показаны первые {MAX_OFFERS} из {total}. Уточните поиск или выберите магазин.
              </p>
            ))}
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-muted-foreground text-sm">Ничего не найдено по этим фильтрам.</p>
          <Button variant="outline" size="lg" className="min-h-11" onClick={() => {
              if (input.current) input.current.value = "";
              update({ q: "", store: null, cond: false, scope: false });
            }}>
            Сбросить
          </Button>
        </div>
      )}
    </section>
  );
}
