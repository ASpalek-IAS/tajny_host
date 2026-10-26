"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

export type NavItem = { href: string; label: string; exact?: boolean; badge?: number };

export function NavLinks({ items, large }: { items: NavItem[]; large?: boolean }) {
  const path = usePathname();
  return (
    <nav className="space-y-0.5">
      {items.map((it) => {
        const active = it.exact ? path === it.href : path === it.href || path.startsWith(it.href + "/");
        return (
          <Link
            key={it.href}
            href={it.href}
            className={cx(
              "flex items-center justify-between gap-2 rounded-lg px-3 font-medium whitespace-nowrap",
              large ? "py-3 text-base" : "py-2 text-sm",
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
