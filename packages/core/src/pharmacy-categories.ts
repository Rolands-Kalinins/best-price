// Категории товаров аптек по смыслу (рецептурность не категория, а флаг prescription). Раскладывает categorize (category.ts), как для продуктов.
// Основы ищутся в пути категории магазина («skaistumam/sejas-adas-kopsana/serumi», без диакритики), потом в названии; побеждает самая длинная.
// Основы подобраны по реальным путям Mēness (2026-11-01); новый магазин добавляет свои, проверка: pnpm --filter @bestprice/matcher categorize --pharmacy --dry.
import type { Category } from "./category";

export const PHARMACY_CATEGORIES: readonly Category[] = [
  { slug: "medicine", name: "Лекарства без рецепта", stems: ["medikament", "^tbl", "^tabletes", "^kapsulas", "^cps", "^pilieni", "^sirups", "^ziede", "^pastilas"] },
  { slug: "supplements", name: "БАДы и витамины", stems: ["vitamini", "mineralvielu", "uztura-bagatinataji", "uztura bagatinataji"] },
  { slug: "tea-food", name: "Чаи и питание", stems: ["tejas-un-partika", "^teja", "^tejas", "partika"] },
  { slug: "hygiene", name: "Гигиена", stems: ["higien", "zobu", "mutes", "intim", "vates", "salvet", "ieliktn", "tampon", "paladz", "prezervat", "^dezodor"] },
  { slug: "skincare", name: "Косметика и уход", stems: ["skaistum", "kosmetik", "krems", "sampuns", "serums", "losjons", "balzams", "matu", "sejas"] },
  { slug: "baby", name: "Мама и ребёнок", stems: ["maminam-un-berniem", "maminas-un-berni", "maminu-un-bernu", "maminai-un-mazulim", "bernu", "zidaini", "pudele", "knupis"] },
  { slug: "medical", name: "Медицинские товары", stems: ["medicinas-preces", "analizu", "testi", "tests", "termometr", "plaksteri", "pirma-palidziba", "ortopedisk", "saites", "masku", "slirc", "insulin", "^adat", "^adu"] },
  { slug: "pets", name: "Товары для животных", stems: ["majdzivni", "dzivniek", "kaki", "suniem", "^kaku", "^sunu"] },
];

/** Связь с продуктовыми категориями (CATEGORIES), чтобы сравнивать аптечный товар с продуктовым магазином по смыслу. null: у продуктов аналога нет. */
export const PHARMACY_TO_GROCERY: Record<string, string | null> = {
  medicine: "health",
  supplements: "health",
  "tea-food": "drinks",
  hygiene: "beauty",
  skincare: "beauty",
  baby: "kids",
  medical: null,
  pets: "pets",
};
