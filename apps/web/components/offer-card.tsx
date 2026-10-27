"use client";

import { offerDiscount, safeHttpUrl, type Database } from "@bestprice/core";
import { ImageOff, Tag } from "lucide-react";
import { useCallback, useState } from "react";
import { eur, shortDate } from "@/lib/format";

// Столбцы выбирает страница (OFFER_COLUMNS в app/grocery/page.tsx): серверной константе нельзя жить в клиентском модуле.
export type OfferRow = Pick<
  Database["grocery"]["Tables"]["offers"]["Row"],
  | "id" | "source_id" | "title" | "packaging" | "price" | "old_price" | "discount_percent"
  | "unit_price" | "unit" | "condition" | "ends_at" | "url" | "image_url"
>;

export function OfferCard({ offer: o, storeName }: { offer: OfferRow; storeName: string }) {
  const [imgFailed, setImgFailed] = useState(false);
  const href = safeHttpUrl(o.url);
  const image = safeHttpUrl(o.image_url);
  const pct = offerDiscount(o);
  // Ошибка могла случиться до гидратации — тогда onError уже не сработает. Ref стабильный, чтобы не перезапускаться на каждый рендер.
  const checkBroken = useCallback((el: HTMLImageElement | null) => {
    if (el?.complete && el.naturalWidth === 0) setImgFailed(true);
  }, []);

  return (
    <article className="bg-card w-full has-[a:focus-visible]:ring-ring/60 relative flex flex-col overflow-hidden rounded-2xl border transition-shadow has-[a:focus-visible]:ring-3 motion-reduce:transition-none [@media(hover:hover)]:hover:shadow-md">
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
          <ImageOff className="text-muted-foreground/60 absolute inset-0 m-auto size-8" aria-label="Нет фото" role="img" />
        )}
        {pct && (
          <span className="bg-sale text-sale-foreground absolute top-2 left-2 rounded-lg px-2 py-1 text-sm font-bold tabular-nums">
            −{pct}%
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="text-muted-foreground text-xs">{storeName}</p>
        <h2 className="line-clamp-2 text-sm leading-snug font-medium break-words">
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="outline-none after:absolute after:inset-0"
            >
              {o.title}
            </a>
          ) : (
            o.title
          )}
        </h2>
        {o.packaging && <p className="text-muted-foreground text-xs">{o.packaging}</p>}
        <div className="mt-auto flex flex-wrap items-baseline gap-x-2 pt-2">
          {o.price === null ? (
            // Скидка на бренд или категорию: цены нет, процент уже на значке.
            <span className="text-muted-foreground text-sm">Скидка на бренд или категорию</span>
          ) : (
            <>
              <span className="text-xl font-bold tabular-nums">{eur(o.price)}</span>
              {pct && o.old_price && <s className="text-muted-foreground text-sm tabular-nums">
                  <span className="sr-only">Было </span>
                  {eur(o.old_price)}
                </s>}
            </>
          )}
        </div>
        {o.unit_price && (
          <p className="text-muted-foreground text-xs tabular-nums">
            {eur(o.unit_price)}/{o.unit === "l" ? "л" : "кг"}
          </p>
        )}
        {o.condition && (
          <p className="bg-accent text-accent-foreground mt-1 flex items-center gap-1 self-start rounded-md px-2 py-1 text-xs font-medium">
            <Tag className="size-3 shrink-0" aria-hidden />
            {o.condition}
          </p>
        )}
        {o.ends_at && <p className="text-muted-foreground text-xs">до {shortDate(o.ends_at)}</p>}
      </div>
    </article>
  );
}
