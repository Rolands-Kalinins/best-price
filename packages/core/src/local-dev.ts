// Копирование боевых данных в локальную БД (кнопка в админке) разрешено только на dev-сервере с локальным Supabase:
// на Vercel и при боевом адресе в окружении кнопки нет и действие отказывает.
export function canPullProdData(nodeEnv: string | undefined, supabaseUrl: string | undefined): boolean {
  return nodeEnv === "development" && /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/.test(supabaseUrl ?? "");
}
