"use server";

import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { canPullProdData } from "@bestprice/core";
import { redirect } from "next/navigation";
import { adminSupabase } from "@/lib/admin";

// Копия боевых данных в локальную БД: запускает scripts/db-pull.mjs (то же, что `pnpm db:pull`). Только на localhost с локальным Supabase;
// команда и аргументы фиксированы, от пользователя ничего не берётся. Боевая БД только читается, локальная заменяется целиком.
export async function pullProd() {
  await adminSupabase();
  const page = "/grocery/admin/scrapers";
  if (!canPullProdData(process.env.NODE_ENV, process.env.NEXT_PUBLIC_SUPABASE_URL)) redirect(`${page}?msg=pull-denied`);
  let error = "";
  try {
    await promisify(execFile)(process.execPath, ["scripts/db-pull.mjs"], { cwd: resolve(process.cwd(), "../.."), timeout: 600_000, maxBuffer: 1 << 24 });
  } catch (e) {
    const out = String((e as { stderr?: string }).stderr || (e as Error).message);
    error = out.trim().split("\n")[0].slice(0, 200); // причина (ответ Docker, HTTP-код боевой) идёт первой, «Command failed» после неё
  }
  redirect(error ? `${page}?msg=pull-failed&detail=${encodeURIComponent(error)}` : `${page}?msg=pulled`);
}

const WORKFLOW = "scrape.yml";
const REPO = process.env.GITHUB_REPO ?? "Rolands-Kalinins/best-price";

// Ручной запуск парсеров: workflow_dispatch в GitHub Actions. Нужен токен GITHUB_DISPATCH_TOKEN (fine-grained PAT, Actions: read/write
// только на этот репозиторий) в переменных Vercel; в браузер он не попадает. Результат показывает страница (?msg=...).
export async function runScrapers(formData: FormData) {
  const source = formData.get("source");
  if (typeof source !== "string" || !/^[a-z0-9-]{1,32}$/.test(source)) return;

  const supabase = await adminSupabase();
  if (source !== "all") {
    const { data } = await supabase.from("sources").select("id").eq("slug", source).eq("enabled", true).maybeSingle();
    if (!data) return;
  }

  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) redirect("/grocery/admin/scrapers?msg=no-token");
  const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    body: JSON.stringify({ ref: "main", inputs: { source } }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  redirect(`/grocery/admin/scrapers?msg=${res?.status === 204 ? `started-${source}` : "failed"}`);
}
