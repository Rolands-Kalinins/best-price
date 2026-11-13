"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

// Кнопка запуска парсеров: после нажатия блокируется (второй клик отправил бы второй запуск, а минуты GitHub Actions ограничены),
// а при `confirm` сначала спрашивает подтверждение.
export function RunButton({ confirm, children, disabled, ...props }: { confirm?: string } & Omit<ComponentProps<typeof Button>, "type" | "onClick">) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={disabled || pending}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      {...props}
    >
      {pending ? "Запускаю…" : children}
    </Button>
  );
}
