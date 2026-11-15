"use client";

import { PHARMACY_CATEGORIES, type PharmacyQuery } from "@bestprice/core";
import { Baby, Droplets, Coffee, Leaf, type LucideIcon, Package, PawPrint, Pill, Sparkles, Stethoscope } from "lucide-react";

// Латышские запросы: русский словарь поиска знает не все слова («ибупрофен» ничего не находит). Хиты на 2026-11-15: 12–246 товаров.
const EXAMPLES = ["ibuprofēns", "paracetamols", "magnijs", "omega-3", "melatonīns", "kolagēns"];

const ICONS: Record<string, LucideIcon> = {
  medicine: Pill,
  supplements: Leaf,
  "tea-food": Coffee,
  hygiene: Droplets,
  skincare: Sparkles,
  baby: Baby,
  medical: Stethoscope,
  pets: PawPrint,
};

const tile =
  "bg-card hover:bg-muted focus-visible:ring-ring/50 flex min-h-11 items-center gap-3 rounded-2xl border px-3 py-3 text-left text-sm font-medium outline-none transition-colors focus-visible:ring-3 motion-reduce:transition-none sm:flex-col sm:justify-center sm:gap-2 sm:px-2 sm:py-4 sm:text-center";

// Блок начала раздела (чистая страница): примеры запросов и плитки категорий. Выбор уходит в общую ленту (useFeed.update).
export function PharmacyLanding({ onPick }: { onPick: (patch: Partial<PharmacyQuery>) => void }) {
  return (
    <div className="space-y-4">
      <div role="group" aria-label="Примеры запросов" className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Например:</span>
        {EXAMPLES.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => onPick({ q: e })}
            className="hover:bg-muted focus-visible:ring-ring/50 min-h-11 rounded-full border px-3 outline-none focus-visible:ring-3"
          >
            {e}
          </button>
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {PHARMACY_CATEGORIES.map((c) => {
          const Icon = ICONS[c.slug] ?? Package;
          return (
            <li key={c.slug} className="flex">
              <button type="button" onClick={() => onPick({ cat: c.slug })} className={`${tile} w-full`}>
                <Icon className="text-primary size-6 shrink-0" aria-hidden />
                {c.name}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
