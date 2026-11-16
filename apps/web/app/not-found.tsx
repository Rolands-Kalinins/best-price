import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata = { title: "Страница не найдена" };

export default function NotFound() {
  return (
    <main className="mx-auto flex flex-1 max-w-sm flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-xl font-semibold">Страница не найдена</h1>
      <p className="text-muted-foreground text-sm">Такого адреса нет. Вернитесь к акциям и найдите нужное через поиск.</p>
      <Link href="/grocery" className={cn(buttonVariants({ size: "lg" }), "min-h-11")}>
        К акциям
      </Link>
    </main>
  );
}
