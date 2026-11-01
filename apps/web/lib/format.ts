const rtf = new Intl.RelativeTimeFormat("ru", { numeric: "auto" });
const dateFmt = new Intl.DateTimeFormat("ru", { day: "numeric", month: "numeric", timeZone: "Europe/Riga" });

export const eur = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;

/** 30653 → «30 653»: число из счётчиков и кнопок. */
export const num = (n: number) => n.toLocaleString("ru-RU");

export const shortDate = (iso: string) => dateFmt.format(new Date(iso));

export function ago(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 60) return rtf.format(-min, "minute");
  if (min < 60 * 24) return rtf.format(-Math.round(min / 60), "hour");
  return rtf.format(-Math.round(min / 60 / 24), "day");
}
