import { createServerClient } from "@supabase/ssr";
import type { Database } from "@bestprice/core";
import { io } from "next/cache";
import { cookies } from "next/headers";

export async function createClient() {
  // Supabase внутри читает Date.now() (срок токена): без этого Cache Components ругается при пререндере.
  await io();
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(list) {
          try {
            list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Вызов из Server Component: куки обновит proxy.
          }
        },
      },
    },
  );
}
