import { isStale, nextRunAt, staleAfterHours } from "@bestprice/core";
import { ago } from "@/lib/format";

export type StoreInfo = { id: number; name: string; slug: string; lastRun: string | null };

// Дата следующего запуска по Риге (запуск в 00:17–00:47, GitHub опаздывает на часы, поэтому время не показываем).
const nextDate = new Intl.DateTimeFormat("ru", { timeZone: "Europe/Riga", weekday: "short", day: "numeric", month: "long" });

export function StoreStatus({ stores }: { stores: StoreInfo[] }) {
  const now = new Date();
  return (
    <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {stores.map((s) => (
        <li key={s.id}>
          <span className="text-foreground font-medium">{s.name}</span>{" "}
          {s.lastRun ? (
            isStale(s.lastRun, now, staleAfterHours(s.slug)) ? (
              <span className="text-sale font-medium">данные устарели: обновлено {ago(s.lastRun)}</span>
            ) : (
              `обновлено ${ago(s.lastRun)}`
            )
          ) : (
            "не обновлялось"
          )}
          {" · "}следующее обновление {nextDate.format(nextRunAt(s.slug, now))}
        </li>
      ))}
    </ul>
  );
}
