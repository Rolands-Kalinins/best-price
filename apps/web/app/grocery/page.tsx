import { activeFilter, parseQuery, priceGap, searchGroups, searchOrClause, storePrices } from "@bestprice/core";
import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { OfferFeed } from "@/components/offer-feed";
import { ProductCard } from "@/components/product-card";
import { SiteHeader } from "@/components/site-header";
import { StoreStatus } from "@/components/store-status";
import { num } from "@/lib/format";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Акции" };

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
    supabase.from("sources").select("id, name, slug").eq("module", "grocery").eq("enabled", true),
    supabase.rpc("last_scrape_success"), // журнал запусков виден только админу (RLS), участнику отдаётся лишь время последнего успеха
    supabase.rpc("is_member"),
    supabase.rpc("is_admin"),
  ]);
  const productsRes = merged ? await productsQuery(supabase, query.q, query.cat) : null;
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
  if (query.cat) offersQuery = offersQuery.eq("cat", query.cat);
  if (query.cond) offersQuery = offersQuery.not("condition", "is", null);
  if (query.scope) offersQuery = offersQuery.is("price", null);
  // Каждое слово ищется по столбцу search (название и бренд без диакритики); маски like searchTerms уже убрал.
  // Русское слово из словаря даёт группу латышских основ: хватает любой (or). Основы без запятых и скобок, пользовательский текст в or() не попадает.
  for (const g of searchGroups(query.q)) {
    const or = searchOrClause(g);
    offersQuery = or ? offersQuery.or(or) : offersQuery.like("search", `%${g[0]}%`);
  }
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

  const lastRun = new Map((runsRes.data ?? []).map((r) => [r.source_id, r.finished_at]));
  const stores = (sourcesRes.data ?? []).map((s) => ({ ...s, lastRun: lastRun.get(s.id) ?? null }));
  const storeName = new Map(stores.map((s) => [s.id, s.name]));
  const offers = offersRes.data ?? [];

  const total = (offersRes.count ?? offers.length) + products.length;
  // Ссылка переключает только «all»: остальные условия (поиск, фильтры, «Показать ещё») сохраняются.
  const toggled = new URLSearchParams(sp);
  if (query.all) toggled.delete("all");
  else toggled.set("all", "1");
  const compareHref = `/grocery${toggled.size ? `?${toggled}` : ""}`;
  const unfiltered = !query.q && query.store === null && !query.cat && !query.cond && !query.scope;

  return (
    <>
      <SiteHeader email={auth.user.email ?? ""} isAdmin={adminRes.data === true} />
      <main id="main" className="mx-auto w-full max-w-7xl space-y-4 p-4">
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
                  {/* В страницу идут только первые карточки: все 200 с картинками давали 2,5 МБ HTML. На телефоне видны 3, шире 6. */}
                  <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {(query.all ? products : products.slice(0, 6)).map((p, i) => (
                      <li key={p.id} className={cn("flex *:w-full", i >= 3 && !query.all && "max-sm:hidden")}>
                        <ProductCard title={p.title} offers={p.offers} storeName={storeName} />
                      </li>
                    ))}
                  </ul>
                  {products.length > 3 && (
                    <Link
                      href={compareHref}
                      scroll={false}
                      prefetch={false}
                      className={cn(buttonVariants({ variant: "outline", size: "lg" }), "mx-auto flex min-h-11 w-fit", !query.all && products.length <= 6 && "sm:hidden")}
                    >
                      {query.all ? "Свернуть" : `Показать все (${num(products.length)})`}
                    </Link>
                  )}
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
// у которых нашлась подходящая акция; то же при выбранной категории. ponytail: потолок 200 товаров и 1000 подходящих акций с product_id
// (сейчас связанных акций ~230 всего); пагинация, когда сравниваемых товаров станет больше.
async function productsQuery(supabase: Awaited<ReturnType<typeof createClient>>, q: string, cat: string | null) {
  const groups = searchGroups(q);
  let ids: number[] | null = null;
  if (groups.length || cat) {
    let hits = supabase.schema("grocery").from("offers").select("product_id").not("product_id", "is", null).or(activeFilter(new Date()));
    if (cat) hits = hits.eq("cat", cat);
    for (const g of groups) {
      const or = searchOrClause(g);
      hits = or ? hits.or(or) : hits.like("search", `%${g[0]}%`);
    }
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
