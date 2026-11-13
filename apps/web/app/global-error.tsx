"use client";

import "./globals.css";

// Сбой самого корневого шаблона: error.tsx разделов сюда не дотягиваются, поэтому свои html и body.
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="ru" className="h-full antialiased">
      <body className="min-h-full">
        <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 p-4 text-center">
          <h1 className="text-xl font-semibold">Что-то пошло не так</h1>
          <p className="text-muted-foreground text-sm">Повторите. Если не проходит, сообщите владельцу.</p>
          <button type="button" onClick={reset} className="bg-primary text-primary-foreground min-h-11 rounded-lg px-4 text-sm font-medium">
            Повторить
          </button>
        </main>
      </body>
    </html>
  );
}
