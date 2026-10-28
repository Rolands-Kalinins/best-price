// Учёт квоты Gemini. Суточный лимит (RPD) Google сбрасывает в полночь по тихоокеанскому времени, поэтому «день» считаем по нему.
const LA = "America/Los_Angeles";

/** Календарный день по Лос-Анджелесу, `YYYY-MM-DD` (формат en-CA). */
export function pacificDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: LA }).format(d);
}

/** Секунд до следующей полуночи по Лос-Анджелесу. ponytail: в сутки смены времени (23 или 25 часов) ошибается на час. */
export function secondsUntilReset(d: Date): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: LA, hourCycle: "h23", hour: "numeric", minute: "numeric", second: "numeric" })
      .formatToParts(d)
      .map((x) => [x.type, Number(x.value)]),
  );
  return 86400 - (p.hour * 3600 + p.minute * 60 + p.second);
}

/** Расход за запуск; requests — все HTTP-запросы, включая повторы и неудачные, как их считает Google. */
export type Usage = { requests: number; tokensIn: number; tokensOut: number; errors: number; quotaHits: number; lastError: string | null; quotaHitAt: string | null };

export const emptyUsage = (): Usage => ({ requests: 0, tokensIn: 0, tokensOut: 0, errors: 0, quotaHits: 0, lastError: null, quotaHitAt: null });

export function recordSuccess(u: Usage, r: { attempts: number; tokensIn: number; tokensOut: number }): void {
  u.requests += r.attempts;
  u.tokensIn += r.tokensIn;
  u.tokensOut += r.tokensOut;
}

/** e — GeminiError (status, attempts) или любое другое исключение: тогда сколько запросов ушло, неизвестно, считаем один. */
export function recordFailure(u: Usage, e: { message: string; status?: number; attempts?: number }, now: Date): void {
  u.requests += e.attempts ?? 1;
  u.errors++;
  u.lastError = e.message.slice(0, 200);
  if (e.status === 429) {
    u.quotaHits++;
    u.quotaHitAt = now.toISOString();
  }
}

/** Доля использованного лимита, целые проценты 0..100; лимит не задан — 0. */
export function usagePercent(used: number, limit: number): number {
  return limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
}
