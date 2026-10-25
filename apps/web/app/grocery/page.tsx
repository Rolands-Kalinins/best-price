import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Страница персональная (RLS по сессии), пререндер не нужен.
export const instant = false;

const rtf = new Intl.RelativeTimeFormat("ru", { numeric: "auto" });
const dateFmt = new Intl.DateTimeFormat("ru", { day: "numeric", month: "numeric", timeZone: "Europe/Riga" });
const eur = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;

function ago(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 60) return rtf.format(-min, "minute");
  if (min < 60 * 24) return rtf.format(-Math.round(min / 60), "hour");
  return rtf.format(-Math.round(min / 60 / 24), "day");
}

export default async function GroceryPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  // Устаревшие акции скрываем по дате окончания (FR-33).
  const now = new Date().toISOString();
  const [{ data: offers }, { data: sources }, { data: runs }] = await Promise.all([
    supabase
      .schema("grocery")
      .from("offers")
      .select("*")
      .or(`ends_at.is.null,ends_at.gt.${now}`)
      .order("title"),
    supabase.from("sources").select("id, name").eq("module", "grocery").eq("enabled", true),
    supabase
      .from("scrape_runs")
      .select("source_id, finished_at")
      .eq("status", "success")
      .order("finished_at", { ascending: false })
      .limit(50),
  ]);

  const lastRun = new Map<number, string>();
  runs?.forEach((r) => lastRun.has(r.source_id) || lastRun.set(r.source_id, r.finished_at));
  const withOffers = sources?.filter((s) => offers?.some((o) => o.source_id === s.id));

  return (
    <main className="mx-auto max-w-2xl space-y-8 p-4">
      <Link href="/" className="text-muted-foreground text-sm underline">
        ← На главную
      </Link>
      <h1 className="text-2xl font-semibold">Акции</h1>
      {withOffers?.length === 0 && (
        <p className="text-muted-foreground text-sm">Пока нет данных. Парсер ещё не запускался.</p>
      )}
      {withOffers?.map((s) => (
        <section key={s.id} className="space-y-2">
          <h2 className="flex items-baseline justify-between text-lg font-medium">
            {s.name}
            <span className="text-muted-foreground text-xs font-normal">
              {lastRun.has(s.id) ? `обновлено ${ago(lastRun.get(s.id)!)}` : "не обновлялось"}
            </span>
          </h2>
          <ul className="divide-y">
            {offers
              ?.filter((o) => o.source_id === s.id)
              .map((o) => (
                <li key={o.id} className="flex justify-between gap-4 py-2 text-sm">
                  <div>
                    <a href={o.url ?? undefined} className="font-medium hover:underline">
                      {o.title}
                    </a>
                    <p className="text-muted-foreground text-xs">
                      {[o.packaging, o.condition, o.ends_at && `до ${dateFmt.format(new Date(o.ends_at))}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold">{eur(o.price)}</p>
                    {o.old_price && <p className="text-muted-foreground text-xs line-through">{eur(o.old_price)}</p>}
                    {o.unit_price && (
                      <p className="text-muted-foreground text-xs">
                        {eur(o.unit_price)}/{o.unit === "l" ? "л" : "кг"}
                      </p>
                    )}
                  </div>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
