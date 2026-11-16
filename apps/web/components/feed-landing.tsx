"use client";

import type { LucideIcon } from "lucide-react";

export type LandingTile = { slug: string; name: string; Icon: LucideIcon };
export type Landing = { heading: string; examples: string[]; tiles: LandingTile[] };
type Pick = (patch: { q?: string; cat?: string }) => void;

const tile =
  "bg-card hover:bg-muted focus-visible:ring-ring/50 flex min-h-11 items-center gap-3 rounded-2xl border px-3 py-3 text-left text-sm font-medium outline-none transition-colors focus-visible:ring-3 motion-reduce:transition-none sm:flex-col sm:justify-center sm:gap-2 sm:px-2 sm:py-4 sm:text-center";

// Примеры запросов под полем поиска в зелёном баннере.
export function LandingExamples({ examples, onPick }: { examples: string[]; onPick: Pick }) {
  return (
    <div role="group" aria-label="Примеры запросов" className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-primary-foreground/80">Например:</span>
      {examples.map((e) => (
        <button
          key={e}
          type="button"
          onClick={() => onPick({ q: e })}
          className="border-primary-foreground/40 hover:bg-primary-foreground/15 focus-visible:ring-primary-foreground/60 min-h-11 rounded-full border px-3 outline-none focus-visible:ring-3"
        >
          {e}
        </button>
      ))}
    </div>
  );
}

// Плитки категорий под баннером.
export function LandingTiles({ tiles, onPick }: { tiles: LandingTile[]; onPick: Pick }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tiles.map(({ slug, name, Icon }) => (
        <li key={slug} className="flex">
          <button type="button" onClick={() => onPick({ cat: slug })} className={`${tile} w-full`}>
            <Icon className="text-primary size-6 shrink-0" aria-hidden />
            {name}
          </button>
        </li>
      ))}
    </ul>
  );
}
