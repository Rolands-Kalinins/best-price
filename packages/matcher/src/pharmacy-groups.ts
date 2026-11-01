// Шаг после парсеров: объединяет один и тот же товар разных аптек в группы (pharmacy.products.group_id, group_rep; core/pharmacy-match.ts).
// Связь: общий штрихкод или общий ключ названия (бренд, размер, число штук, слова). Пишет только изменившееся.
// --dry: ничего не пишет, показывает число групп и 30 равномерно взятых групп для просмотра глазами.
import { createClient } from "@supabase/supabase-js";
import { batches, groupProducts, normalizeBrand, pharmacyMatchKey, type Database } from "@bestprice/core";

const DRY = process.argv.includes("--dry");
const sb = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const db = sb.schema("pharmacy");

// PostgREST отдаёт не больше 1000 строк за запрос (docs/findings/2026-10-27-rest-1000-rows-cap.md): читаем страницами. Берём и товары не в наличии: вернутся.
type Row = { id: number; source_id: number; title: string; brand: string | null; ean: string | null; price: number; in_stock: boolean; group_id: number | null; group_rep: boolean };
const rows: Row[] = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from("products").select("id,source_id,title,brand,ean,price,in_stock,group_id,group_rep").order("id").range(from, from + 999);
  if (error) throw error;
  rows.push(...data);
  if (data.length < 1000) break;
}

const brands = new Set(rows.map((r) => normalizeBrand(r.brand ?? "")).filter(Boolean));
const groups = groupProducts(
  rows.map((r) => ({ id: r.id, sourceId: r.source_id, ean: r.ean, key: pharmacyMatchKey(r.title, r.brand, brands), price: r.price, inStock: r.in_stock })),
);
const want = (r: Row) => groups.get(r.id) ?? { groupId: null, rep: true };
const changed = rows.filter((r) => want(r).groupId !== r.group_id || want(r).rep !== r.group_rep);
console.log(`товаров ${rows.length}, в группах ${groups.size} (${new Set([...groups.values()].map((g) => g.groupId)).size} групп), изменится ${changed.length}`);

if (DRY) {
  const byGroup = new Map<number, string[]>();
  for (const r of rows) {
    const g = groups.get(r.id);
    if (g) byGroup.set(g.groupId, [...(byGroup.get(g.groupId) ?? []), `${g.rep ? "*" : " "}[${r.source_id}] ${r.title} ${r.price}`]);
  }
  const all = [...byGroup.values()];
  for (let i = 0; i < 30; i++) console.log("\n" + all[Math.floor((i * all.length) / 30)].join("\n"));
} else {
  for (const part of batches(changed, 1000)) {
    const { error } = await db.rpc("set_groups", {
      ids: part.map((r) => r.id),
      gids: part.map((r) => want(r).groupId) as number[],
      reps: part.map((r) => want(r).rep),
    });
    if (error) throw new Error(error.message);
  }
  console.log(`Записано: ${changed.length}`);
}
