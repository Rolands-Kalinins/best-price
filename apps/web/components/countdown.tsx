"use client";

import { formatCountdown } from "@bestprice/core";
import { useEffect, useState } from "react";

// Обратный отсчёт до момента `to` (ISO). До гидрации времени клиента нет, поэтому сначала прочерк.
export function Countdown({ to }: { to: string }) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setLeft((new Date(to).getTime() - Date.now()) / 1000);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [to]);
  return <span className="tabular-nums">{left === null ? "—" : formatCountdown(left)}</span>;
}
