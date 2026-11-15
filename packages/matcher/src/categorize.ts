// Шаг после парсеров: раскладывает акции по категориям (offers.cat) словарём CATEGORIES, без Gemini. Пишет только изменившееся.
// --pharmacy: те же шаги для pharmacy.products и PHARMACY_CATEGORIES (аптеки, весь каталог).
// --dry: ничего не пишет, показывает охват по категориям и самые частые слова акций без категории (чем дополнять словарь).
import { createClient } from "@supabase/supabase-js";
import { batches, CATEGORIES, changedCategories, fold, OTHER, PHARMACY_CATEGORIES, type Database } from "@bestprice/core";

const DRY = process.argv.includes("--dry");
const PHARMACY = process.argv.includes("--pharmacy");
const sb = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
// У pharmacy.products те же столбцы id, title, category, cat, что у grocery.offers: типы приводим к grocery, чтобы не раздваивать код.
const db = sb.schema(PHARMACY ? "pharmacy" : "grocery") as unknown as ReturnType<typeof sb.schema<"grocery">>;
const table = (PHARMACY ? "products" : "offers") as "offers";
const cats = PHARMACY ? PHARMACY_CATEGORIES : CATEGORIES;

// PostgREST отдаёт не больше 1000 строк за запрос (docs/findings/2026-10-27-rest-1000-rows-cap.md): читаем страницами.
// Берём все акции, а не только действующие: кто-то вернётся в ленту, а у него уже должна быть категория.
type Row = { id: number; title: string; category: string | null; cat: string | null };
const rows: Row[] = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from(table).select("id,title,category,cat").order("id").range(from, from + 999);
  if (error) throw error;
  rows.push(...data);
  if (data.length < 1000) break;
}

const changes = changedCategories(cats, rows);
const changed = [...changes.values()].reduce((n, ids) => n + ids.length, 0);
console.log(`акций ${rows.length}, изменится ${changed}`);

if (DRY) {
  const final = new Map(rows.map((r) => [r.id, r.cat]));
  for (const [slug, ids] of changes) for (const id of ids) final.set(id, slug);
  const count = new Map<string | null, number>();
  for (const c of final.values()) count.set(c, (count.get(c) ?? 0) + 1);
  console.log([...count].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}: ${n}`).join("\n"));

  // Слова без категории: сначала дополняем словарь по ним.
  const words = new Map<string, number>();
  for (const r of rows) {
    if (final.get(r.id) !== OTHER) continue;
    for (const w of new Set(fold(r.title).split(/[^a-z]+/).filter((w) => w.length >= 3))) words.set(w, (words.get(w) ?? 0) + 1);
  }
  console.log("\nчастые слова без категории:\n" + [...words].sort((a, b) => b[1] - a[1]).slice(0, 60).map(([w, n]) => `${w}(${n})`).join(" "));
} else {
  for (const [slug, ids] of changes) {
    for (const part of batches(ids, 200)) {
      const { error } = await db.from(table).update({ cat: slug }).in("id", part);
      if (error) throw new Error(error.message);
    }
  }
  console.log(`Записано: ${changed}`);
}
