// Смещение Риги (EET/EEST) меняется 25.10 и 29.03, поэтому считаем через Intl, а не константой.
export function rigaIso(y: number, m: number, d: number, h: number, mi: number, s: number): string {
  const offset = (t: number) => {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "Europe/Riga", hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric",
        hour: "numeric", minute: "numeric", second: "numeric",
      }).formatToParts(t).map((x) => [x.type, x.value]),
    );
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(t / 1000) * 1000;
  };
  const wall = Date.UTC(y, m - 1, d, h, mi, s);
  return new Date(wall - offset(wall - offset(wall))).toISOString();
}
