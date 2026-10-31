"use client";

import { Activity, BookOpen, Gauge, GitMerge, Tags } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/grocery/admin/offers", label: "Акции", icon: Tags },
  { href: "/grocery/admin/matches", label: "Сопоставление", icon: GitMerge },
  { href: "/grocery/admin/leaflet", label: "Буклеты", icon: BookOpen },
  { href: "/grocery/admin/scrapers", label: "Парсеры", icon: Activity },
  { href: "/grocery/admin/ai", label: "Лимиты Gemini", icon: Gauge },
];

// Боковое меню админки: слева на широком экране, лентой над страницей на узком.
export function AdminNav() {
  const path = usePathname();
  return (
    <nav aria-label="Админка" className="bg-background md:sticky md:top-14 md:h-[calc(100dvh-3.5rem)] md:w-56 md:shrink-0 md:border-r">
      <ul className="flex gap-1 overflow-x-auto border-b p-2 md:flex-col md:overflow-visible md:border-b-0 md:p-3">
        {items.map(({ href, label, icon: Icon }) => {
          const active = path === href || path.startsWith(`${href}/`);
          return (
            <li key={href} className="shrink-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`focus-visible:ring-ring/50 flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm whitespace-nowrap outline-none focus-visible:ring-3 ${active ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted"}`}
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
