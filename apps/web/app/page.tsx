import Link from "next/link";
import { redirect } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

// Страница всегда персональная, пререндер не нужен.
export const instant = false;

export default async function Home() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const { data: isMember } = await supabase.rpc("is_member");

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-4 p-4 text-center">
      {isMember ? (
        <>
          <h1 className="text-2xl font-semibold">BestPrice</h1>
          <p className="text-muted-foreground text-sm">Вы вошли как {auth.user.email}</p>
          <Link href="/grocery" className={buttonVariants()}>Акции</Link>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold">Доступ закрыт</h1>
          <p className="text-muted-foreground text-sm">Обратитесь к владельцу.</p>
        </>
      )}
      <form action="/auth/signout" method="post">
        <Button variant="outline" type="submit">
          Выйти
        </Button>
      </form>
    </main>
  );
}
