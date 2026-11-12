"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

// Копирование идёт около минуты: пока оно идёт, кнопка заблокирована, чтобы не запустить второе.
export function PullButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" className="min-h-11 px-4" disabled={pending}>
      {pending ? "Копирую…" : "Загрузить из боевой БД"}
    </Button>
  );
}
