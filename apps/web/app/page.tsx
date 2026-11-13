import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

// Страница всегда персональная, пререндер не нужен.
export const instant = false;

// Отдельной главной нет: участник сразу попадает в раздел «Акции».
// С открытой регистрацией (2.8.0.0) участник — любой вошедший с email, поэтому «Доступ закрыт» остаётся только для аккаунта без email.
export default async function Home() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const { data: isMember } = await supabase.rpc("is_member");
  if (isMember) redirect("/grocery");

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-2xl font-semibold">Доступ закрыт</h1>
      <p className="text-muted-foreground text-sm">
        У этого аккаунта нет адреса email, а доступ выдаётся по нему. Войдите другим аккаунтом Google.
      </p>
      <form action="/auth/signout" method="post">
        <Button variant="outline" size="lg" type="submit" className="min-h-11">
          Выйти
        </Button>
      </form>
    </main>
  );
}
