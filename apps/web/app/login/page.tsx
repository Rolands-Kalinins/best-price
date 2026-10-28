"use client";

import { ShoppingBasket } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

// Вход по паролю только в `pnpm dev`: в боевой сборке NODE_ENV другой, ветка вырезается.
const devLogin = process.env.NODE_ENV === "development";

function PasswordForm() {
  const signIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const { error } = await createClient().auth.signInWithPassword({
      email: String(f.get("email")),
      password: String(f.get("password")),
    });
    location.assign(error ? "/login?error=1" : "/");
  };

  return (
    <form onSubmit={signIn} className="space-y-3 border-t pt-6 text-left">
      <p className="text-muted-foreground text-xs">Только локальная разработка</p>
      <input name="email" type="email" placeholder="Email" required className="bg-background w-full rounded-lg border px-3 py-2 text-sm" />
      <input name="password" type="password" placeholder="Пароль" required className="bg-background w-full rounded-lg border px-3 py-2 text-sm" />
      <Button type="submit" variant="outline" className="min-h-11 w-full">
        Войти по паролю
      </Button>
    </form>
  );
}

function LoginForm() {
  const failed = useSearchParams().get("error");

  const signIn = () =>
    createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback` },
    });

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="bg-card w-full max-w-sm space-y-6 rounded-2xl border p-8 text-center">
        <span className="bg-accent text-primary mx-auto flex size-14 items-center justify-center rounded-2xl">
          <ShoppingBasket className="size-7" aria-hidden />
        </span>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">BestPrice</h1>
          <p className="text-muted-foreground text-sm">Акции магазинов Латвии в одном месте</p>
        </div>
        {failed && (
          <p role="alert" className="text-destructive text-sm">
            Не удалось войти. Попробуйте ещё раз.
          </p>
        )}
        <Button onClick={signIn} size="lg" className="min-h-11 w-full">
          Войти через Google
        </Button>
        {devLogin && <PasswordForm />}
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
