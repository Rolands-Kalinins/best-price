import { activeFilter, parseQuery, priceGap, searchTerms, storePrices } from "@bestprice/core";
import { redirect } from "next/navigation";
import { OfferFeed } from "@/components/offer-feed";
import { ProductCard } from "@/components/product-card";
import { SiteHeader } from "@/components/site-header";
import { StoreStatus } from "@/components/store-status";
import { createClient } from "@/lib/supabase/server";

// Страница персональная (RLS по сессии), пререндер не нужен.
export const instant = false;

// Без служебных search и external_id: ответ с сотнями карточек остаётся лёгким. Должны совпадать с OfferRow в components/offer-card.tsx.
const OFFER_COLUMNS =
  "id, source_id, title, packaging, price, old_price, discount_percent, unit_price, unit, condition, ends_at, url, image_url" as const;
// !inner: товары без действующих акций отсеиваются в запросе и не занимают лимит.
const PRODUCT_COLUMNS = `id, title, offers!inner(${OFFER_COLUMNS})` as const;

// Столбец и направление сортировки; id добавляется вторым ключом, иначе «Показать ещё» может повторять и терять строки.
const ORDER = {
  discount: { column: "discount", ascending: false },
  price: { column: "price", ascending: true },
  ends: { column: "ends_at", ascending: true },
} as const;

export default async function GroceryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  // Первое значение каждого параметра, как у URLSearchParams.get.
  const sp = new URLSearchParams(
    Object.entries(await searchParams).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : v?.[0] !== undefined ? [[k, v[0]]] : [])),
  );
  const query = parseQuery(sp);

  // Объединённые карточки («тот же товар в нескольких магазинах») показываем в общей ленте. Фильтр по магазину, условию или скидке на бренд
  // показывает акции как есть, иначе из выбранного магазина пропали бы товары, ушедшие в карточки.
  const merged = query.store === null && !query.cond && !query.scope;

  // Карточки сравнения считаем первыми: из ленты скрываем только акции, которые реально попали в карточку. Товар, у которого осталось меньше
  // двух магазинов (акция кончилась после пересчёта) или который не влез в лимит, показывается в ленте как обычные акции.
  const sideRes = Promise.all([
    supabase.from("sources").select("id, name").eq("module", "grocery").eq("enabled", true),
    supabase.from("scrape_runs").select("source_id, finished_at").eq("status", "success").order("finished_at", { ascending: false }).limit(50),
    supabase.rpc("is_member"),
    supabase.rpc("is_admin"),
  ]);
  const productsRes = merged ? await productsQuery(supabase, query.q) : null;
  const products = (productsRes?.data ?? [])
    .map((p) => ({ id: p.id, title: p.title, offers: storePrices(p.offers) }))
    .filter((p) => p.offers.length >= 2)
    .map((p) => ({ ...p, gap: priceGap(p.offers.at(-1)!.price, p.offers[0].price).pct }))
    .sort((a, b) => b.gap - a.gap);

  // Устаревшие акции скрываем по дате окончания (FR-33); без даты — по давности последнего запуска (FR-34).
  let offersQuery = supabase
    .schema("grocery")
    .from("offers")
    .select(OFFER_COLUMNS, { count: "exact" })
    .or(activeFilter(new Date()));
  // Скрываем только те акции, что показаны в карточках (по одной на магазин); остальные акции товара остаются в ленте.
  if (products.length) offersQuery = offersQuery.not("id", "in", `(${products.flatMap((p) => p.offers.map((o) => o.id)).join(",")})`);
  if (query.store !== null) offersQuery = offersQuery.eq("source_id", query.store);
  if (query.cond) offersQuery = offersQuery.not("condition", "is", null);
  if (query.scope) offersQuery = offersQuery.is("price", null);
  // Каждое слово ищется по столбцу search (название и бренд без диакритики); маски like searchTerms уже убрал.
  for (const w of searchTerms(query.q)) offersQuery = offersQuery.like("search", `%${w}%`);
  const { column, ascending } = ORDER[query.sort];

  const [offersRes, [sourcesRes, runsRes, memberRes, adminRes]] = await Promise.all([
    offersQuery.order(column, { ascending, nullsFirst: false }).order("id").range(0, query.n - 1),
    sideRes,
  ]);

  // Не участник попадает на «Доступ закрыт» (/), а не на пустую ленту.
  if (!memberRes.data) redirect("/");
  // Ошибка запроса не должна выглядеть как «нет данных»: бросаем, показывается error.tsx с «Повторить».
  const failed = offersRes.error ?? sourcesRes.error ?? runsRes.error ?? productsRes?.error;
  if (failed) throw new Error(failed.message);

  const lastRun = new Map<number, string>();
  runsRes.data?.forEach((r) => lastRun.has(r.source_id) || lastRun.set(r.source_id, r.finished_at));
  const stores = (sourcesRes.data ?? []).map((s) => ({ ...s, lastRun: lastRun.get(s.id) ?? null }));
  const storeName = new Map(stores.map((s) => [s.id, s.name]));
  const offers = offersRes.data ?? [];

  const total = (offersRes.count ?? offers.length) + products.length;
  const unfiltered = !query.q && query.store === null && !query.cond && !query.scope;

  return (
    <>
      <SiteHeader email={auth.user.email ?? ""} isAdmin={adminRes.data === true} />
      <main className="mx-auto w-full max-w-6xl space-y-4 p-4">
        <h1 className="text-2xl font-semibold">Акции</h1>
        <StoreStatus stores={stores} />
        {total === 0 && unfiltered ? (
          <p className="text-muted-foreground py-12 text-center text-sm">
            Сейчас нет действующих акций. Состояние запусков показано выше.
          </p>
        ) : (
          // Чипы магазинов только для тех, у кого был успешный запуск: пустой чип ничего не покажет.
          <OfferFeed
            offers={offers}
            total={offersRes.count ?? offers.length}
            stores={stores.filter((s) => s.lastRun)}
            query={query}
            compare={
              products.length > 0 && (
                <section aria-label="Сравнение цен" className="space-y-3">
                  <h2 className="text-lg font-semibold">Где дешевле ({products.length})</h2>
                  <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {products.map((p) => (
                      <li key={p.id} className="flex *:w-full">
                        <ProductCard title={p.title} offers={p.offers} storeName={storeName} />
                      </li>
                    ))}
                  </ul>
                </section>
              )
            }
          />
        )}
      </main>
    </>
  );
}

// Товары, найденные в нескольких магазинах (products ведёт `pnpm --filter @bestprice/matcher match`). При поиске берём только те,
// у которых нашлась подходящая акция. ponytail: потолок 200 товаров; пагинация, когда сравниваемых товаров станет больше.
async function productsQuery(supabase: Awaited<ReturnType<typeof createClient>>, q: string) {
  const terms = searchTerms(q);
  let ids: number[] | null = null;
  if (terms.length) {
    let hits = supabase.schema("grocery").from("offers").select("product_id").not("product_id", "is", null).or(activeFilter(new Date()));
    for (const w of terms) hits = hits.like("search", `%${w}%`);
    const { data, error } = await hits.order("id").limit(1000);
    if (error) return { data: null, error };
    ids = [...new Set(data.map((r) => r.product_id!))];
    if (!ids.length) return { data: [], error: null };
  }
  let products = supabase
    .schema("grocery")
    .from("products")
    .select(PRODUCT_COLUMNS)
    .or(activeFilter(new Date()), { referencedTable: "offers" })
    .order("id")
    .limit(200);
  if (ids) products = products.in("id", ids);
  return products;
}
