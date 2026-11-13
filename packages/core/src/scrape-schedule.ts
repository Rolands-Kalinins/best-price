// Расписание ночного запуска парсеров. Должно совпадать с cron в .github/workflows/scrape.yml (проверяет тест).
// Время номинальное: GitHub запускает schedule с опозданием на часы.
export const SCRAPE_CRON = "17 22 * * *";
const [MINUTE, HOUR] = SCRAPE_CRON.split(" ").map(Number);

export function nextScrapeAt(now: Date): Date {
  const t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), HOUR, MINUTE));
  if (t <= now) t.setUTCDate(t.getUTCDate() + 1);
  return t;
}

// Расписание по магазинам (экономия минут Actions): остальные идут каждую ночь по SCRAPE_CRON. Каждая строка дословно есть в scrape.yml (проверяет тест).
// Дни недели cron в UTC: ночь с вс на пн по Риге = «0».
const SHOP_CRONS: Record<string, string[]> = {
  rimi: ["27 22 * * 0,2,3,6"],
  apotheka: ["37 22 * * 0", "37 22 * * 2,4"],
  euroaptieka: ["37 22 * * 0", "37 22 * * 2,4"],
  lidl: ["47 22 * * 0"],
};
export const SCRAPE_CRONS = [SCRAPE_CRON, ...new Set(Object.values(SHOP_CRONS).flat())];

const cronsOf = (slug: string) => SHOP_CRONS[slug] ?? [SCRAPE_CRON];
const parse = (cron: string) => {
  const [m, h, , , d] = cron.split(" ");
  return { minute: Number(m), hour: Number(h), dows: d === "*" ? [0, 1, 2, 3, 4, 5, 6] : d.split(",").map(Number) };
};

/** Ближайший запуск магазина по расписанию (номинальное время UTC, GitHub опаздывает на часы). */
export function nextRunAt(slug: string, now: Date): Date {
  const times: Date[] = [];
  for (const c of cronsOf(slug)) {
    const { minute, hour, dows } = parse(c);
    for (let i = 0; i <= 7; i++) {
      const t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + i, hour, minute));
      if (t > now && dows.includes(t.getUTCDay())) {
        times.push(t);
        break;
      }
    }
  }
  return times.reduce((a, b) => (a < b ? a : b));
}

/** Через сколько часов без запуска данные магазина считаются устаревшими: самая длинная пауза расписания плюс сутки. */
export function staleAfterHours(slug: string): number {
  const days = [...new Set(cronsOf(slug).flatMap((c) => parse(c).dows))].sort((a, b) => a - b);
  const gap = Math.max(...days.map((d, i) => (days[(i + 1) % days.length] - d + 7) % 7 || 7));
  return (gap + 1) * 24;
}

export function formatCountdown(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const p = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h} ч ${p(m)} мин ${p(s % 60)} с` : m > 0 ? `${m} мин ${p(s % 60)} с` : `${s} с`;
}
