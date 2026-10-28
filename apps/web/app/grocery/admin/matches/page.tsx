import { activeFilter, safeHttpUrl } from "@bestprice/core";
import { eur } from "@/lib/format";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { ZoomImage } from "@/components/zoom-image";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { decide, exclude } from "./actions";

export const instant = false;

const LIMIT = 50;

// Очередь предположений: алгоритм считает, что акции — один товар, но не уверен. Решает админ.
export default async function MatchesPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) redirect("/grocery");

  const grocery = supabase.schema("grocery");
  const [sugRes, decRes, exclRes, sourcesRes, joinedRes] = await Promise.all([
    grocery.from("match_suggestions").select("key_a, key_b, offer_ids, ai_same, ai_reason"),
    grocery.from("match_decisions").select("key_a, key_b"),
    grocery.from("match_exclusions").select("offer_id").order("excluded_at", { ascending: false }),
    supabase.from("sources").select("id, name"),
    // Подтверждённые группы (products): акция, убранная админом, исчезает из группы сразу; осталась одна акция или один магазин — группу не показываем.
    grocery
      .from("products")
      .select("id, title, offers(id, source_id, title, price, condition, image_url)")
      .or(activeFilter(new Date()), { referencedTable: "offers" })
      .order("id")
      .limit(200),
  ]);
  const failed = sugRes.error ?? decRes.error ?? exclRes.error ?? sourcesRes.error ?? joinedRes.error;
  if (failed) throw new Error(failed.message);

  // Решённые пары ждут пересчёта и уже не нужны в очереди.
  const decided = new Set((decRes.data ?? []).map((d) => `${d.key_a}\n${d.key_b}`));
  // Сверху те, где Gemini советует «тот же товар»: их быстрее подтвердить (сортировка стабильная, остальной порядок прежний).
  const pending = (sugRes.data ?? [])
    .filter((s) => !decided.has(`${s.key_a}\n${s.key_b}`))
    .sort((a, b) => Number(b.ai_same === true) - Number(a.ai_same === true))
    .slice(0, LIMIT);
  const excluded = new Set((exclRes.data ?? []).map((e) => e.offer_id));

  const ids = [...new Set([...pending.flatMap((s) => s.offer_ids), ...excluded])];
  const offersRes = ids.length
    ? await grocery.from("offers").select("id, source_id, title, price, condition, image_url").in("id", ids)
    : { data: [], error: null };
  if (offersRes.error) throw new Error(offersRes.error.message);
  const offer = new Map((offersRes.data ?? []).map((o) => [o.id, o]));
  const store = new Map((sourcesRes.data ?? []).map((s) => [s.id, s.name]));

  // Убранная акция исчезает из предположения сразу (в БД предположения пересчитает очередной запуск `match`).
  // Предположение, где осталась одна акция или все из одного магазина, показывать нечего.
  const shown = pending
    .map((s) => ({ ...s, ids: s.offer_ids.filter((id) => !excluded.has(id) && offer.has(id)) }))
    .filter((s) => new Set(s.ids.map((id) => offer.get(id)!.source_id)).size >= 2);
  const removed = [...excluded].flatMap((id) => (offer.has(id) ? [offer.get(id)!] : []));

  const joined = (joinedRes.data ?? [])
    .map((p) => ({ ...p, offers: p.offers.filter((o) => !excluded.has(o.id)) }))
    .filter((p) => new Set(p.offers.map((o) => o.source_id)).size >= 2);

  return (
    <>
      <SiteHeader email={auth.user.email ?? ""} isAdmin />
      <main className="mx-auto w-full max-w-3xl space-y-4 p-4">
        <h1 className="text-2xl font-semibold">Сопоставление товаров</h1>
        <p className="text-muted-foreground text-sm">
          Алгоритм думает, что эти акции — один товар, но не уверен. Лишнюю акцию уберите кнопкой «Убрать», остальные подтвердите
          «Тот же товар». На сайт они попадут одной карточкой после очередного пересчёта. Осталось: {shown.length}.
        </p>
        {shown.length === 0 && <p className="text-muted-foreground py-12 text-center text-sm">Предположений нет.</p>}
        <ul className="space-y-3">
          {shown.map((s) => (
            <li key={`${s.key_a}|${s.key_b}`} className="bg-card space-y-3 rounded-2xl border p-3">
              {s.ai_same !== null && (
                <p className="text-muted-foreground text-xs break-words">
                  Gemini: <b className={s.ai_same ? "text-primary" : ""}>{s.ai_same ? "вероятно тот же" : "вероятно разные"}</b>
                  {s.ai_reason ? ` — ${s.ai_reason}` : ""}
                </p>
              )}
              <ul className="space-y-3 text-sm">
                {s.ids.map((id) => (
                  <OfferLine key={id} o={offer.get(id)!} storeName={store.get(offer.get(id)!.source_id) ?? ""} />
                ))}
              </ul>
              <form action={decide} className="flex gap-2">
                <input type="hidden" name="keyA" value={s.key_a} />
                <input type="hidden" name="keyB" value={s.key_b} />
                <Button type="submit" name="same" value="1" size="lg" className="min-h-11">
                  Тот же товар
                </Button>
                <Button type="submit" name="same" value="0" variant="outline" size="lg" className="min-h-11">
                  Разные
                </Button>
              </form>
            </li>
          ))}
        </ul>

        {joined.length > 0 && (
          <details className="pt-4">
            <summary className="min-h-11 cursor-pointer text-lg font-semibold">Объединённые товары ({joined.length})</summary>
            <p className="text-muted-foreground pb-2 text-sm">
              Подтверждённые группы, которые уже показаны на сайте карточкой. Лишнюю акцию можно убрать; из группы она выпадет при следующем пересчёте.
            </p>
            <ul className="space-y-3">
              {joined.map((p) => (
                <li key={p.id} className="bg-card space-y-3 rounded-2xl border p-3">
                  <h3 className="text-sm font-medium break-words">{p.title}</h3>
                  <ul className="space-y-3 text-sm">
                    {p.offers.map((o) => (
                      <OfferLine key={o.id} o={o} storeName={store.get(o.source_id) ?? ""} />
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </details>
        )}

        {removed.length > 0 && (
          <section className="space-y-2 pt-4">
            <h2 className="text-lg font-semibold">Убрано из сопоставления ({removed.length})</h2>
            <ul className="divide-y text-sm">
              {removed.map((o) => (
                <li key={o.id} className="flex items-center gap-3 py-2">
                  <span className="min-w-0 flex-1 break-words">
                    <span className="text-muted-foreground">{store.get(o.source_id) ?? ""}:</span> {o.title}
                  </span>
                  <form action={exclude}>
                    <input type="hidden" name="offerId" value={o.id} />
                    <input type="hidden" name="back" value="1" />
                    <Button type="submit" variant="outline" size="sm" className="min-h-11">
                      Вернуть
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}

type OfferInfo = { id: number; title: string; price: number | null; condition: string | null; image_url: string | null };

// Акция в очереди или в подтверждённой группе: фото (увеличивается), магазин, название, цена и кнопка «Убрать».
function OfferLine({ o, storeName }: { o: OfferInfo; storeName: string }) {
  return (
    <li className="flex items-start gap-3">
      <ZoomImage src={safeHttpUrl(o.image_url)} title={o.title} className="size-20" />
      <span className="min-w-0 flex-1 space-y-2">
        <span className="block break-words">
          <span className="text-muted-foreground">{storeName}:</span> {o.title}
          {o.condition && <span className="text-muted-foreground"> ({o.condition})</span>}
        </span>
        <form action={exclude}>
          <input type="hidden" name="offerId" value={o.id} />
          <Button type="submit" variant="outline" size="sm" className="min-h-11">
            Убрать из сопоставления
          </Button>
        </form>
      </span>
      {o.price !== null && <span className="font-medium tabular-nums">{eur(o.price)}</span>}
    </li>
  );
}
