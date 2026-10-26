import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/auth-card";
import { NavLinks, type NavItem } from "@/components/nav-links";
import { MobileNav } from "@/components/mobile-nav";
import { LogoutButton } from "@/components/logout-button";
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

      <MobileNav app={app} items={nav} user={{ name: profile.full_name || profile.email, email: profile.email }} />

      <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:px-10 lg:py-8">
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
      <LogoutButton
        className="mt-1 w-full rounded-lg px-3 py-1.5 text-left text-sm text-ink-500 hover:bg-ink-50 hover:text-ink-800"
        label="Odhlásit se"
      />
    </div>
  );
}
