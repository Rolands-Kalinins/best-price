// Сопоставление одного товара в разных магазинах (FR-37…FR-39). Ни EAN, ни бренда в акциях Rimi и Maxima нет,
// поэтому бренд, размер и слова берём из названия. Совпасть должно всё: бренд, размер, слова и условие.

export type ParsedProduct = { brand: string; size: string | null; tokens: string[] };

// Сокращения упаковки, которые магазины пишут по-разному и которые не отличают товар.
const NOISE = new Set(["d", "pet", "can", "skard", "gab", "gr", "ar"]);
// Акция на несколько товаров сразу («COCA-COLA, FANTA vai SPRITE, четыре вида»): это не один товар.
const MULTI = /\b(vai|veidi|veidu|asorti)\b/;
const UNIT = { kg: ["g", 1000], gr: ["g", 1], g: ["g", 1], l: ["ml", 1000], ml: ["ml", 1] } as const;
const SIZE = /(?:(\d+)\s*x\s*)?(\d+(?:\.\d+)?)\s*(kg|gr|g|ml|l)(?![a-wyz])(?:\s*x\s*(\d+))?/;

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/(\d)\s*-\s*(\d)/g, "$1-$2")
    .replace(/([a-z])-([a-z])/g, "$1 $2");

const tokenize = (s: string) => s.match(/\d+(?:[.-]\d+)*%?|[a-z]+/g) ?? [];

// Слова, после которых в названии стоит точка («koc.», «mais.», «vīrieš.»): магазин их сократил. Десятичная точка («1.5») не считается: перед ней цифра.
export function abbrTokens(title: string): Set<string> {
  return new Set([...norm(title).matchAll(/([a-z]+)\./g)].map((m) => m[1]));
}

// Падежные окончания латышского (без диакритики). Другие хвосты («colorist» после «color», «classico» после «classic») — другое слово.
const ENDINGS = new Set(["", "a", "as", "e", "es", "i", "is", "s", "u", "us", "os", "am", "ai", "ais", "iem", "ies", "ei", "em", "ie", "um"]);
// Одно слово в разных падежах: общее начало не короче 4 букв, хвосты из ENDINGS («citrona» и «citronu»).
const sameStem = (x: string, y: string) => {
  let i = 0;
  while (i < x.length && x[i] === y[i]) i++;
  return i >= 4 && ENDINGS.has(x.slice(i)) && ENDINGS.has(y.slice(i));
};
const sameWord = (x: string, y: string, abbr: Set<string>) =>
  x === y || (/^[a-z]+$/.test(x) && /^[a-z]+$/.test(y) && ((abbr.has(x) && y.startsWith(x)) || (abbr.has(y) && x.startsWith(y)) || sameStem(x, y)));

// Слова двух ключей различаются только сокращением с точкой или окончанием: те же слова после попарного сопоставления. Лишнее слово («Gum Care») — нет.
export function softEqual(a: string[], b: string[], abbr: Set<string>): boolean {
  const ra = a.filter((t) => !b.includes(t));
  const free = b.filter((t) => !a.includes(t));
  if (ra.length === 0 || ra.length !== free.length) return false;
  return ra.every((x) => {
    const i = free.findIndex((y) => sameWord(x, y, abbr));
    if (i < 0) return false;
    free.splice(i, 1);
    return true;
  });
}

// Служебные слова, которые магазины пишут не везде («garšu», «stavpaka»): только с одной стороны они ключи не различают.
// Список из решений админа (backtest 2026-11-20): везде «тот же», ни одной ошибки среди «разных». «kastite» не вошло: кофе «kastīte» админ развёл.
const SIDE_NOISE = new Set(["garsu", "skeles", "stavpaka", "viriesiem"]);

// Правила без точки для ключей одной корзины. (1) Слова, различающиеся только служебным словом. (2) Одно слово обрезано магазином («konf» и «konfektes»):
// короткое — начало длинного, не короче 3 букв, и встречается в корпусе реже длинного. Частое короткое слово — настоящее слово («white» и «whitening»,
// «color» и «colorist»), при равенстве частот тоже не склеиваем. freq — в скольких ключах сегодняшних акций встречается слово.
// ponytail: freq зависит от корпуса, пара на границе (3 и 4 ключа) может переключаться между запусками; нужен словарь, если станет мешать.
export function looseEqual(a: string[], b: string[], freq: ReadonlyMap<string, number>): boolean {
  const ra = a.filter((t) => !b.includes(t) && !SIDE_NOISE.has(t));
  const rb = b.filter((t) => !a.includes(t) && !SIDE_NOISE.has(t));
  if (ra.length === 0 && rb.length === 0) return true;
  if (ra.length !== 1 || rb.length !== 1) return false;
  const [x, y] = ra[0].length <= rb[0].length ? [ra[0], rb[0]] : [rb[0], ra[0]];
  return /^[a-z]+$/.test(x + y) && x.length >= 3 && y.startsWith(x) && (freq.get(x) ?? 0) < (freq.get(y) ?? 0);
}

export function normalizeBrand(brand: string): string {
  return tokenize(norm(brand)).join(" ");
}

// Бренд ищем в названии как самую длинную подпоследовательность слов из словаря; не нашли — берём поле магазина.
export function parseProduct(title: string, brandHint: string | null, brands: Set<string>): ParsedProduct | null {
  let s = norm(title);
  if (MULTI.test(s)) return null;
  let size: string | null = null;
  const m = s.match(SIZE);
  if (m) {
    const [unit, k] = UNIT[m[3] as keyof typeof UNIT];
    const amount = Number(m[1] ?? 1) * Number(m[2]) * k * Number(m[4] ?? 1);
    size = `${Math.round(amount)}${unit}`;
    s = s.replace(SIZE, " ");
  }
  let tokens = tokenize(s).filter((t) => !NOISE.has(t));
  const hint = brandHint ? normalizeBrand(brandHint) : "";
  let brand = "";
  for (let n = 3; n >= 1 && !brand; n--) {
    for (let i = 0; i + n <= tokens.length; i++) {
      const cand = tokens.slice(i, i + n).join(" ");
      if (brands.has(cand) || (hint && cand === hint)) {
        brand = cand;
        tokens = [...tokens.slice(0, i), ...tokens.slice(i + n)];
        break;
      }
    }
  }
  return { brand: brand || hint, size, tokens: [...new Set(tokens)].sort() };
}

// Условие, которое должно совпасть. Карта магазина условием не считается (цена по карте идёт с бейджем).
// "" — нет условия, "min2" — «от 2 шт.», "set2" — цена за набор из 2. null — не сопоставляем: «любые 2 товара» и любой
// незнакомый текст («2+1»): лучше пропустить, чем сравнить несравнимые цены.
export function conditionKind(condition: string | null): string | null {
  const c = (condition ? norm(condition) : "").replace(/ar (?:lidl plus|\w+!? karti)/g, "").replace(/[\s·]+/g, " ").trim();
  if (!c) return "";
  const set = c.match(/cena par (\d+) gab/);
  if (set) return `set${set[1]}`;
  const min = c.match(/(\d+) un vairak/);
  return min ? `min${min[1]}` : null;
}

export type MatchItem = { id: number; sourceId: number; title: string; brand: string | null; condition: string | null };
export type MatchDecision = { keyA: string; keyB: string; same: boolean };
export type MatchGroup = { key: string; offerIds: number[] };
export type MatchSuggestion = { keyA: string; keyB: string; offerIds: number[]; idsA: number[]; idsB: number[] };

const pair = (a: string, b: string) => (a < b ? `${a}\n${b}` : `${b}\n${a}`);

export function buildMatches(items: MatchItem[], brands: Set<string>, decisions: MatchDecision[], excluded: ReadonlySet<number> = new Set()) {
  // Ключ = бренд | размер | условие | слова. Товары без бренда или размера не сопоставляем.
  const byKey = new Map<string, { prefix: string; tokens: string[]; abbr: Set<string>; items: MatchItem[] }>();
  for (const it of items) {
    if (excluded.has(it.id)) continue; // админ убрал эту акцию из сопоставления
    const p = parseProduct(it.title, it.brand, brands);
    const cond = conditionKind(it.condition);
    if (!p || !p.brand || !p.size || cond === null) continue;
    const prefix = `${p.brand}|${p.size}|${cond}`;
    const key = `${prefix}|${p.tokens.join(" ")}`;
    const e = byKey.get(key) ?? byKey.set(key, { prefix, tokens: p.tokens, abbr: new Set(), items: [] }).get(key)!;
    e.items.push(it);
    for (const t of abbrTokens(it.title)) e.abbr.add(t);
  }

  // «Тот же товар» от админа склеивает ключи в одну группу.
  const parent = new Map<string, string>();
  const root = (k: string): string => (parent.get(k) && parent.get(k) !== k ? root(parent.get(k)!) : k);
  const decided = new Set<string>();
  const denied: [string, string][] = [];
  for (const d of decisions) {
    decided.add(pair(d.keyA, d.keyB));
    if (!d.same) denied.push([d.keyA, d.keyB]);
    if (d.same && byKey.has(d.keyA) && byKey.has(d.keyB)) parent.set(root(d.keyA), root(d.keyB));
  }

  // Правило сокращений: ключи одной корзины (бренд | размер | условие), слова которых различаются только сокращением с точкой или окончанием,
  // объединяются сами. Решение админа по паре (и «тот же», и «разные») сильнее правила.
  const buckets = new Map<string, string[]>();
  for (const [k, v] of byKey) buckets.set(v.prefix, [...(buckets.get(v.prefix) ?? []), k]);
  const soft: { keyA: string; keyB: string }[] = [];
  const freq = new Map<string, number>();
  for (const v of byKey.values()) for (const t of v.tokens) freq.set(t, (freq.get(t) ?? 0) + 1);
  for (const keys of buckets.values()) {
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const a = byKey.get(keys[i])!, b = byKey.get(keys[j])!;
        if (decided.has(pair(keys[i], keys[j])) || root(keys[i]) === root(keys[j])) continue;
        if (!softEqual(a.tokens, b.tokens, new Set([...a.abbr, ...b.abbr])) && !looseEqual(a.tokens, b.tokens, freq)) continue;
        // Склейка не должна соединить ключи, которые админ развёл («разные»), даже через посредника.
        const ra = root(keys[i]), rb = root(keys[j]);
        if (denied.some(([x, y]) => (root(x) === ra && root(y) === rb) || (root(x) === rb && root(y) === ra))) continue;
        parent.set(root(keys[i]), root(keys[j]));
        soft.push(keys[i] < keys[j] ? { keyA: keys[i], keyB: keys[j] } : { keyA: keys[j], keyB: keys[i] });
      }
    }
  }

  // Ключ группы = наименьший из склеенных ключей: не зависит от порядка склейки, продукт в БД не «переезжает».
  const comps = new Map<string, { key: string; items: MatchItem[] }>();
  for (const [k, v] of byKey) {
    const c = comps.get(root(k)) ?? { key: k, items: [] };
    if (k < c.key) c.key = k;
    c.items.push(...v.items);
    comps.set(root(k), c);
  }
  const sorted = (xs: MatchItem[]) => xs.map((x) => x.id).sort((a, b) => a - b);
  const groups: MatchGroup[] = [];
  for (const c of comps.values()) if (new Set(c.items.map((x) => x.sourceId)).size >= 2) groups.push({ key: c.key, offerIds: sorted(c.items) });

  // Предположение: тот же бренд, размер и условие, слова совпадают не меньше чем на 0,6 (Жаккар).
  // Сравниваем попарно только внутри бакета (бренд | размер | условие). ponytail: O(n²) в бакете, хватает для тысяч товаров.
  const suggestions: MatchSuggestion[] = [];
  for (const keys of buckets.values()) {
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const a = byKey.get(keys[i])!, b = byKey.get(keys[j])!;
        if (root(keys[i]) === root(keys[j]) || decided.has(pair(keys[i], keys[j]))) continue;
        const both = [...a.items, ...b.items];
        if (new Set(both.map((x) => x.sourceId)).size < 2) continue;
        const shared = a.tokens.filter((t) => b.tokens.includes(t)).length;
        if (shared >= 1 && shared / (a.tokens.length + b.tokens.length - shared) >= 0.6) {
          const [keyA, keyB] = keys[i] < keys[j] ? [keys[i], keys[j]] : [keys[j], keys[i]];
          const [ia, ib] = keys[i] < keys[j] ? [a, b] : [b, a];
          suggestions.push({ keyA, keyB, offerIds: sorted(both), idsA: sorted(ia.items), idsB: sorted(ib.items) });
        }
      }
    }
  }
  // Решение «разные» внутри одной группы: админ развёл ключи, а склейка через третий ключ их всё же соединила.
  const conflicts = denied.filter(([x, y]) => byKey.has(x) && byKey.has(y) && root(x) === root(y)).map(([x, y]) => (x < y ? { keyA: x, keyB: y } : { keyA: y, keyB: x }));
  return { groups, suggestions, soft, conflicts };
}

// Что изменить в offers.product_id: привязать акции к товару (товар → id акций) и снять привязку с тех, кто выпал из групп.
export function diffLinks(current: { id: number; productId: number | null }[], want: Map<number, number>) {
  const toSet = new Map<number, number[]>();
  const toClear: number[] = [];
  for (const { id, productId } of current) {
    const w = want.get(id) ?? null;
    if (w === productId) continue;
    if (w === null) toClear.push(id);
    else toSet.set(w, [...(toSet.get(w) ?? []), id]);
  }
  return { toSet, toClear };
}

// Защита от пустого или усечённого чтения (сбой парсера, обрыв запроса): иначе пересчёт снял бы все привязки и удалил товары.
// Сравниваем акции с привязкой до и после пересчёта, а не группы с акциями: это разные единицы.
export function isSuspiciousRun({ rows, linkedBefore, linkedAfter }: { rows: number; linkedBefore: number; linkedAfter: number }): boolean {
  return rows === 0 || (linkedBefore > 20 && linkedAfter < linkedBefore / 4);
}
