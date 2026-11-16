import Link from "next/link";

// Версия берётся из файла VERSION в корне при сборке (next.config.ts).
export function SiteFooter() {
  const version = process.env.NEXT_PUBLIC_APP_VERSION;
  return (
    <footer className="text-muted-foreground mt-auto border-t py-4 text-center text-xs">
      BestPrice{version && <> · <span className="font-price tabular-nums">v{version}</span></>} ·{" "}
      <Link href="/privacy" className="hover:text-foreground inline-flex min-h-6 items-center underline underline-offset-2">
        Конфиденциальность
      </Link>
    </footer>
  );
}
