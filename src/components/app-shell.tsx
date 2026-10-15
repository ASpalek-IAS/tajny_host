import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/auth-card";
import { NavLinks, type NavItem } from "@/components/nav-links";
import { logout } from "@/app/auth/actions";
import { ROLE_LABEL, type Profile } from "@/lib/types";

export function AppShell({
  profile,
  nav,
  subtitle,
  children,
}: {
  profile: Profile;
  nav: NavItem[];
  subtitle?: string;
  children: ReactNode;
}) {
  const app = process.env.NEXT_PUBLIC_APP_NAME || "Mystery Shopping";
  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-ink-200 bg-white lg:flex">
        <div className="flex items-center gap-2.5 px-5 pt-5 pb-6">
          <Logo />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight">{app}</p>
            <p className="truncate text-xs text-ink-500">{subtitle ?? ROLE_LABEL[profile.role]}</p>
          </div>
        </div>
        <div className="flex-1 px-3">
          <NavLinks items={nav} />
        </div>
        <UserBox profile={profile} />
      </aside>

      <header className="sticky top-0 z-10 border-b border-ink-200 bg-white lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Logo className="h-6 w-6" />
            <span className="text-sm font-semibold">{app}</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/ucet" className="text-ink-600">
              Účet
            </Link>
            <form action={logout}>
              <button className="text-ink-600">Odhlásit</button>
            </form>
          </div>
        </div>
        <NavLinks items={nav} mobile />
      </header>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}

function UserBox({ profile }: { profile: Profile }) {
  return (
    <div className="border-t border-ink-100 p-3">
      <Link href="/ucet" className="block rounded-lg px-3 py-2 hover:bg-ink-50">
        <p className="truncate text-sm font-medium">{profile.full_name || profile.email}</p>
        <p className="truncate text-xs text-ink-500">{profile.email}</p>
      </Link>
      <form action={logout}>
        <button className="mt-1 w-full rounded-lg px-3 py-1.5 text-left text-sm text-ink-500 hover:bg-ink-50 hover:text-ink-800">
          Odhlásit se
        </button>
      </form>
    </div>
  );
}
