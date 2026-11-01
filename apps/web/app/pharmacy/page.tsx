import { freshSince, groupMembers, parsePharmacyQuery, searchGroups, searchOrClause } from "@bestprice/core";
import { redirect } from "next/navigation";
import { PharmacyFeed } from "@/components/pharmacy-feed";
import { SiteHeader } from "@/components/site-header";
import { StoreStatus } from "@/components/store-status";
import { createClient } from "@/lib/supabase/server";

// Страница персональная (RLS по сессии), пререндер не нужен.
export const instant = false;

// Без служебных search и external_id: ответ с сотнями карточек остаётся лёгким. Должны совпадать с PharmacyRow в components/pharmacy-card.tsx.
const COLUMNS =
  "id, source_id, group_id, title, brand, price, old_price, discount, card_price, card_condition, card_starts_at, card_ends_at, prescription, url, image_url" as const;

export default async function PharmacyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  // Первое значение каждого параметра, как у URLSearchParams.get.
  const sp = new URLSearchParams(
    Object.entries(await searchParams).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : v?.[0] !== undefined ? [[k, v[0]]] : [])),
  );
  const query = parsePharmacyQuery(sp);
  const now = new Date();
  const iso = now.toISOString();

  // Каталог хранится целиком, пропавший из магазина товар сам не удаляется: показываем только виденное парсером за последние дни.
  let products = supabase.schema("pharmacy").from("products").select(COLUMNS, { count: "exact" }).gt("last_seen_at", freshSince(now)).eq("in_stock", true);
  // Один товар в нескольких аптеках показываем одной карточкой (самый дешёвый). С выбранной аптекой показываем все её товары, группа видна внутри карточки.
  products = query.store !== null ? products.eq("source_id", query.store) : products.eq("group_rep", true);
  if (query.cat) products = products.eq("cat", query.cat);
  if (query.sale) products = products.not("discount", "is", null);
  // Цена по карте в свой срок (пустая дата = без ограничения); два or() соединяются через «и».
  if (query.card) {
    products = products
      .not("card_price", "is", null)
      .or(`card_starts_at.is.null,card_starts_at.lte.${iso}`)
      .or(`card_ends_at.is.null,card_ends_at.gt.${iso}`);
  }
  // Каждое слово ищется по столбцу search (название и бренд без диакритики); русское слово из словаря даёт группу латышских основ.
  for (const g of searchGroups(query.q)) {
    const or = searchOrClause(g);
    products = or ? products.or(or) : products.like("search", `%${g[0]}%`);
  }
  // id вторым ключом, иначе «Показать ещё» может повторять и терять строки.
  const ordered =
    query.sort === "discount"
      ? products.order("discount", { ascending: false, nullsFirst: false }).order("price")
      : query.sort === "price"
        ? products.order("price")
        : products.order("title");

  const [productsRes, sourcesRes, runsRes, memberRes, adminRes] = await Promise.all([
    ordered.order("id").range(0, query.n - 1),
    supabase.from("sources").select("id, name").eq("module", "pharmacy").eq("enabled", true),
    supabase.rpc("last_scrape_success"), // журнал запусков виден только админу (RLS), участнику отдаётся лишь время последнего успеха
    supabase.rpc("is_member"),
    supabase.rpc("is_admin"),
  ]);

  // Не участник попадает на «Доступ закрыт» (/), а не на пустую страницу.
  if (!memberRes.data) redirect("/");
  // Ошибка запроса не должна выглядеть как «нет данных»: бросаем, показывается error.tsx с «Повторить».
  const failed = productsRes.error ?? sourcesRes.error ?? runsRes.error;
  if (failed) throw new Error(failed.message);

  // Один и тот же товар в разных аптеках (group_id ставит matcher): карточка показывает все цены. Один запрос на все показанные карточки.
  const gids = [...new Set(productsRes.data?.flatMap((p) => (p.group_id === null ? [] : [p.group_id])))];
  const membersRes = gids.length ? await supabase.schema("pharmacy").rpc("group_members", { gids }) : null;
  if (membersRes?.error) throw new Error(membersRes.error.message);
  const members = Object.fromEntries(groupMembers((membersRes?.data ?? []).map((r) => ({ ...r, price: Number(r.price), old_price: r.old_price === null ? null : Number(r.old_price), card_price: r.card_price === null ? null : Number(r.card_price) }))));

  const lastRun = new Map((runsRes.data ?? []).map((r) => [r.source_id, r.finished_at]));
  const stores = (sourcesRes.data ?? []).map((s) => ({ ...s, lastRun: lastRun.get(s.id) ?? null }));
  const rows = productsRes.data ?? [];
  const total = productsRes.count ?? rows.length;
  const unfiltered = !query.q && query.store === null && !query.cat && !query.sale && !query.card;

  return (
    <>
      <SiteHeader email={auth.user.email ?? ""} isAdmin={adminRes.data === true} />
      <main className="mx-auto w-full max-w-6xl space-y-4 p-4">
        <h1 className="text-2xl font-semibold">Аптеки</h1>
        <StoreStatus stores={stores} />
        {total === 0 && unfiltered ? (
          <p className="text-muted-foreground py-12 text-center text-sm">
            Товаров пока нет: парсеры аптек ещё не запускались. Состояние запусков показано выше.
          </p>
        ) : (
          // Чипы аптек только для тех, у кого был успешный запуск: пустой чип ничего не покажет.
          <PharmacyFeed products={rows} total={total} members={members} stores={stores.filter((s) => s.lastRun)} query={query} />
        )}
      </main>
    </>
  );
}
