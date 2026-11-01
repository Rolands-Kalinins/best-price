import { isStale } from "@bestprice/core";
import { ago } from "@/lib/format";

export type StoreInfo = { id: number; name: string; lastRun: string | null };

export function StoreStatus({ stores }: { stores: StoreInfo[] }) {
  const now = new Date();
  return (
    <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {stores.map((s) => (
        <li key={s.id}>
          <span className="text-foreground font-medium">{s.name}</span>{" "}
          {s.lastRun ? (
            isStale(s.lastRun, now) ? (
              <span className="text-sale font-medium">данные устарели: обновлено {ago(s.lastRun)}</span>
            ) : (
              `обновлено ${ago(s.lastRun)}`
            )
          ) : (
            "не обновлялось"
          )}
        </li>
      ))}
    </ul>
  );
}
