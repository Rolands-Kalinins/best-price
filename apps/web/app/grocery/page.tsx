import { activeFilter, parseQuery, searchTerms } from "@bestprice/core";
import { redirect } from "next/navigation";
import { OfferFeed } from "@/components/offer-feed";
import { SiteHeader } from "@/components/site-header";
import { StoreStatus } from "@/components/store-status";
import { createClient } from "@/lib/supabase/server";

// Страница персональная (RLS по сессии), пререндер не нужен.
export const instant = false;

// Без служебных search и external_id: ответ с сотнями карточек остаётся лёгким. Должны совпадать с OfferRow в components/offer-card.tsx.
const OFFER_COLUMNS =
  "id, source_id, title, packaging, price, old_price, discount_percent, unit_price, unit, condition, ends_at, url, image_url" as const;

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

  // Устаревшие акции скрываем по дате окончания (FR-33); без даты — по давности последнего запуска (FR-34).
  let offersQuery = supabase
    .schema("grocery")
    .from("offers")
    .select(OFFER_COLUMNS, { count: "exact" })
    .or(activeFilter(new Date()));
  if (query.store !== null) offersQuery = offersQuery.eq("source_id", query.store);
  if (query.cond) offersQuery = offersQuery.not("condition", "is", null);
  if (query.scope) offersQuery = offersQuery.is("price", null);
  // Каждое слово ищется по столбцу search (название и бренд без диакритики); маски like searchTerms уже убрал.
  for (const w of searchTerms(query.q)) offersQuery = offersQuery.like("search", `%${w}%`);
  const { column, ascending } = ORDER[query.sort];

  const [offersRes, sourcesRes, runsRes, memberRes] = await Promise.all([
    offersQuery.order(column, { ascending, nullsFirst: false }).order("id").range(0, query.n - 1),
    supabase.from("sources").select("id, name").eq("module", "grocery").eq("enabled", true),
    supabase
      .from("scrape_runs")
      .select("source_id, finished_at")
      .eq("status", "success")
      .order("finished_at", { ascending: false })
      .limit(50),
    supabase.rpc("is_member"),
  ]);

  // Не участник попадает на «Доступ закрыт» (/), а не на пустую ленту.
  if (!memberRes.data) redirect("/");
  // Ошибка запроса не должна выглядеть как «нет данных»: бросаем, показывается error.tsx с «Повторить».
  const failed = offersRes.error ?? sourcesRes.error ?? runsRes.error;
  if (failed) throw new Error(failed.message);

  const lastRun = new Map<number, string>();
  runsRes.data?.forEach((r) => lastRun.has(r.source_id) || lastRun.set(r.source_id, r.finished_at));
  const stores = (sourcesRes.data ?? []).map((s) => ({ ...s, lastRun: lastRun.get(s.id) ?? null }));
  const offers = offersRes.data ?? [];
  const total = offersRes.count ?? offers.length;
  const unfiltered = !query.q && query.store === null && !query.cond && !query.scope;

  return (
    <>
      <SiteHeader email={auth.user.email ?? ""} />
      <main className="mx-auto w-full max-w-6xl space-y-4 p-4">
        <h1 className="text-2xl font-semibold">Акции</h1>
        <StoreStatus stores={stores} />
        {total === 0 && unfiltered ? (
          <p className="text-muted-foreground py-12 text-center text-sm">
            Сейчас нет действующих акций. Состояние запусков показано выше.
          </p>
        ) : (
          // Чипы магазинов только для тех, у кого был успешный запуск: пустой чип ничего не покажет.
          <OfferFeed offers={offers} total={total} stores={stores.filter((s) => s.lastRun)} query={query} />
        )}
      </main>
    </>
  );
}
