"use client";

import { cardActive, type GroupMember, priceSummary, safeHttpUrl, storeColor, type Database } from "@bestprice/core";
import { CreditCard, ImageOff } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { eur, plural, shortDate } from "@/lib/format";

// Столбцы выбирает страница (COLUMNS в app/pharmacy/page.tsx): серверной константе нельзя жить в клиентском модуле.
export type PharmacyRow = Pick<
  Database["pharmacy"]["Tables"]["products"]["Row"],
  | "id" | "source_id" | "group_id" | "title" | "brand" | "price" | "old_price" | "discount" | "card_price" | "card_condition" | "card_starts_at" | "card_ends_at"
  | "prescription" | "image_url"
>;

export type StoreMap = Map<number, { name: string; slug: string }>;

// members: тот же товар во всех аптеках (если есть группа). Карточка показывает цену этой аптеки и «ещё в N аптеках», сравнение цен лежит на странице товара.
export function PharmacyCard({ product: p, members, stores }: { product: PharmacyRow; members?: GroupMember[]; stores: StoreMap }) {
  const [imgFailed, setImgFailed] = useState(false);
  const store = stores.get(p.source_id);
  const image = safeHttpUrl(p.image_url);
  const range = members ? priceSummary(members) : null;
  const others = range ? range.count - 1 : 0;
  // «от» только у самой дешёвой аптеки группы: с фильтром по аптеке карточка может быть и не самой дешёвой.
  const cheapest = others > 0 && p.price <= range!.min;
  // Цена по карте только в свой срок: Mēness и Euroaptieka присылают даты, закончившаяся скидка не должна висеть (проверяется на показе).
  const card = cardActive(p, new Date());
  // Ошибка могла случиться до гидратации — тогда onError уже не сработает.
  const checkBroken = useCallback((el: HTMLImageElement | null) => {
    if (el?.complete && el.naturalWidth === 0) setImgFailed(true);
  }, []);

  return (
    <article
      className={
        "bg-card w-full has-[a:focus-visible]:ring-ring/60 relative flex flex-col overflow-hidden rounded-2xl border transition-shadow has-[a:focus-visible]:ring-3 motion-reduce:transition-none [@media(hover:hover)]:hover:shadow-md"
      }
    >
      <div className="relative aspect-square bg-white">
        {image && !imgFailed ? (
          // eslint-disable-next-line @next/next/no-img-element -- next/image не используем: лимит оптимизации на Vercel Hobby
          <img
            src={image}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            ref={checkBroken}
            className="absolute inset-0 size-full object-contain p-3"
          />
        ) : (
          <div className="text-muted-foreground/60 absolute inset-0 flex flex-col items-center justify-center gap-1 text-xs">
            <ImageOff className="size-6" aria-hidden />
            Нет фото
          </div>
        )}
        {p.discount && (
          <span className="bg-sale text-sale-foreground absolute top-2 left-2 rounded-lg px-2 py-1 text-sm font-bold tabular-nums">
            −{p.discount}%
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        {p.brand && <p className="text-muted-foreground truncate text-xs">{p.brand}</p>}
        <h2 lang="lv" className="line-clamp-3 text-sm leading-snug font-medium break-words">
          <Link href={`/pharmacy/${p.id}`} className="outline-none after:absolute after:inset-0">
            {p.title}
          </Link>
        </h2>
        <div className="mt-auto flex flex-wrap items-baseline gap-x-2 pt-2">
          <span className="text-xl font-bold tabular-nums">
            {cheapest && <span className="text-muted-foreground mr-1 text-sm font-medium">от</span>}
            {eur(p.price)}
          </span>
          {p.discount && p.old_price && (
            <s className="text-muted-foreground text-sm tabular-nums">
              <span className="sr-only">Было </span>
              {eur(p.old_price)}
            </s>
          )}
        </div>
        {store && (
          <p className="flex items-center gap-1.5 text-xs font-medium">
            <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: storeColor(store.slug) }} />
            <span className="truncate">{store.name}</span>
          </p>
        )}
        {range && others > 0 && (
          <p className="text-muted-foreground text-xs tabular-nums">
            ещё в {others} {plural(others, "аптеке", "аптеках", "аптеках")} · {range.min === range.max ? eur(range.min) : `${eur(range.min)}–${eur(range.max)}`}
          </p>
        )}
        {card && p.card_price !== null && (
          <p
            title={p.card_condition ?? undefined}
            className="bg-accent text-accent-foreground mt-1 flex flex-wrap items-center gap-x-1 gap-y-0.5 self-start rounded-md px-2 py-1 text-xs font-medium"
          >
            <CreditCard className="size-3 shrink-0" aria-hidden />
            <span className="tabular-nums">{eur(p.card_price)}</span> по карте
            {p.card_ends_at && <span className="text-muted-foreground font-normal">до {shortDate(p.card_ends_at)}</span>}
          </p>
        )}
        {card && p.card_condition && <p className="text-muted-foreground text-xs">{p.card_condition}</p>}
        {p.prescription && <p className="text-muted-foreground text-xs font-medium">Рецептурное</p>}
      </div>
    </article>
  );
}
