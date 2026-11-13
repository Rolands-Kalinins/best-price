"use server";

import { parseOfferEdit } from "@bestprice/core";
import { redirect } from "next/navigation";
import { adminSupabase } from "@/lib/admin";

const FIELDS = ["title", "brand", "packaging", "condition", "price", "old_price", "discount_percent", "ends_at", "image_url"] as const;

// Текст ошибки БД (имена таблиц, ограничения) не показываем и не кладём в адрес: он остаётся в журнале сервера.
function failed(back: string, detail: string): never {
  console.error("offers: не сохранилось:", detail);
  redirect(`${back}?err=${encodeURIComponent("Не сохранилось. Подробности в журнале сервера.")}`);
}

// Правка акции. Изменённые поля закрепляются (offers.locked_fields): парсер их больше не перезаписывает (триггер в базе).
export async function updateOffer(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id < 1) return;
  const grocery = (await adminSupabase()).schema("grocery");
  const back = `/grocery/admin/offers/${id}`;
  const { data: cur, error: curError } = await grocery.from("offers").select("title, brand, packaging, condition, price, old_price, discount_percent, ends_at, image_url, locked_fields").eq("id", id).single();
  if (curError) redirect(`${back}?err=${encodeURIComponent("Акция не найдена")}`);

  const parsed = parseOfferEdit(Object.fromEntries(FIELDS.map((k) => [k, String(formData.get(k) ?? "")])), cur);
  if (!parsed.ok) redirect(`${back}?err=${encodeURIComponent(parsed.error)}`);
  const { error } = await grocery.from("offers").update({ ...parsed.patch, locked_fields: parsed.locked, edited_at: new Date().toISOString() }).eq("id", id);
  if (error) failed(back, error.message);
  redirect(`${back}?saved=1`);
}

// Снять закрепление: значения остаются, но следующий запуск парсера вернёт данные магазина.
export async function unlockOffer(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id < 1) return;
  const grocery = (await adminSupabase()).schema("grocery");
  const { error } = await grocery.from("offers").update({ locked_fields: [], edited_at: null }).eq("id", id);
  if (error) failed(`/grocery/admin/offers/${id}`, error.message);
  redirect(`/grocery/admin/offers/${id}?unlocked=1`);
}
