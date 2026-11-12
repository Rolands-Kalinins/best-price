import { canPullProdData, nextScrapeAt } from "@bestprice/core";
import { Fragment } from "react";
import { redirect } from "next/navigation";
import { Countdown } from "@/components/countdown";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { PullButton } from "@/components/pull-button";
import { pullProd, runScrapers } from "./actions";

export const instant = false;

const HISTORY = 5;
const riga = (iso: string) => new Date(iso).toLocaleString("ru-RU", { timeZone: "Europe/Riga", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const duration = (a: string, b: string) => {
  const s = Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 1000));
  return s >= 60 ? `${Math.floor(s / 60)} мин ${s % 60} с` : `${s} с`;
};
const MESSAGES: Record<string, [string, boolean]> = {
  "no-token": ["Не задан GITHUB_DISPATCH_TOKEN в переменных Vercel: запуск из интерфейса недоступен.", true],
  failed: ["GitHub не принял запуск (проверь токен и права Actions: write).", true],
  pulled: ["Локальная БД обновлена из боевой.", false],
  "pull-denied": ["Копирование доступно только на localhost с локальной БД.", true],
};

// Статус парсеров и ручной запуск. Только админ: журнал scrape_runs закрыт RLS для остальных, страница не доступна участникам.
export default async function ScrapersPage({ searchParams }: { searchParams: Promise<{ msg?: string; detail?: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) redirect("/grocery");

  const [sourcesRes, runsRes] = await Promise.all([
    supabase.from("sources").select("id, slug, name, enabled, module").order("module").order("name"),
    // ponytail: последние 200 запусков на все магазины (≈ полгода при 4 парсерах в сутки); ниже HISTORY строк на магазин не нужно.
    supabase.from("scrape_runs").select("id, source_id, started_at, finished_at, status, items_count, invalid_count, error").order("started_at", { ascending: false }).limit(200),
  ]);
  const failed = sourcesRes.error ?? runsRes.error;
  if (failed) throw new Error(failed.message);

  const { msg, detail } = await searchParams;
  const started = msg?.startsWith("started-") ? msg.slice(8) : null;
  const notice = started
    ? ([`Запуск отправлен в GitHub Actions: ${started === "all" ? "все парсеры" : started}. Результат появится здесь, когда парсер закончит.`, false] as const)
    : msg === "pull-failed"
      ? ([`Не удалось скопировать: ${(detail ?? "").slice(0, 200)}. Docker запущен (pnpm db:start) и есть .env.prod?`, true] as const)
      : MESSAGES[msg ?? ""];
  const canPull = canPullProdData(process.env.NODE_ENV, process.env.NEXT_PUBLIC_SUPABASE_URL);
  // Источники двух разделов (продукты, аптеки): заголовок раздела перед первым источником раздела.
  const MODULES: Record<string, string> = { grocery: "Продукты", pharmacy: "Аптеки" };
  const next = nextScrapeAt(new Date()).toISOString();

  return (
    <>
      <div className="mx-auto w-full max-w-3xl space-y-4 p-4">
        <h1 className="text-2xl font-semibold">Парсеры</h1>
        <div className="bg-card flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3">
          <p className="text-sm">
            Следующий запуск по расписанию: <b>{riga(next)}</b> по Риге, через <b><Countdown to={next} /></b>
            <span className="text-muted-foreground block text-xs">GitHub может опоздать на несколько часов.</span>
          </p>
          <form action={runScrapers}>
            <input type="hidden" name="source" value="all" />
            <Button type="submit" className="min-h-11 px-4">Запустить все</Button>
          </form>
        </div>
        {canPull && (
          <div className="bg-card flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3">
            <p className="text-sm">
              Локальная копия боевых данных
              <span className="text-muted-foreground block text-xs">Боевая БД только читается. Локальная заменяется целиком: ваши локальные правки (решения, исключения) пропадут. Около минуты.</span>
            </p>
            <form action={pullProd}>
              <PullButton />
            </form>
          </div>
        )}
        {notice && (
          <p role="status" className={`rounded-lg border p-3 text-sm ${notice[1] ? "text-destructive border-destructive/40" : ""}`}>
            {notice[0]}
          </p>
        )}
        {(sourcesRes.data ?? []).map((s, i, all) => {
          const runs = (runsRes.data ?? []).filter((r) => r.source_id === s.id);
          const last = runs[0];
          return (
            <Fragment key={s.id}>
            {s.module !== all[i - 1]?.module && <h2 className="pt-2 text-lg font-semibold">{MODULES[s.module] ?? s.module}</h2>}
            <section className="bg-card space-y-2 rounded-2xl border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-semibold">
                  {s.name}
                  {!s.enabled && <span className="text-muted-foreground ml-2 text-sm font-normal">(выключен)</span>}
                </h3>
                <form action={runScrapers}>
                  <input type="hidden" name="source" value={s.slug} />
                  <Button type="submit" variant="outline" className="min-h-11 px-4" disabled={!s.enabled}>Запустить</Button>
                </form>
              </div>
              {last ? (
                <p className="text-sm">
                  <span className={`font-medium ${last.status === "success" ? "text-primary" : "text-destructive"}`}>{last.status === "success" ? "Успех" : "Сбой"}</span>
                  {" · "}старт {riga(last.started_at)} · {duration(last.started_at, last.finished_at)} · позиций {last.items_count}, отброшено {last.invalid_count}
                </p>
              ) : (
                <p className="text-muted-foreground text-sm">Запусков ещё не было.</p>
              )}
              {last?.error && <p className="text-destructive text-xs break-words">{last.error}</p>}
              {runs.length > 1 && (
                <details>
                  <summary className="min-h-11 cursor-pointer text-sm font-medium">Предыдущие запуски</summary>
                  <table className="w-full text-sm">
                    <tbody>
                      {runs.slice(1, HISTORY).map((r) => (
                        <tr key={r.id} className="border-t align-top">
                          <td className="py-1">{riga(r.started_at)}</td>
                          <td className={`py-1 ${r.status === "success" ? "" : "text-destructive"}`}>{r.status === "success" ? "Успех" : "Сбой"}</td>
                          <td className="py-1 text-right">{r.items_count}</td>
                          <td className="text-muted-foreground py-1 break-words text-xs">{r.error}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              )}
            </section>
            </Fragment>
          );
        })}
      </div>
    </>
  );
}
