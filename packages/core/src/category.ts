// Категории товаров: Gemini один раз предложил список и латышские основы, человек правит
// categories-data.ts, а раскладывает код, без запросов к модели. Основа, как в ru-lv.ts: a-z и пробелы, «^» = с начала слова.
import { SEARCH_FROM, SEARCH_TO } from "./offer-view";

export type Category = { slug: string; name: string; stems: string[] };

/** Нижний регистр и без диакритики, как столбец grocery.offers.search. */
export const fold = (s: string) => [...s.toLowerCase()].map((c) => (SEARCH_FROM.includes(c) ? SEARCH_TO[SEARCH_FROM.indexOf(c)] : c)).join("");

/**
 * slug категории или null. Побеждает самая длинная подошедшая основа («piena šokolāde» — сладости, а не молочное),
 * при равенстве — категория выше в списке.
 */
export function categorize(cats: readonly Category[], text: string): string | null {
  const t = ` ${fold(text)}`;
  let best: string | null = null;
  let bestLen = 0;
  for (const c of cats) {
    for (const s of c.stems) {
      const word = s.startsWith("^");
      const stem = word ? s.slice(1) : s;
      if (stem.length > bestLen && (word ? t.includes(` ${stem}`) : t.includes(stem))) {
        best = c.slug;
        bestLen = stem.length;
      }
    }
  }
  return best;
}

export const OTHER = "other";

/** Что записать в offers.cat: slug → id акций, у которых категория изменилась. Нет совпадения — OTHER. Сначала категория магазина (у Etop и Lidl она словесная и точнее названия: «Čipsi ar siera garšu» с категорией «Čipsi» — не сыр; в 22% спорных случаев на боевых данных права она), затем название. Коды Rimi (SH-…) слов не содержат, там решает название. */
export function changedCategories(
  cats: readonly Category[],
  rows: { id: number; title: string; category: string | null; cat: string | null }[],
): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const r of rows) {
    // Путь «верх / середина / низ» (Barbora): слова верхних уровней сбивают («Saldējums un ledus» → напитки), решает последний.
    const slug = (r.category && categorize(cats, r.category.split(" / ").at(-1)!)) || categorize(cats, r.title) || OTHER;
    if (slug !== r.cat) out.set(slug, [...(out.get(slug) ?? []), r.id]);
  }
  return out;
}
