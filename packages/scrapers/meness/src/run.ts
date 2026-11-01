import { createClient } from "@supabase/supabase-js";
import type { Database } from "@bestprice/core";
import { scrape } from "./index";

const SLUG = "meness";
const CHUNK = 500; // запись частями: десять тысяч строк разом упираются в таймаут и размер запроса

const sb = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const { data: source, error: sourceError } = await sb
  .from("sources")
  .select("id")
  .eq("slug", SLUG)
  .single();
if (sourceError) throw sourceError;

const startedAt = new Date().toISOString();
let itemsCount = 0;
let invalidCount = 0;
let error: string | null = null;

try {
  const { products, invalid } = await scrape();
  invalidCount = invalid;
  const seen = new Date().toISOString();
  // cat (наша категория) не пишем: её ставит matcher, upsert не трогает столбцы, которых нет в строке.
  const rows = products.map((p) => ({
    source_id: source.id,
    external_id: p.externalId,
    title: p.title,
    brand: p.brand,
    packaging: p.packaging,
    price: p.price,
    old_price: p.oldPrice,
    starts_at: p.startsAt,
    ends_at: p.endsAt,
    ean: p.ean,
    url: p.url,
    image_url: p.imageUrl,
    category: p.category,
    card_price: p.cardPrice,
    card_condition: p.cardCondition,
    card_starts_at: p.cardStartsAt,
    card_ends_at: p.cardEndsAt,
    prescription: p.prescription,
    in_stock: p.inStock,
    last_seen_at: seen,
  }));
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error: upsertError } = await sb
      .schema("pharmacy")
      .from("products")
      .upsert(rows.slice(i, i + CHUNK), { onConflict: "source_id,external_id" });
    if (upsertError) throw upsertError;
  }
  itemsCount = products.length;
} catch (e) {
  error = e instanceof Error ? e.message : JSON.stringify(e);
}

// Журнал пишем и при успехе, и при сбое (FR-13).
const { error: logError } = await sb.from("scrape_runs").insert({
  source_id: source.id,
  started_at: startedAt,
  status: error ? "failed" : "success",
  items_count: itemsCount,
  invalid_count: invalidCount,
  error,
});
if (logError) console.error("scrape_runs:", logError.message);

console.log(error ? `Сбой: ${error}` : `Mēness: ${itemsCount} товаров, отброшено ${invalidCount}`);
// Ненулевой код → workflow падает → GitHub шлёт письмо (FR-15).
if (error || logError) process.exitCode = 1;
