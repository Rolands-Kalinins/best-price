import { cardActive, freshSince, groupMembers, type GroupMember, PHARMACY_CATEGORIES, priceGap, priceSummary, safeHttpUrl, storeColor } from "@bestprice/core";
import { ChevronRight, CreditCard, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { SiteHeader } from "@/components/site-header";
import { buttonVariants } from "@/components/ui/button";
import { ZoomImage } from "@/components/zoom-image";
import { ago, eur, num, plural, shortDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

// Страница персональная (RLS по сессии), пререндер не нужен.
export const instant = false;

const COLUMNS = "id, group_id, source_id, title, brand, cat, price, old_price, discount, card_price, card_condition, card_starts_at, card_ends_at, prescription, url, image_url, last_seen_at" as const;

// Один запрос товара на страницу и на generateMetadata (cache живёт в пределах запроса).
const getProduct = cache(async (id: number) => {
  const supabase = await createClient();
  return supabase.schema("pharmacy").from("products").select(COLUMNS).eq("id", id).eq("in_stock", true).gt("last_seen_at", freshSince(new Date())).maybeSingle();
});

// Название товара в заголовке вкладки: история, закладки и вкладки различимы. Нет товара или доступа: общий заголовок.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const id = Number((await params).id);
  const title = Number.isSafeInteger(id) && id > 0 ? (await getProduct(id)).data?.title : null;
  return { title: title || "Сравнение цен" };
}

export default async function PharmacyProductPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const now = new Date();
  const [productRes, sourcesRes, memberRes, adminRes] = await Promise.all([
    getProduct(id),
    supabase.from("sources").select("id, name, slug").eq("module", "pharmacy").eq("enabled", true),
    supabase.rpc("is_member"),
    supabase.rpc("is_admin"),
  ]);
  if (!memberRes.data) redirect("/");
  const failed = productRes.error ?? sourcesRes.error;
  if (failed) throw new Error(failed.message);
  const p = productRes.data;
  if (!p) notFound();

  // numeric из PostgREST может прийти строкой: приводим к числам в одном месте.
  const toMember = <R extends { price: number; old_price: number | null; card_price: number | null }>(r: R): R => ({
    ...r,
    price: Number(r.price),
    old_price: r.old_price === null ? null : Number(r.old_price),
    card_price: r.card_price === null ? null : Number(r.card_price),
  });

  // Тот же товар в других аптеках (group_id ставит matcher); без группы таблица из одной строки.
  // Время последнего показа парсером берём отдельным запросом по группе: group_members его не отдаёт (смена типа функции сломала бы старый код при выкладке).
  const seen = new Map<number, string>([[p.id, p.last_seen_at]]);
  let members: Omit<GroupMember, "group_id">[] = [toMember(p)];
  if (p.group_id !== null) {
    const [res, seenRes] = await Promise.all([
      supabase.schema("pharmacy").rpc("group_members", { gids: [p.group_id] }),
      supabase.schema("pharmacy").from("products").select("id, last_seen_at").eq("group_id", p.group_id),
    ]);
    const err = res.error ?? seenRes.error;
    if (err) throw new Error(err.message);
    for (const r of seenRes.data ?? []) seen.set(r.id, r.last_seen_at);
    const rows = res.data ?? [];
    if (rows.length) members = groupMembers(rows.map(toMember)).get(p.group_id) ?? members;
  }
  const stores = new Map((sourcesRes.data ?? []).map((s) => [s.id, s]));

  const best = members[0].price;
  const multi = members.length > 1;
  const sum = priceSummary(members);
  const category = PHARMACY_CATEGORIES.find((c) => c.slug === p.cat);
  const image = safeHttpUrl(members.find((m) => m.image_url)?.image_url ?? p.image_url);

  return (
    <>
      <SiteHeader email={auth.user.email ?? ""} isAdmin={adminRes.data === true} />
      <main id="main" className="mx-auto w-full max-w-4xl space-y-4 p-4">
        <nav aria-label="Путь" className="text-muted-foreground flex flex-wrap items-center gap-1 text-sm">
          <Link href="/pharmacy" className="hover:text-foreground">Аптеки</Link>
          {category && (
            <>
              <ChevronRight className="size-4" aria-hidden />
              <Link href={`/pharmacy?cat=${category.slug}`} className="hover:text-foreground">{category.name}</Link>
            </>
          )}
        </nav>

        <section className="bg-card flex flex-col gap-4 rounded-2xl border p-4 sm:flex-row">
          <ZoomImage src={image} title={p.title} className="aspect-square w-full max-w-56 self-center border sm:w-56 sm:self-start" />
          <div className="min-w-0 space-y-2">
            {p.brand && <p className="text-muted-foreground text-sm">{p.brand}</p>}
            <h1 lang="lv" className="text-2xl font-semibold break-words">{p.title}</h1>
            {category && <p className="text-muted-foreground text-sm">{category.name}</p>}
            {p.prescription && <p className="text-muted-foreground text-sm font-medium">Рецептурное</p>}
          </div>
        </section>

        <section aria-labelledby="prices" className="bg-card rounded-2xl border">
          <div className="border-primary space-y-1 rounded-t-2xl border-t-2 p-4">
            <h2 id="prices" className="text-lg font-semibold">Сравнение цен</h2>
            <p className="text-muted-foreground text-sm">
              {sum.count > 1 ? (
                <>
                  Цена от <b className="font-price text-foreground tabular-nums">{eur(sum.min)}</b> до <b className="font-price text-foreground tabular-nums">{eur(sum.max)}</b> · {num(sum.count)}{" "}
                  {plural(sum.count, "аптека", "аптеки", "аптек")} · разница до <b className="text-foreground">{sum.spreadPct}%</b>
                </>
              ) : (
                "Товар есть в одной аптеке"
              )}
            </p>
          </div>
          <ul className="divide-y border-t">
            {members.map((m, i) => {
              const store = stores.get(m.source_id);
              const href = safeHttpUrl(m.url);
              const gap = priceGap(m.price, best);
              const card = cardActive(m, now) && m.card_price !== null;
              const at = seen.get(m.id);
              return (
                <li key={m.id} className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 p-4", i === 0 && multi && "bg-accent/50")}>
                  <div className="min-w-0 flex-1 basis-40">
                    <p className="flex items-center gap-2 font-medium">
                      <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: storeColor(store?.slug ?? "") }} />
                      <span className="truncate">{store?.name ?? "Аптека"}</span>
                      {i === 0 && multi && (
                        <span className="bg-primary text-primary-foreground shrink-0 rounded-md px-1.5 py-0.5 text-xs font-semibold">Дешевле всего</span>
                      )}
                    </p>
                    {at && <p className="text-muted-foreground text-xs">обновлено {ago(at)}</p>}
                    {card && (
                      <p className="text-muted-foreground mt-0.5 flex items-center gap-1 text-xs">
                        <CreditCard className="size-3 shrink-0" aria-hidden />
                        <span className="font-price tabular-nums">{eur(m.card_price!)}</span> по карте
                        {m.card_ends_at && <> до {shortDate(m.card_ends_at)}</>}
                        {m.card_condition && <> · {m.card_condition}</>}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="flex items-baseline justify-end gap-2">
                      {m.discount && m.old_price && (
                        <s className="font-price text-muted-foreground text-sm tabular-nums">
                          <span className="sr-only">Было </span>
                          {eur(m.old_price)}
                        </s>
                      )}
                      <span className={cn("font-price text-xl font-bold tabular-nums", i === 0 && "text-primary")}>{eur(m.price)}</span>
                    </p>
                    {i > 0 && <p className={cn("text-muted-foreground text-xs tabular-nums", gap.eur !== 0 && "font-price")}>{gap.eur === 0 ? "та же цена" : `+${eur(gap.eur)} (+${gap.pct}%)`}</p>}
                  </div>
                  {href && (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(buttonVariants({ variant: i === 0 ? "default" : "outline", size: "lg" }), "min-h-11 gap-1.5 px-4")}
                    >
                      В аптеку
                      <ExternalLink className="size-3.5" aria-hidden />
                      <span className="sr-only"> (откроется в новой вкладке)</span>
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-muted-foreground border-t p-4 text-xs">Цены взяты с сайтов аптек и могут отличаться от цен в магазине. Точную цену смотрите у аптеки.</p>
        </section>
      </main>
    </>
  );
}
