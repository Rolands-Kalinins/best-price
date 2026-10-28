import assert from "node:assert/strict";
import { test } from "node:test";
import { categorize } from "./category";
import { CATEGORIES } from "./categories-data";

test("slug уникальны, «Другое» последнее, основы в нужном формате", () => {
  assert.equal(new Set(CATEGORIES.map((c) => c.slug)).size, CATEGORIES.length);
  assert.equal(CATEGORIES.at(-1)?.slug, "other");
  for (const c of CATEGORIES) for (const s of c.stems) assert.match(s, /^\^?[a-z][a-z ]{2,}$/, `${c.slug}: «${s}»`);
});

// Реальные названия из магазинов: закрепляют ошибки, которые уже ловили (сокращения Etop, общие слова-основы).
const CASES: [string, string][] = [
  ["PILOS Ultrapasterizēts piens", "dairy"],
  ["Piena šokolāde Milka 95g", "sweets-snacks"],
  ["Cāļa krūtiņas fileja", "meat-fish"],
  ["Rudzu maize formas melnā sagriezta 600g", "bakery"],
  ["Spānijas mango Osteen", "produce"],
  ["Tr.mazg.līdz.FAIRY Lemon 900ml", "cleaning"],
  ["Dušas želeja un šampūns Neutral Baby 250ml", "beauty"],
  ["S zeķub.Immagine confort 40d bronzo 2", "clothing"],
  ["BARĪBA KAĶIEM KONS.FELIX SENSATIONS SAUCES ZIVJU IZL. 85GX4", "pets"],
  ["Kausētais siers DZINTARS klasiskais 200g", "dairy"],
  ["Jogurts Piatnica bez piedevām 330g", "dairy"],
  ["Autiņb. Pampers Jumbo Pack S8 32gab.", "kids"],
  ["LED spuldze Osram cla40 4w 840k e27", "home"],
  ["Bezalkoholiskais alus Užavas 0,5l", "alcohol"],
];
for (const [title, slug] of CASES) test(`«${title}» → ${slug}`, () => assert.equal(categorize(CATEGORIES, title), slug));

test("«zobenzāģis» — не зубная паста, «sok» — сокращение «šok.»", () => {
  assert.notEqual(categorize(CATEGORIES, "PARKSIDE Ar akumulatoru darbināms zobenzāģis 20 V"), "beauty");
  assert.equal(categorize(CATEGORIES, "Šok.bat.BlackWhite Multipack LION 5x30g"), "sweets-snacks");
});
