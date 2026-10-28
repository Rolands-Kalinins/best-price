"use client";

import { Menu } from "@base-ui/react/menu";
import { GitMerge, LogOut, ShoppingBasket, User } from "lucide-react";
import Link from "next/link";

export function SiteHeader({ email, isAdmin = false }: { email: string; isAdmin?: boolean }) {
  return (
    <header className="bg-background/90 border-b sticky top-0 z-20 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/grocery" className="flex items-center gap-2 rounded-lg font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <ShoppingBasket className="text-primary size-5" aria-hidden />
          <span translate="no">BestPrice</span>
        </Link>
        <Menu.Root>
          <Menu.Trigger
            aria-label="Меню профиля"
            className="hover:bg-muted data-[popup-open]:bg-muted focus-visible:ring-ring/50 flex size-11 items-center justify-center rounded-full outline-none focus-visible:ring-3"
          >
            <User className="size-5" aria-hidden />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner align="end" sideOffset={6} className="z-30">
              <Menu.Popup className="bg-popover text-popover-foreground w-64 origin-top-right rounded-xl border p-1 shadow-lg transition duration-150 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 motion-reduce:transition-none">
                <p className="text-muted-foreground truncate px-3 py-2 text-sm">{email}</p>
                {isAdmin && (
                  <Menu.Item
                    render={<Link href="/grocery/admin/matches" />}
                    className="data-[highlighted]:bg-muted flex min-h-11 w-full cursor-default items-center gap-2 rounded-lg px-3 text-left text-sm outline-none"
                  >
                    <GitMerge className="size-4" aria-hidden />
                    Сопоставление товаров
                  </Menu.Item>
                )}
                <form action="/auth/signout" method="post">
                  <Menu.Item
                    nativeButton
                    render={<button type="submit" />}
                    className="data-[highlighted]:bg-muted flex min-h-11 w-full cursor-default items-center gap-2 rounded-lg px-3 text-left text-sm outline-none"
                  >
                    <LogOut className="size-4" aria-hidden />
                    Выйти
                  </Menu.Item>
                </form>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </div>
    </header>
  );
}
