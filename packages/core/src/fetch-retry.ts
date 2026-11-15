// Общий fetch парсеров: повторы, Retry-After, распознавание заглушек (Cloudflare и др.), класс сбоя в тексте ошибки.
// Заменяет девять копий get() по парсерам (findings/maxima-fetch-no-retry, findings/meness-connection-drops).

export type FetchErrorKind = "blocked" | "rate" | "http" | "network";

// Класс сбоя идёт в начало сообщения: scrape_runs.error (и письмо FR-15) сразу говорит, нас блокируют или сайт поменял формат.
export class FetchError extends Error {
  constructor(
    readonly kind: FetchErrorKind,
    name: string,
    detail: string,
    cause?: unknown,
  ) {
    super(`${kind === "blocked" ? "[blocked] " : ""}${name}: ${detail}`, { cause });
  }
}

// Признаки страницы-заглушки: Cloudflare, DataDome, Incapsula, PerimeterX. Ищем в начале тела: товарная страница таких строк не содержит.
const BLOCK_MARKERS = /Just a moment\.\.\.|cf-chl-|\/cdn-cgi\/challenge-platform|Attention Required! \| Cloudflare|captcha-delivery\.com|_Incapsula_Resource|Incapsula incident|px-captcha/i;
export const isBlockedPage = (text: string) => BLOCK_MARKERS.test(text.slice(0, 20_000));

const MAX_WAIT = 120_000;
// Retry-After: секунды или дата; без заголовка 0.
export function retryAfterMs(h: string | null): number {
  if (!h) return 0;
  const ms = /^\d+$/.test(h.trim()) ? Number(h) * 1000 : Date.parse(h) - Date.now();
  return Number.isFinite(ms) && ms > 0 ? Math.min(ms, MAX_WAIT) : 0;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type FetchRetryOptions<T> = {
  name: string; // префикс сообщений: «Rimi»
  read: (text: string) => T; // разбор тела; бросок = неожиданный ответ, повторяется как обрыв
  retryMs: number; // пауза перед повтором = retryMs * номер попытки, но не меньше Retry-After
  attempts?: number;
  timeoutMs?: number;
  headers?: Record<string, string>;
  gone?: number[]; // статусы, дающие null без повторов (карточка снята с сайта)
  init?: RequestInit;
};

/**
 * Повторяет обрывы сети (и при чтении тела), 5xx и 429; остальные 4xx повтор не лечит. Заглушка при любом коде даёт blocked без повторов.
 * Каждый повтор пишется в консоль: на раннерах GitHub по ним видно, где сайт рвёт соединение.
 */
export async function fetchRetry<T>(url: string, o: FetchRetryOptions<T>): Promise<T | null> {
  const attempts = o.attempts ?? 3;
  for (let attempt = 1; ; attempt++) {
    let failure: FetchError;
    let pause = 0;
    try {
      const res = await fetch(url, { ...o.init, headers: { "User-Agent": "BestPriceBot (personal project)", ...o.headers }, signal: AbortSignal.timeout(o.timeoutMs ?? 60_000) });
      if (o.gone?.includes(res.status)) return null;
      const text = await res.text();
      if (isBlockedPage(text)) throw new FetchError("blocked", o.name, `заглушка защиты от ботов (HTTP ${res.status}) ${url}`);
      if (res.ok) return o.read(text);
      failure = new FetchError(res.status === 429 ? "rate" : "http", o.name, `HTTP ${res.status} ${url}`);
      if (res.status < 500 && res.status !== 429) throw failure;
      pause = retryAfterMs(res.headers.get("retry-after"));
    } catch (e) {
      if (e instanceof FetchError && (e.kind === "blocked" || e.kind === "http")) throw e;
      failure = e instanceof FetchError ? e : new FetchError("network", o.name, `${e instanceof Error ? e.message : e} ${(e as { cause?: Error })?.cause?.message ?? ""}`.trim(), e);
    }
    if (attempt === attempts) throw failure;
    console.warn(`${failure.message}; повтор ${attempt}/${attempts - 1}`);
    await wait(Math.max(o.retryMs * attempt, pause));
  }
}

/**
 * Страж дрейфа формата: доля товаров с непустым полем не ниже min. Необязательное поле в схеме при смене формата
 * молча становится null у всех, а прогон остаётся зелёным (так бы вёл себя Mēness 14.11 без жёсткого падения category()).
 */
export function requireShare<T>(name: string, items: T[], field: string, pick: (i: T) => unknown, min: number): void {
  if (!items.length) return;
  const have = items.filter((i) => {
    const v = pick(i);
    return v !== null && v !== undefined && v !== "";
  }).length;
  if (have < items.length * min) {
    throw new Error(`${name}: поле ${field} есть у ${have} из ${items.length}, ожидалось не меньше ${Math.round(min * 100)}%, формат мог измениться`);
  }
}
