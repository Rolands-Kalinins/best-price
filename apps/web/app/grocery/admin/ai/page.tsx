import { pacificDay, secondsUntilReset, usagePercent } from "@bestprice/core";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

const DAYS = 14;
const num = (n: number) => n.toLocaleString("ru-RU");
const riga = (iso: string) => new Date(iso).toLocaleString("ru-RU", { timeZone: "Europe/Riga", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

// Учёт квоты Gemini: считает только запросы матчера (в Google AI Studio видно всё, что идёт через проект). Пишет матчер, читает только админ (RLS).
export default async function AiUsagePage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) redirect("/grocery");

  const now = new Date();
  const today = pacificDay(now);
  const since = new Date(new Date(`${today}T00:00:00Z`).getTime() - (DAYS - 1) * 86400_000).toISOString().slice(0, 10);
  const grocery = supabase.schema("grocery");
  const [limitsRes, usageRes] = await Promise.all([
    grocery.from("ai_limits").select("model, rpm, tpm, rpd").order("model"),
    grocery.from("ai_usage").select("*").gte("day", since).order("day", { ascending: false }),
  ]);
  const failed = limitsRes.error ?? usageRes.error;
  if (failed) throw new Error(failed.message);

  const limits = new Map((limitsRes.data ?? []).map((l) => [l.model, l]));
  const models = [...new Set([...limits.keys(), ...(usageRes.data ?? []).map((u) => u.model)])].sort();
  const left = secondsUntilReset(now);

  return (
    <>
      <SiteHeader email={auth.user.email ?? ""} isAdmin />
      <main className="mx-auto w-full max-w-3xl space-y-4 p-4">
        <h1 className="text-2xl font-semibold">Лимиты Gemini</h1>
        <p className="text-muted-foreground text-sm">
          Считаются только запросы сопоставления товаров (ночной запуск и ручные). Всё, что идёт через тот же проект Google (AI Studio, другие
          приложения), здесь не видно: точный остаток показывает AI Studio. Суточный лимит сбрасывается в полночь по тихоокеанскому времени, до сброса{" "}
          {Math.floor(left / 3600)} ч {Math.floor((left % 3600) / 60)} мин.
        </p>
        {models.length === 0 && <p className="text-muted-foreground py-12 text-center text-sm">Данных пока нет.</p>}
        {models.map((model) => {
          const lim = limits.get(model);
          const rows = (usageRes.data ?? []).filter((u) => u.model === model);
          const t = rows.find((r) => r.day === today);
          const hit = rows.find((r) => r.quota_hits > 0); // rows по убыванию дня: последняя за период, не только сегодняшняя
          const used = t?.requests ?? 0;
          const pct = usagePercent(used, lim?.rpd ?? 0);
          return (
            <section key={model} className="bg-card space-y-3 rounded-2xl border p-3">
              <h2 className="text-lg font-semibold break-words">{model}</h2>
              <div className="space-y-1">
                <p className="text-sm">
                  Запросов сегодня: <b>{num(used)}</b>
                  {lim ? ` из ${num(lim.rpd)} (${pct}%)` : " (лимит не задан)"}
                </p>
                {lim && (
                  <div className="bg-muted h-2 w-full overflow-hidden rounded-full" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Суточный лимит запросов">
                    <div className={`h-full ${pct >= 90 ? "bg-destructive" : "bg-primary"}`} style={{ width: `${pct}%` }} />
                  </div>
                )}
              </div>
              <p className="text-muted-foreground text-sm">
                Токенов сегодня: вход {num(t?.tokens_in ?? 0)}, выход {num(t?.tokens_out ?? 0)}. Ошибок: {t?.errors ?? 0}.
                {lim && ` Лимиты в минуту (справочно): ${lim.rpm} запросов, ${num(lim.tpm)} входных токенов.`}
              </p>
              {hit?.last_quota_hit_at && (
                <p className="text-destructive text-sm font-medium">Квота исчерпана (ответ 429), последний раз {riga(hit.last_quota_hit_at)} по Риге.</p>
              )}
              {t?.last_error && <p className="text-muted-foreground text-xs break-words">Последняя ошибка: {t.last_error}</p>}
              {rows.length > 0 && (
                <details>
                  <summary className="min-h-11 cursor-pointer text-sm font-medium">История за {DAYS} дней</summary>
                  <table className="w-full text-sm">
                    <thead className="text-muted-foreground text-left">
                      <tr>
                        <th className="py-1 font-normal">День (PT)</th>
                        <th className="py-1 text-right font-normal">Запросов</th>
                        <th className="py-1 text-right font-normal">Вход / выход</th>
                        <th className="py-1 text-right font-normal">Ошибок</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.day} className="border-t">
                          <td className="py-1">{r.day}</td>
                          <td className="py-1 text-right">{num(r.requests)}</td>
                          <td className="py-1 text-right">
                            {num(r.tokens_in)} / {num(r.tokens_out)}
                          </td>
                          <td className="py-1 text-right">{r.errors}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              )}
            </section>
          );
        })}
      </main>
    </>
  );
}
