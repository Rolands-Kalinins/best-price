"use client";

import { CATEGORIES, MAX_OFFERS, PAGE_SIZE, type OfferQuery, type OfferSort } from "@bestprice/core";
import Link from "next/link";
import type { ReactNode } from "react";
import { FeedFilters, useFeed } from "@/components/feed-filters";
import { OfferCard, type OfferRow } from "@/components/offer-card";
import { buttonVariants } from "@/components/ui/button";
import { num } from "@/lib/format";
import { cn } from "@/lib/utils";

const SORT_LABELS: Record<OfferSort, string> = {
  discount: "Сначала выгодные",
  price: "Сначала дешёвые",
  ends: "Скоро закончатся",
};

// Параметры без значений по умолчанию не пишем: ссылка остаётся короткой.
function toSearch(q: OfferQuery) {
  const sp = new URLSearchParams();
  if (q.q) sp.set("q", q.q);
  if (q.store !== null) sp.set("store", String(q.store));
  if (q.cat) sp.set("cat", q.cat);
  if (q.cond) sp.set("cond", "1");
  if (q.scope) sp.set("scope", "1");
  if (q.all) sp.set("all", "1");
  if (q.sort !== "discount") sp.set("sort", q.sort);
  if (q.n > PAGE_SIZE) sp.set("n", String(q.n));
  return sp.toString();
}
const href = (q: OfferQuery) => {
  const search = toSearch(q);
  return search ? `/grocery?${search}` : "/grocery";
};

// Акции отбирает сервер: в базе тысячи строк. Фильтры и поиск общие с аптеками (feed-filters.tsx).
export function OfferFeed({
  offers,
  total,
  stores,
  query,
  compare,
}: {
  offers: OfferRow[];
  total: number;
  stores: { id: number; name: string }[];
  query: OfferQuery;
  compare?: ReactNode;
}) {
  const feed = useFeed(query, href);
  const storeName = new Map(stores.map((s) => [s.id, s.name]));

  return (
    <section className="space-y-4">
      <FeedFilters
        feed={feed}
        query={query}
        searchLabel="Поиск по акциям"
        placeholder="Поиск: молоко, piens, Milka…"
        allStores="Все магазины"
        stores={stores}
        toggles={[
          { label: "С условием", on: query.cond, patch: { cond: !query.cond } },
          { label: "Скидки на бренд или категорию", on: query.scope, patch: { scope: !query.scope } },
        ]}
        categories={CATEGORIES}
        sortLabels={SORT_LABELS}
        total={num(total)}
        cleared={{ store: null, cat: null, cond: false, scope: false }}
      />

      {compare}
      {offers.length ? (
        <>
          <ul
            aria-busy={feed.pending}
            className={cn("grid grid-cols-2 gap-3 transition-opacity sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5", feed.pending && "opacity-60")}
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
                Показать ещё ({num(total - offers.length)})
              </Link>
            ) : (
              <p className="text-muted-foreground text-center text-sm">
                Показаны первые {num(MAX_OFFERS)} из {num(total)}. Уточните поиск или выберите магазин.
              </p>
            ))}
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-muted-foreground text-sm">Ничего не найдено по этим фильтрам. Сбросьте их кнопкой выше.</p>
        </div>
      )}
    </section>
  );
}
