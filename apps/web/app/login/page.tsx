"use client";

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
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-4">
      <h1 className="text-2xl font-semibold">BestPrice</h1>
      <p className="text-muted-foreground text-center text-sm">
        Акции магазинов Латвии в одном месте
      </p>
      {failed && <p className="text-destructive text-sm">Не удалось войти, попробуйте ещё раз.</p>}
      <Button onClick={signIn}>Войти через Google</Button>
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
