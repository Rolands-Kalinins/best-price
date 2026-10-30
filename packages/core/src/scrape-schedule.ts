// Расписание ночного запуска парсеров. Должно совпадать с cron в .github/workflows/scrape.yml (проверяет тест).
// Время номинальное: GitHub запускает schedule с опозданием на часы.
export const SCRAPE_CRON = "17 22 * * *";
const [MINUTE, HOUR] = SCRAPE_CRON.split(" ").map(Number);

export function nextScrapeAt(now: Date): Date {
  const t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), HOUR, MINUTE));
  if (t <= now) t.setUTCDate(t.getUTCDate() + 1);
  return t;
}

export function formatCountdown(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const p = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h} ч ${p(m)} мин ${p(s % 60)} с` : m > 0 ? `${m} мин ${p(s % 60)} с` : `${s} с`;
}
