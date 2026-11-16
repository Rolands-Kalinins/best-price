import { priceGap, safeHttpUrl } from "@bestprice/core";
import { Tag } from "lucide-react";
import { eur } from "@/lib/format";
import type { OfferRow } from "@/components/offer-card";
import { ZoomImage } from "@/components/zoom-image";

// Один товар в нескольких магазинах: цены от дешёвой к дорогой (offers уже прошли storePrices).
export function ProductCard({ title, offers, storeName }: { title: string; offers: (OfferRow & { price: number })[]; storeName: Map<number, string> }) {
  const best = offers[0].price;
  const top = offers.find((o) => safeHttpUrl(o.image_url));

  return (
    <article className="bg-card flex flex-col gap-3 rounded-2xl border p-3">
      <div className="flex items-start gap-3">
        <ZoomImage src={safeHttpUrl(top?.image_url ?? null)} title={title} className="size-16" />
        <h3 lang="lv" className="line-clamp-3 text-sm leading-snug font-medium break-words">{title}</h3>
      </div>
      <ul className="divide-y">
        {offers.map((o, i) => {
          const href = safeHttpUrl(o.url);
          const gap = priceGap(o.price, best);
          const row = (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{storeName.get(o.source_id) ?? ""}</span>
                {o.condition && (
                  <span className="text-muted-foreground flex items-center gap-1 text-xs">
                    <Tag className="size-3 shrink-0" aria-hidden />
                    <span className="truncate">{o.condition}</span>
                  </span>
                )}
              </span>
              <span className="text-right">
                <span className={i === 0 ? "font-price text-primary block text-lg font-bold tabular-nums" : "font-price block text-base font-semibold tabular-nums"}>{eur(o.price)}</span>
                <span className="text-muted-foreground block text-xs tabular-nums">
                  {i === 0 ? "дешевле всего" : gap.eur === 0 ? "та же цена" : <span className="font-price">{`+${eur(gap.eur)} (+${gap.pct}%)`}</span>}
                </span>
              </span>
            </>
          );
          return (
            // Фото рядом со ссылкой, а не внутри: кнопка увеличения не может быть внутри <a>.
            <li key={o.id} className="flex items-center gap-2 py-1">
              <ZoomImage src={safeHttpUrl(o.image_url)} title={`${storeName.get(o.source_id) ?? ""}: ${o.title}`} className="size-11" />
              {href ? (
                <a href={href} target="_blank" rel="noopener noreferrer" className="hover:bg-muted focus-visible:ring-ring/50 flex min-h-11 flex-1 items-center gap-3 rounded-lg px-1 py-2 outline-none focus-visible:ring-3">
                  {row}
                </a>
              ) : (
                <div className="flex min-h-11 flex-1 items-center gap-3 px-1 py-2">{row}</div>
              )}
            </li>
          );
        })}
      </ul>
    </article>
  );
}
