import { cropStyle, groupPages, ownPeriod } from "@bestprice/core";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { eur, shortDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

const unitLabel = { kg: "кг", l: "л" } as const;
const th = "px-2 py-1.5 text-left font-medium whitespace-nowrap";
const td = "px-2 py-1.5 align-top";

// Фото товара: вырезка из картинки страницы по рамке от Gemini, без своих картинок (CSS, см. cropStyle). Рамка тоже проверяется глазами.
function Crop({ src, box }: { src: string; box: number[] }) {
  const c = cropStyle(box);
  return (
    // Квадрат 5 рем: вырезка вписывается в него (высокая по высоте, широкая по ширине), строки таблицы не растут от бутылок.
    <span className="flex size-20 items-center justify-center">
      <span className="relative block overflow-hidden rounded border bg-white" style={{ ...c.box, ...(Number(c.box.aspectRatio) >= 1 ? { width: "100%" } : { height: "100%" }) }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- вырезка из чужой картинки по CSS, next/image не подходит */}
        <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" className="absolute max-w-none" style={c.img} />
      </span>
    </span>
  );
}

// Что прочитал Gemini по картинкам страниц буклета, рядом сама страница: админ сверяет глазами. Читает только админ (RLS leaflet_offers).
export default async function LeafletPage({ searchParams }: { searchParams: Promise<{ flyer?: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) redirect("/grocery");

  const grocery = supabase.schema("grocery");
  const [flyersRes, sourcesRes] = await Promise.all([
    grocery.from("leaflet_flyers").select("*").order("ends_at", { ascending: false }),
    supabase.from("sources").select("id, name"),
  ]);
  const failed = flyersRes.error ?? sourcesRes.error;
  if (failed) throw new Error(failed.message);

  const flyers = flyersRes.data ?? [];
  const store = new Map((sourcesRes.data ?? []).map((s) => [s.id, s.name]));
  const { flyer: wanted } = await searchParams;
  const flyer = flyers.find((f) => f.flyer_id === wanted) ?? flyers[0];
  // ponytail: один буклет ≈ 300–400 записей, потолок PostgREST 1000 строк; если буклеты вырастут, читать постранично.
  const rowsRes = flyer ? await grocery.from("leaflet_offers").select("*").eq("flyer_id", flyer.flyer_id!).order("page").order("id").limit(1000) : null;
  if (rowsRes?.error) throw new Error(rowsRes.error.message);
  const pages = groupPages(rowsRes?.data ?? []);
  const period = flyer && { starts_at: flyer.starts_at!, ends_at: flyer.ends_at! };
  const total = pages.reduce((n, p) => n + p.rows.length, 0);
  const categories = pages.reduce((n, p) => n + p.rows.filter((r) => r.price === null).length, 0);

  return (
    <>
      <div className="mx-auto w-full max-w-7xl space-y-4 p-4">
        <h1 className="text-2xl font-semibold">Буклеты</h1>
        <p className="text-muted-foreground text-sm">Что Gemini прочитал по картинкам страниц. Слева страница буклета, справа записи по ней: сверяйте названия, цены и сроки.</p>

        {!flyer || !period ? (
          <p className="bg-card rounded-2xl border p-4 text-sm">
            Буклеты ещё не читались. Запуск: <code>pnpm --filter @bestprice/scraper-lidl leaflet</code>
          </p>
        ) : (
          <>
            <nav aria-label="Буклеты" className="flex flex-wrap gap-2">
              {flyers.map((f) => (
                <Link
                  key={f.flyer_id}
                  href={`?flyer=${f.flyer_id}`}
                  aria-current={f.flyer_id === flyer.flyer_id ? "page" : undefined}
                  className={`min-h-11 content-center rounded-full border px-4 text-sm ${f.flyer_id === flyer.flyer_id ? "bg-primary text-primary-foreground border-primary" : "bg-card"}`}
                >
                  {store.get(f.source_id!) ?? "?"} {shortDate(f.starts_at!)}–{shortDate(f.ends_at!)} · {f.offers} зап., {f.pages} стр.
                </Link>
              ))}
            </nav>
            <p className="text-sm">
              Прочитано страниц: <b>{pages.length}</b>, записей: <b>{total}</b> (скидок на категорию: {categories}).
              <span className="text-muted-foreground"> Страницы без записей Gemini не нашёл или они ещё не читались.</span>
            </p>
            {total >= 1000 && <p role="status" className="text-destructive border-destructive/40 rounded-lg border p-3 text-sm">Показаны только первые 1000 записей буклета: остальные не выведены.</p>}
            <nav aria-label="Страницы" className="flex flex-wrap gap-1.5">
              {pages.map((p) => (
                <a key={p.page} href={`#p${p.page}`} className="bg-card hover:bg-muted min-w-11 rounded-lg border px-2 py-1.5 text-center text-sm">
                  {p.page}
                </a>
              ))}
            </nav>

            {pages.map((p) => (
              <section key={p.page} id={`p${p.page}`} className="grid scroll-mt-16 gap-4 border-t pt-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                <div className="space-y-2 self-start lg:sticky lg:top-16">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-lg font-semibold">
                      Страница {p.page}
                      {p.rows[0]?.model && <span className="text-muted-foreground ml-2 text-xs font-normal">{p.rows[0].model}</span>}
                    </h2>
                    {p.url && (
                      <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-primary inline-flex min-h-11 items-center gap-1 text-sm underline-offset-2 hover:underline">
                        Открыть на lidl.lv <ExternalLink className="size-3.5" aria-hidden />
                      </a>
                    )}
                  </div>
                  {p.imageUrl ? (
                    <a href={p.imageUrl} target="_blank" rel="noopener noreferrer" aria-label={`Страница ${p.page} крупно`}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- next/image не используем: лимит оптимизации на Vercel Hobby */}
                      <img src={p.imageUrl} alt={`Страница ${p.page} буклета`} loading="lazy" referrerPolicy="no-referrer" className="w-full rounded-lg border bg-white" />
                    </a>
                  ) : (
                    <p className="text-muted-foreground text-sm">Картинки страницы нет (прочитана до того, как парсер её сохранял): перечитайте с <code>--force</code>.</p>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[34rem] text-sm">
                    <thead className="bg-muted/60">
                      <tr>
                        <th scope="col" className={th}>№</th>
                        <th scope="col" className={th}>Фото</th>
                        <th scope="col" className={th}>Название</th>
                        <th scope="col" className={`${th} text-right`}>Цена</th>
                        <th scope="col" className={`${th} text-right`}>Было</th>
                        <th scope="col" className={`${th} text-right`}>По карте</th>
                        <th scope="col" className={`${th} text-right`}>%</th>
                        <th scope="col" className={`${th} text-right`}>За кг/л</th>
                        <th scope="col" className={th}>Условие, срок</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.rows.map((r) => {
                        const own = ownPeriod(r, period);
                        return (
                          <tr key={r.id} className="border-t">
                            <td className={`${td} text-muted-foreground tabular-nums`}>{r.n}</td>
                            <td className={td}>
                              {r.photo_box && p.imageUrl && <Crop src={p.imageUrl} box={r.photo_box} />}
                            </td>
                            <td className={`${td} break-words`}>
                              {r.title}
                              {r.price === null && <span className="bg-muted ml-2 rounded px-1.5 py-0.5 text-xs whitespace-nowrap">скидка на категорию</span>}
                              {(r.brand || r.packaging) && <span className="text-muted-foreground block text-xs">{[r.brand, r.packaging].filter(Boolean).join(" · ")}</span>}
                            </td>
                            <td className={`${td} text-right font-medium whitespace-nowrap tabular-nums`}>{r.price === null ? "—" : eur(r.price)}</td>
                            <td className={`${td} text-muted-foreground text-right whitespace-nowrap tabular-nums`}>{r.old_price === null ? "" : eur(r.old_price)}</td>
                            <td className={`${td} text-right whitespace-nowrap tabular-nums`}>{r.price_card === null ? "" : eur(r.price_card)}</td>
                            <td className={`${td} text-right whitespace-nowrap tabular-nums`}>{r.discount_percent === null ? "" : `−${r.discount_percent}%`}</td>
                            <td className={`${td} text-muted-foreground text-right whitespace-nowrap tabular-nums`}>{r.unit_price === null || r.unit === null ? "" : `${eur(r.unit_price)}/${unitLabel[r.unit as keyof typeof unitLabel] ?? r.unit}`}</td>
                            <td className={`${td} text-xs break-words`}>
                              {r.condition}
                              {own && <span className="bg-muted ml-1 rounded px-1.5 py-0.5 whitespace-nowrap">{own}</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </>
        )}
      </div>
    </>
  );
}
