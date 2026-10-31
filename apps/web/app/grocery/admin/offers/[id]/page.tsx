import { safeHttpUrl } from "@bestprice/core";
import { ArrowLeft, Lock } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { unlockOffer, updateOffer } from "../actions";

export const instant = false;

const stampFmt = new Intl.DateTimeFormat("ru", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Riga" });
const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Riga" });
const input = "bg-background min-h-11 w-full rounded-lg border px-3 text-sm";
const LABELS: Record<string, string> = { title: "название", brand: "бренд", packaging: "объём", condition: "условие", price: "цена", old_price: "было", discount_percent: "скидка", ends_at: "срок", image_url: "картинка", unit_price: "цена за кг/л", unit: "единица" };

function Field({ name, label, defaultValue, hint, type = "text", inputMode }: { name: string; label: string; defaultValue: string; hint?: string; type?: string; inputMode?: "decimal" | "numeric" }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      <input name={name} type={type} inputMode={inputMode} defaultValue={defaultValue} className={input} />
      {hint && <span className="text-muted-foreground block text-xs">{hint}</span>}
    </label>
  );
}

// Правка одной акции: название, бренд, объём, условие, цены, срок, картинка. Сохранённое закрепляется, парсер его не перезапишет.
export default async function OfferEditPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; unlocked?: string; err?: string }> }) {
  const { id: idText } = await params;
  if (!/^\d+$/.test(idText)) notFound();
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) redirect("/grocery");

  const grocery = supabase.schema("grocery");
  const { data: o } = await grocery.from("offers").select("id, source_id, external_id, title, brand, packaging, condition, price, old_price, discount_percent, unit_price, unit, ends_at, image_url, url, last_seen_at, edited_at, locked_fields").eq("id", Number(idText)).maybeSingle();
  if (!o) notFound();
  const { data: source } = await supabase.from("sources").select("name").eq("id", o.source_id).single();
  const sp = await searchParams;
  const img = safeHttpUrl(o.image_url);
  const link = safeHttpUrl(o.url);
  const num = (n: number | null) => (n === null ? "" : String(n).replace(".", ","));

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4">
      <Link href="/grocery/admin/offers" className="text-primary inline-flex min-h-11 items-center gap-1 text-sm underline-offset-2 hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> К списку акций
      </Link>
      <h1 className="text-2xl font-semibold break-words">{o.title}</h1>
      <p className="text-muted-foreground text-sm">
        {source?.name} · ключ <code>{o.external_id}</code> · парсер видел {stampFmt.format(new Date(o.last_seen_at))}
        {o.edited_at && <> · правили {stampFmt.format(new Date(o.edited_at))}</>}
        {link && <> · <a href={link} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-2 hover:underline">страница магазина</a></>}
      </p>

      {sp.saved && <p role="status" className="rounded-lg border p-3 text-sm">Сохранено. Изменённые поля закреплены: парсер их не перезапишет.</p>}
      {sp.unlocked && <p role="status" className="rounded-lg border p-3 text-sm">Закрепление снято. Значения остались, но следующий запуск парсера вернёт данные магазина.</p>}
      {sp.err && <p role="alert" className="text-destructive border-destructive/40 rounded-lg border p-3 text-sm">{sp.err}</p>}

      {o.locked_fields.length > 0 && (
        <p className="bg-accent text-accent-foreground flex flex-wrap items-center gap-2 rounded-lg p-3 text-sm">
          <Lock className="size-4" aria-hidden /> Закреплено от парсера: {o.locked_fields.map((f) => LABELS[f] ?? f).join(", ")}
        </p>
      )}

      <form action={updateOffer} className="bg-card grid gap-4 rounded-2xl border p-4 sm:grid-cols-2">
        <input type="hidden" name="id" value={o.id} />
        <div className="sm:col-span-2"><Field name="title" label="Название" defaultValue={o.title} /></div>
        <Field name="brand" label="Бренд" defaultValue={o.brand ?? ""} />
        <Field name="packaging" label="Объём, вес" defaultValue={o.packaging ?? ""} hint="Например 250 ml, 1 kg, 6 x 64 g: по нему считается цена за кг или л" />
        <div className="sm:col-span-2"><Field name="condition" label="Условие, плашка" defaultValue={o.condition ?? ""} hint="Например «Lidl Plus», «2. precei», «Limits: 12 gab.»" /></div>
        <Field name="price" label="Цена, €" defaultValue={num(o.price)} inputMode="decimal" hint="Пусто для скидки на бренд или категорию (тогда нужен процент)" />
        <Field name="old_price" label="Было, €" defaultValue={num(o.old_price)} inputMode="decimal" />
        <Field name="discount_percent" label="Скидка, %" defaultValue={o.discount_percent === null ? "" : String(o.discount_percent)} inputMode="numeric" />
        <Field name="ends_at" label="Действует до" type="date" defaultValue={o.ends_at ? day.format(new Date(o.ends_at)) : ""} />
        <div className="sm:col-span-2 space-y-2">
          <Field name="image_url" label="Ссылка на картинку" defaultValue={o.image_url ?? ""} hint="Адрес картинки с http:// или https://. Пусто — без картинки" />
          <span className="flex size-32 items-center justify-center overflow-hidden rounded-lg border bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element -- next/image не используем: лимит оптимизации на Vercel Hobby */}
            {img ? <img src={img} alt="Текущая картинка" referrerPolicy="no-referrer" className="size-full object-contain" /> : <span className="text-muted-foreground text-xs">нет картинки</span>}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <button type="submit" className="bg-primary text-primary-foreground min-h-11 rounded-lg px-5 text-sm font-medium">Сохранить</button>
          <span className="text-muted-foreground text-xs">Цена за кг или л: {o.unit_price === null ? "нет" : `${String(o.unit_price).replace(".", ",")} €/${o.unit === "l" ? "л" : "кг"}`}, считается сама.</span>
        </div>
      </form>

      {o.locked_fields.length > 0 && (
        <form action={unlockOffer}>
          <input type="hidden" name="id" value={o.id} />
          <button type="submit" className="bg-card min-h-11 rounded-lg border px-4 text-sm">Снять закрепление (вернуть данные парсера при его запуске)</button>
        </form>
      )}
    </div>
  );
}
