"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

export type NavItem = { href: string; label: string; exact?: boolean; badge?: number };

export function NavLinks({ items, mobile }: { items: NavItem[]; mobile?: boolean }) {
  const path = usePathname();
  return (
    <nav className={mobile ? "flex gap-1 overflow-x-auto px-3 pb-2" : "space-y-0.5"}>
      {items.map((it) => {
        const active = it.exact ? path === it.href : path === it.href || path.startsWith(it.href + "/");
        return (
          <Link
            key={it.href}
            href={it.href}
            className={cx(
              "flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap",
              active ? "bg-brand-50 text-brand-800" : "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
            )}
          >
            {it.label}
            {!!it.badge && (
              <span className="tabular rounded-full bg-mid-bg px-1.5 text-xs font-semibold text-mid">{it.badge}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
