// Ключ товара аптеки для сравнения цен без штрихкода: бренд, размер, число штук и остальные слова названия. Совпасть должно всё,
// иначе ключи разные: лучше не показать пару, чем сравнить другую дозу или упаковку (цена лекарства при ошибке вводит в заблуждение).
import { parseProduct } from "./match";

// «N30», «Nr.30», «30 gab.», «30 tbl», «15 kapsulas»: число штук одно и то же, как ни написано.
const COUNT = /\b(?:n|nr\.?)\s?(\d+)\b|\b(\d+)\s*(?:gab|tbl|tabl|tab|tabletes|kaps|kapsulas|kapsulu)\b/;

export function pharmacyMatchKey(title: string, brandHint: string | null, brands: Set<string>): string | null {
  const t = title.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const m = t.match(COUNT);
  const p = parseProduct(m ? t.replace(COUNT, " ") : t, brandHint, brands);
  // Только бренд и ничего больше («TENA») для сопоставления мало.
  if (!p?.brand || (!p.size && !p.tokens.length)) return null;
  return [p.brand, p.size ?? "", m?.[1] ?? m?.[2] ?? "", p.tokens.join(" ")].join("|");
}

export type GroupItem = { id: number; sourceId: number; ean: string | null; key: string | null; price: number; inStock: boolean };

/**
 * Группы «один и тот же товар в разных аптеках»: общий штрихкод или общий ключ связывает товары (через третий тоже). Группа нужна, если в ней минимум
 * две аптеки. rep — один товар на группу, самый дешёвый из тех, что в наличии (ничья: меньший id; никого в наличии: самый дешёвый из всех): страница показывает
 * только его, остальные видны внутри его карточки. Товаров вне групп в результате нет (у них group_id пуст, rep = true).
 */
export function groupProducts(items: GroupItem[]): Map<number, { groupId: number; rep: boolean }> {
  const parent = items.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const seen = new Map<string, number>();
  items.forEach((it, i) => {
    for (const k of [it.ean && `e:${it.ean}`, it.key && `k:${it.key}`]) {
      if (!k) continue;
      const j = seen.get(k);
      if (j === undefined) seen.set(k, i);
      else parent[find(i)] = find(j);
    }
  });
  const comps = new Map<number, GroupItem[]>();
  items.forEach((it, i) => comps.set(find(i), [...(comps.get(find(i)) ?? []), it]));
  const out = new Map<number, { groupId: number; rep: boolean }>();
  for (const members of comps.values()) {
    if (new Set(members.map((m) => m.sourceId)).size < 2) continue;
    const pool = members.some((m) => m.inStock) ? members.filter((m) => m.inStock) : members;
    const rep = pool.reduce((a, b) => (b.price < a.price || (b.price === a.price && b.id < a.id) ? b : a));
    const groupId = Math.min(...members.map((m) => m.id));
    for (const m of members) out.set(m.id, { groupId, rep: m === rep });
  }
  return out;
}
