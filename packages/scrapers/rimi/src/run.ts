import { createClient } from "@supabase/supabase-js";
import type { Database } from "@bestprice/core";
import { type Period, scrape } from "./index";

const SLUG = "rimi";
const PAGE = 1000; // лимит строк ответа API
const CHUNK = 500; // запись частями: тысячи строк разом упираются в таймаут и размер запроса

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
  // Действующие акции уже с периодом: за их карточками не ходим.
  // API отдаёт не больше 1000 строк за запрос (limit его не поднимает), поэтому читаем страницами.
  const known = new Map<string, Period>();
  for (let from = 0; ; from += PAGE) {
    const { data, error: activeError } = await sb
      .schema("grocery")
      .from("offers")
      .select("external_id, starts_at, ends_at")
      .eq("source_id", source.id)
      .gt("ends_at", startedAt)
      .order("id")
      .range(from, from + PAGE - 1);
    if (activeError) throw activeError;
    data.forEach((o) => known.set(o.external_id, { startsAt: o.starts_at, endsAt: o.ends_at }));
    if (data.length < PAGE) break;
  }
  const { offers, invalid } = await scrape(known);
  invalidCount = invalid;
  const seen = new Date().toISOString();
  const rows = offers.map((o) => ({
    source_id: source.id,
    external_id: o.externalId,
    title: o.title,
    brand: o.brand,
    packaging: o.packaging,
    price: o.price,
    old_price: o.oldPrice,
    discount_percent: o.discountPercent,
    unit_price: o.unitPrice,
    unit: o.unit,
    condition: o.condition,
    starts_at: o.startsAt,
    ends_at: o.endsAt,
    ean: o.ean,
    url: o.url,
    image_url: o.imageUrl,
    category: o.category,
    last_seen_at: seen,
  }));
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error: upsertError } = await sb
      .schema("grocery")
      .from("offers")
      .upsert(rows.slice(i, i + CHUNK), { onConflict: "source_id,external_id" });
    if (upsertError) throw upsertError;
  }
  itemsCount = offers.length;
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

console.log(error ? `Сбой: ${error}` : `Rimi: ${itemsCount} акций, отброшено ${invalidCount}`);
// Ненулевой код → workflow падает → GitHub шлёт письмо (FR-15).
if (error || logError) process.exitCode = 1;
