import { activeFilter, safeHttpUrl } from "@bestprice/core";
import { Pencil } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { eur, shortDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

const PAGE_SIZE = 50;
const th = "px-2 py-1.5 text-left font-medium whitespace-nowrap";
const td = "px-2 py-1.5 align-top";
const stampFmt = new Intl.DateTimeFormat("ru", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Riga" });
const field = "bg-background min-h-11 rounded-lg border px-3 text-sm";

// Акции магазина как их видит сайт: название, условие, объём, картинка, когда парсер видел и когда правили. Правит только админ (RLS).
export default async function OffersAdminPage({ searchParams }: { searchParams: Promise<{ store?: string; q?: string; page?: string; all?: string; edited?: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) redirect("/grocery");

  const sp = await searchParams;
  const store = /^\d+$/.test(sp.store ?? "") ? Number(sp.store) : null;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const page = Math.max(1, Number(sp.page) || 1);
  const all = sp.all === "1";
  const edited = sp.edited === "1";

  let query = supabase
    .schema("grocery")
    .from("offers")
    .select("id, source_id, title, brand, packaging, condition, price, old_price, discount_percent, ends_at, image_url, last_seen_at, edited_at, locked_fields", { count: "exact" })
    .order("title")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (store !== null) query = query.eq("source_id", store);
  if (q) query = query.ilike("title", `%${q.replace(/[\\%_]/g, "\\$&")}%`);
  if (!all) query = query.or(activeFilter(new Date()));
  if (edited) query = query.not("edited_at", "is", null);
  const [offersRes, sourcesRes] = await Promise.all([query, supabase.from("sources").select("id, name").eq("module", "grocery").order("name")]);
  const failed = offersRes.error ?? sourcesRes.error;
  if (failed) throw new Error(failed.message);

  const sources = sourcesRes.data ?? [];
  const storeName = new Map(sources.map((s) => [s.id, s.name]));
  const total = offersRes.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (over: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const cur: Record<string, string | null> = { store: store === null ? null : String(store), q: q || null, all: all ? "1" : null, edited: edited ? "1" : null, page: null, ...over };
    for (const [k, v] of Object.entries(cur)) if (v) p.set(k, v);
    return `?${p}`;
  };

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-semibold">Акции</h1>
      <p className="text-muted-foreground text-sm">Всё, что видит сайт. Правка закрепляет изменённые поля: парсер их больше не перезапишет, пока вы не снимете закрепление.</p>

      <nav aria-label="Магазины" className="flex flex-wrap gap-2">
        {[{ id: null, name: "Все магазины" }, ...sources].map((s) => (
          <Link key={s.id ?? "all"} href={link({ store: s.id === null ? null : String(s.id) })} aria-current={s.id === store ? "page" : undefined} className={`min-h-11 content-center rounded-full border px-4 text-sm ${s.id === store ? "bg-primary text-primary-foreground border-primary" : "bg-card"}`}>
            {s.name}
          </Link>
        ))}
      </nav>

      <form className="flex flex-wrap items-center gap-2" role="search">
        {store !== null && <input type="hidden" name="store" value={store} />}
        <input name="q" defaultValue={q} placeholder="Название содержит…" aria-label="Поиск по названию" className={`${field} w-64`} />
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="all" value="1" defaultChecked={all} className="size-4" /> и закончившиеся</label>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="edited" value="1" defaultChecked={edited} className="size-4" /> только правленные</label>
        <button type="submit" className="bg-primary text-primary-foreground min-h-11 rounded-lg px-4 text-sm font-medium">Показать</button>
      </form>

      <p className="text-sm">Найдено: <b>{total}</b>{pages > 1 && <span className="text-muted-foreground"> · страница {page} из {pages}</span>}</p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="bg-muted/60">
            <tr>
              <th scope="col" className={th}>Фото</th>
              <th scope="col" className={th}>Название</th>
              <th scope="col" className={th}>Объём</th>
              <th scope="col" className={th}>Условие</th>
              <th scope="col" className={`${th} text-right`}>Цена</th>
              <th scope="col" className={`${th} text-right`}>Было</th>
              <th scope="col" className={`${th} text-right`}>%</th>
              <th scope="col" className={th}>До</th>
              <th scope="col" className={th}>Видел парсер</th>
              <th scope="col" className={th}>Правка</th>
              <th scope="col" className={th}><span className="sr-only">Действия</span></th>
            </tr>
          </thead>
          <tbody>
            {(offersRes.data ?? []).map((o) => {
              const img = safeHttpUrl(o.image_url);
              return (
                <tr key={o.id} className="border-t">
                  <td className={td}>
                    <span className="flex size-12 items-center justify-center overflow-hidden rounded border bg-white">
                      {/* eslint-disable-next-line @next/next/no-img-element -- next/image не используем: лимит оптимизации на Vercel Hobby */}
                      {img ? <img src={img} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-contain" /> : <span className="text-muted-foreground text-xs">нет</span>}
                    </span>
                  </td>
                  <td className={`${td} break-words`}>
                    {o.title}
                    <span className="text-muted-foreground block text-xs">{[storeName.get(o.source_id), o.brand].filter(Boolean).join(" · ")}</span>
                  </td>
                  <td className={`${td} whitespace-nowrap`}>{o.packaging}</td>
                  <td className={`${td} text-xs break-words`}>{o.condition}</td>
                  <td className={`${td} text-right font-medium whitespace-nowrap tabular-nums`}>{o.price === null ? "—" : eur(o.price)}</td>
                  <td className={`${td} text-muted-foreground text-right whitespace-nowrap tabular-nums`}>{o.old_price === null ? "" : eur(o.old_price)}</td>
                  <td className={`${td} text-right whitespace-nowrap tabular-nums`}>{o.discount_percent === null ? "" : `−${o.discount_percent}%`}</td>
                  <td className={`${td} whitespace-nowrap`}>{o.ends_at ? shortDate(o.ends_at) : ""}</td>
                  <td className={`${td} text-muted-foreground whitespace-nowrap`}>{stampFmt.format(new Date(o.last_seen_at))}</td>
                  <td className={`${td} text-xs whitespace-nowrap`}>
                    {o.edited_at ? <span className="bg-accent text-accent-foreground rounded px-1.5 py-0.5" title={`Закреплено: ${o.locked_fields.join(", ")}`}>{stampFmt.format(new Date(o.edited_at))}</span> : ""}
                  </td>
                  <td className={td}>
                    <Link href={`/grocery/admin/offers/${o.id}`} className="text-primary inline-flex min-h-11 items-center gap-1 underline-offset-2 hover:underline">
                      <Pencil className="size-3.5" aria-hidden /> Править
                    </Link>
                  </td>
                </tr>
              );
            })}
            {total === 0 && (
              <tr><td colSpan={11} className="text-muted-foreground p-4 text-center">Ничего не найдено</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <nav aria-label="Страницы" className="flex items-center gap-2">
          {page > 1 && <Link href={link({ page: String(page - 1) })} className="bg-card min-h-11 content-center rounded-lg border px-4 text-sm">← Назад</Link>}
          {page < pages && <Link href={link({ page: String(page + 1) })} className="bg-card min-h-11 content-center rounded-lg border px-4 text-sm">Дальше →</Link>}
        </nav>
      )}
    </div>
  );
}
