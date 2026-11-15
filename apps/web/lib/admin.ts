import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Клиент под сессией для серверных действий админки: не админа отправляет на /grocery. RLS остаётся второй защитой.
export async function adminSupabase() {
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) redirect("/grocery");
  return supabase;
}
