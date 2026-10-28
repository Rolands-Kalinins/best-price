"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Решение админа по паре ключей. Пишет под сессией админа: политика match_decisions_admin пускает только его.
// Применяется при следующем запуске `pnpm --filter @bestprice/matcher match` (workflow match.yml).
export async function decide(formData: FormData) {
  const a = formData.get("keyA");
  const b = formData.get("keyB");
  const same = formData.get("same");
  if (typeof a !== "string" || typeof b !== "string" || a === b || a.length > 500 || b.length > 500) return;
  if (same !== "1" && same !== "0") return;

  const supabase = await createClient();
  const [key_a, key_b] = a < b ? [a, b] : [b, a];
  const { error } = await supabase
    .schema("grocery")
    .from("match_decisions")
    .upsert({ key_a, key_b, same: same === "1", decided_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  revalidatePath("/grocery/admin/matches");
}

// Убрать акцию из сопоставления («лишняя» в группе) или вернуть обратно. Применяется при следующем запуске `match`.
export async function exclude(formData: FormData) {
  const id = Number(formData.get("offerId"));
  const back = formData.get("back") === "1";
  if (!Number.isSafeInteger(id) || id <= 0) return;

  const supabase = await createClient();
  const table = supabase.schema("grocery").from("match_exclusions");
  // Вставка «если ещё нет» (ON CONFLICT DO NOTHING): обычный upsert требует права UPDATE, а таблице хватает select, insert, delete.
  const { error } = back
    ? await table.delete().eq("offer_id", id)
    : await table.upsert({ offer_id: id }, { onConflict: "offer_id", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
  revalidatePath("/grocery/admin/matches");
}
