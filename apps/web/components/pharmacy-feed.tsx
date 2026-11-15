"use client";

import { type GroupMember, MAX_OFFERS, PAGE_SIZE, PHARMACY_CATEGORIES, type PharmacyQuery, type PharmacySort } from "@bestprice/core";
import Link from "next/link";
import { FeedFilters, useFeed } from "@/components/feed-filters";
import { PharmacyCard, type PharmacyRow } from "@/components/pharmacy-card";
import { buttonVariants } from "@/components/ui/button";
import { num } from "@/lib/format";
import { cn } from "@/lib/utils";

const SORT_LABELS: Record<PharmacySort, string> = {
  discount: "Сначала выгодные",
  price: "Сначала дешёвые",
  name: "По алфавиту",
};

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

// Как OfferFeed: товары отбирает сервер, фильтры и поиск общие (feed-filters.tsx).
export function PharmacyFeed({
  products,
  total,
  members,
  stores,
  query,
}: {
  products: PharmacyRow[];
  total: number;
  members: Record<number, GroupMember[]>;
  stores: { id: number; name: string }[];
  query: PharmacyQuery;
}) {
  const feed = useFeed(query, href);
  const storeName = new Map(stores.map((s) => [s.id, s.name]));

  return (
    <section className="space-y-4">
      <FeedFilters
        feed={feed}
        query={query}
        searchLabel="Поиск по аптекам"
        placeholder="Поиск: vitamīns, ibumetin…"
        allStores="Все аптеки"
        stores={stores}
        toggles={[
          { label: "Со скидкой", on: query.sale, patch: { sale: !query.sale } },
          { label: "Цена по карте", on: query.card, patch: { card: !query.card } },
        ]}
        categories={PHARMACY_CATEGORIES}
        sortLabels={SORT_LABELS}
        total={num(total)}
        cleared={{ store: null, cat: null, sale: false, card: false }}
      />

      {products.length ? (
        <>
          <ul
            aria-busy={feed.pending}
            className={cn("grid grid-cols-2 gap-3 transition-opacity sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5", feed.pending && "opacity-60")}
          >
            {products.map((p) => (
              <li key={p.id} className="flex">
                <PharmacyCard product={p} storeName={storeName.get(p.source_id) ?? ""} members={p.group_id === null ? undefined : members[p.group_id]} stores={storeName} />
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
                Показать ещё ({num(total - products.length)})
              </Link>
            ) : (
              <p className="text-muted-foreground text-center text-sm">
                Показаны первые {num(MAX_OFFERS)} из {num(total)}. Уточните поиск или выберите аптеку.
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
