// Копия боевых данных в локальную БД (Docker), чтобы на localhost было то же, что на Vercel: акции, история цен, сопоставление, журнал.
// Использование: pnpm db:pull. Боевая БД только читается (ключ из .env.prod), локальная заменяется одной транзакцией.
// Не копируются users и allowed_emails (там email; локально остаётся dev@bestprice.local) и leaflet_offers (она пока только локальная).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { pathToFileURL } from "node:url";

const CONTAINER = "supabase_db_bestprice";
const PAGE = 1000; // PostgREST отдаёт не больше 1000 строк за запрос (docs/findings/2026-10-27-rest-1000-rows-cap.md)

// Порядок вставки = порядок внешних ключей. identity: столбец, чей счётчик надо сдвинуть после вставки с готовыми id.
export const TABLES = [
  { name: "grocery.products", key: "id", identity: "id" },
  // discount и search база считает сама (generated): в готовом виде их вставить нельзя.
  { name: "grocery.offers", key: "id", identity: "id", skip: ["discount", "search"], sourceCol: "source_id" },
  // Триггер log_price при вставке акций сам пишет по строке «на сегодня»: перед вставкой боевой истории стираем их (clear).
  { name: "grocery.price_history", key: "offer_id,day", clear: true },
  { name: "grocery.match_decisions", key: "key_a,key_b" },
  { name: "grocery.match_exclusions", key: "offer_id" },
  { name: "grocery.match_suggestions", key: "key_a,key_b" },
  { name: "grocery.title_attrs", key: "title_key,prompt_version" },
  { name: "grocery.pair_verdicts", key: "key_a,key_b,prompt_version" },
  { name: "grocery.pair_checks", key: "key_a,key_b,prompt_version" },
  { name: "grocery.ai_usage", key: "day,model" },
  { name: "public.scrape_runs", key: "id", identity: "id", sourceCol: "source_id" },
];

const TAG = "$bp$"; // разделитель строки-литерала; названия товаров чужие, поэтому его наличие в данных — ошибка

/** Вставка строк таблицы из JSON; пустой список — пустая строка. */
export function insertSql(table, rows) {
  const clear = table.clear ? `delete from ${table.name};` : "";
  if (rows.length === 0) return clear;
  const json = JSON.stringify(rows);
  if (json.includes(TAG)) throw new Error(`${table.name}: в данных есть ${TAG}, копирование остановлено`);
  const [schema, name] = table.name.split(".");
  // Явный список столбцов: PostgREST отдаёт все, а вычисляемые базой (table.skip) вставке не подлежат.
  const cols = Object.keys(rows[0]).filter((c) => !table.skip?.includes(c)).map((c) => `"${c}"`).join(", ");
  const override = table.identity ? " overriding system value" : "";
  const reset = table.identity
    ? `\nselect setval(pg_get_serial_sequence('${table.name}', '${table.identity}'), (select max(${table.identity}) from ${table.name}));`
    : "";
  return `${clear ? clear + "\n" : ""}insert into ${table.name} (${cols})${override}\nselect ${cols} from json_populate_recordset(null::${schema}.${name}, ${TAG}${json}${TAG}::json);${reset}`;
}

/** id магазинов в боевой и локальной БД разные (магазины добавлялись в разном порядке): source_id переводим по slug.
 * Иначе вставка упирается во внешний ключ, а совпавший по номеру id молча лёг бы не в тот магазин. */
export function remapSourceIds(data, prodSources, localSources) {
  const localId = new Map(localSources.map((s) => [s.slug, s.id]));
  const map = new Map(prodSources.map((s) => [s.id, localId.get(s.slug) ?? (() => { throw new Error(`магазина «${s.slug}» нет в локальной БД: pnpm db:reset (применит миграции)`); })()]));
  const out = { ...data };
  for (const t of TABLES) if (t.sourceCol && out[t.name]) out[t.name] = out[t.name].map((r) => ({ ...r, [t.sourceCol]: map.get(r[t.sourceCol]) ?? r[t.sourceCol] }));
  return out;
}

/** Весь SQL одной транзакцией: сбой посреди копирования оставляет локальную БД как была. */
export function buildSql(data) {
  const names = TABLES.map((t) => t.name).join(", ");
  return ["begin;", `truncate ${names} restart identity;`, ...TABLES.map((t) => insertSql(t, data[t.name] ?? [])).filter(Boolean), "commit;", ""].join("\n");
}

async function pull(url, key, table) {
  const [schema, name] = table.name.split(".");
  const rows = [];
  for (;;) {
    const res = await fetch(`${url}/rest/v1/${name}?select=*&order=${table.key}&limit=${PAGE}&offset=${rows.length}`, {
      headers: { apikey: key, authorization: `Bearer ${key}`, "accept-profile": schema },
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`${table.name}: HTTP ${res.status}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

async function main() {
  const env = parseEnv(readFileSync(".env.prod", "utf8"));
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error(".env.prod: нет NEXT_PUBLIC_SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY");
  if (/127\.0\.0\.1|localhost/.test(url)) throw new Error(".env.prod указывает на локальную БД, копировать не с чего");
  let data = {};
  for (const t of TABLES) {
    data[t.name] = await pull(url, key, t);
    console.log(`${t.name}: ${data[t.name].length}`);
  }
  const prodSources = await pull(url, key, { name: "public.sources", key: "id" });
  const local = execFileSync("docker", ["exec", CONTAINER, "psql", "-U", "postgres", "-t", "-A", "-F", "|", "-c", "select id, slug from public.sources"], { encoding: "utf8" });
  data = remapSourceIds(data, prodSources, local.trim().split(/\r?\n/).map((l) => ({ id: Number(l.split("|")[0]), slug: l.split("|")[1] })));
  execFileSync("docker", ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-q"], { input: buildSql(data), maxBuffer: 1 << 28, stdio: ["pipe", "inherit", "inherit"] });
  console.log("Локальная БД обновлена из боевой.");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => ((process.exitCode = 1), console.error(e.message)));
