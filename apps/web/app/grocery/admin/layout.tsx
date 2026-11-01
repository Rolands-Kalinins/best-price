import { redirect } from "next/navigation";
import { AdminNav } from "@/components/admin-nav";
import { SiteHeader } from "@/components/site-header";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

// Общий каркас админки: шапка, боковое меню и страница справа. Вход и роль проверяются здесь, каждая страница проверяет их ещё раз сама.
export default async function AdminLayout({ children }: LayoutProps<"/grocery/admin">) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) redirect("/grocery");

  return (
    <>
      <SiteHeader email={auth.user.email ?? ""} isAdmin />
      <div className="mx-auto flex w-full max-w-[90rem] flex-1 flex-col md:flex-row">
        <AdminNav />
        <main id="main" className="min-w-0 flex-1">{children}</main>
      </div>
    </>
  );
}
