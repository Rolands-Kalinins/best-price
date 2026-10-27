"use client";

import { Button } from "@/components/ui/button";

export default function GroceryError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-xl font-semibold">Не удалось загрузить акции</h1>
      <p className="text-muted-foreground text-sm">Проверьте соединение и повторите. Если не проходит, сообщите владельцу.</p>
      <Button size="lg" className="min-h-11" onClick={reset}>
        Повторить
      </Button>
    </main>
  );
}
