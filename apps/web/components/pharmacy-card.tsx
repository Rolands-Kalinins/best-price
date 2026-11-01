"use client";

import { cardActive, type PriceRow, safeHttpUrl, type Database } from "@bestprice/core";
import { CreditCard, ImageOff } from "lucide-react";
import { useCallback, useState } from "react";
import { eur, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

// Столбцы выбирает страница (PRODUCT_COLUMNS в app/pharmacy/page.tsx): серверной константе нельзя жить в клиентском модуле.
export type PharmacyRow = Pick<
  Database["pharmacy"]["Tables"]["products"]["Row"],
  | "id" | "source_id" | "ean" | "title" | "brand" | "price" | "old_price" | "discount" | "card_price" | "card_condition" | "card_starts_at" | "card_ends_at"
  | "prescription" | "in_stock" | "url" | "image_url"
>;

// compare: тот же товар в других аптеках (по штрихкоду); stores: id аптеки → название.
export type Compare = { others: PriceRow[]; cheaper: PriceRow | null };

export function PharmacyCard({ product: p, storeName, compare, stores }: { product: PharmacyRow; storeName: string; compare?: Compare; stores: Map<number, string> }) {
  const [imgFailed, setImgFailed] = useState(false);
  const href = safeHttpUrl(p.url);
  const image = safeHttpUrl(p.image_url);
  // Цена по карте только в свой срок: Mēness и Euroaptieka присылают даты, закончившаяся скидка не должна висеть (проверяется на показе).
  const card = cardActive(p, new Date());
  // Ошибка могла случиться до гидратации — тогда onError уже не сработает.
  const checkBroken = useCallback((el: HTMLImageElement | null) => {
    if (el?.complete && el.naturalWidth === 0) setImgFailed(true);
  }, []);

  return (
    <article
      className={
        "bg-card w-full has-[a:focus-visible]:ring-ring/60 relative flex flex-col overflow-hidden rounded-2xl border transition-shadow has-[a:focus-visible]:ring-3 motion-reduce:transition-none [@media(hover:hover)]:hover:shadow-md" +
        (p.in_stock ? "" : " opacity-70")
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
        <p className="text-muted-foreground text-xs">{storeName}</p>
        <h2 className="line-clamp-3 text-sm leading-snug font-medium break-words">
          {href ? (
            <a href={href} target="_blank" rel="noopener noreferrer" className="outline-none after:absolute after:inset-0">
              {p.title}
            </a>
          ) : (
            p.title
          )}
        </h2>
        <div className="mt-auto flex flex-wrap items-baseline gap-x-2 pt-2">
          <span className="text-xl font-bold tabular-nums">{eur(p.price)}</span>
          {p.discount && p.old_price && (
            <s className="text-muted-foreground text-sm tabular-nums">
              <span className="sr-only">Было </span>
              {eur(p.old_price)}
            </s>
          )}
        </div>
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
        {compare && (
          <p className={cn("mt-1 text-xs", compare.cheaper ? "text-destructive font-medium" : "text-muted-foreground")}>
            {compare.cheaper ? "Дешевле:" : "Также в:"} {compare.others.map((o) => `${stores.get(o.source_id) ?? "?"} ${eur(o.price)}`).join(" · ")}
          </p>
        )}
        {(p.prescription || !p.in_stock) && (
          <p className="text-muted-foreground text-xs font-medium">
            {[p.prescription && "Рецептурное", !p.in_stock && "Нет в наличии"].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
    </article>
  );
}
