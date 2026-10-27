import { ago } from "@/lib/format";

export type StoreInfo = { id: number; name: string; lastRun: string | null };

export function StoreStatus({ stores }: { stores: StoreInfo[] }) {
  return (
    <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {stores.map((s) => (
        <li key={s.id}>
          <span className="text-foreground font-medium">{s.name}</span>{" "}
          {s.lastRun ? `обновлено ${ago(s.lastRun)}` : "не обновлялось"}
        </li>
      ))}
    </ul>
  );
}
