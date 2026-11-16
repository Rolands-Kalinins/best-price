import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Не входит в index.ts: подтягивает supabase-js, сайту он здесь не нужен. Импорт: "@bestprice/core/src/scrape-run".
export type ScrapeContext = { sb: SupabaseClient<Database>; sourceId: number; startedAt: string };

/**
 * Общий запуск парсера: находит источник по slug, выполняет work и пишет итог в scrape_runs, и при успехе, и при сбое (FR-13).
 * Если sources.enabled = false, work не вызывается и результат true. work возвращает число записанных и отброшенных строк. Результат false = сбой парсера или журнала: run.ts ставит ненулевой код
 * выхода, workflow падает, GitHub шлёт письмо (FR-15).
 */
export async function runScrape(o: {
  slug: string;
  label: string;
  noun: string;
  work: (c: ScrapeContext) => Promise<{ count: number; invalid: number }>;
  sb?: SupabaseClient<Database>;
  say?: (msg: string) => void;
}): Promise<boolean> {
  const sb = o.sb ?? createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const say = o.say ?? console.log;
  const { data: source, error: sourceError } = await sb.from("sources").select("id, enabled").eq("slug", o.slug).single();
  if (sourceError) throw sourceError;
  // Выключенный магазин (например, из-за запрета в ToS) не парсим. Это не сбой: true, в scrape_runs ничего не пишем.
  if (!source.enabled) {
    say(`${o.label}: источник выключен (sources.enabled = false), парсер не запущен`);
    return true;
  }

  const startedAt = new Date().toISOString();
  let count = 0;
  let invalid = 0;
  let error: string | null = null;
  try {
    ({ count, invalid } = await o.work({ sb, sourceId: source.id, startedAt }));
  } catch (e) {
    error = e instanceof Error ? e.message : JSON.stringify(e);
  }

  const { error: logError } = await sb.from("scrape_runs").insert({
    source_id: source.id,
    started_at: startedAt,
    status: error ? "failed" : "success",
    items_count: count,
    invalid_count: invalid,
    error,
  });
  if (logError) console.error("scrape_runs:", logError.message);

  say(error ? `Сбой: ${error}` : `${o.label}: ${count} ${o.noun}, отброшено ${invalid}`);
  return !error && !logError;
}
