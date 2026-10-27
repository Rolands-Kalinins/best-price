"use client";

import { ShoppingBasket } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

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
