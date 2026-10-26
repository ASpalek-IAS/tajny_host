"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/auth-card";
import { NavLinks, type NavItem } from "@/components/nav-links";
import { LogoutButton } from "@/components/logout-button";
import { cx } from "@/components/ui";

/** Hlavička na telefonu: název aktuální sekce a rozbalovací menu. */
export function MobileNav({ app, items, user }: { app: string; items: NavItem[]; user: { name: string; email: string } }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  // po přechodu na jinou stránku menu zavřít
  useEffect(() => setOpen(false), [path]); // eslint-disable-line react-hooks/set-state-in-effect
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const badge = items.reduce((s, i) => s + (i.badge ?? 0), 0);
  const current = items.find((it) => (it.exact ? path === it.href : path === it.href || path.startsWith(it.href + "/")));

  // bez backdrop-blur: rozmazání by z hlavičky udělalo rámec pro fixed menu a ztmavení by nepřekrylo stránku
  return (
    <header className="pt-safe sticky top-0 z-30 border-b border-ink-200 bg-white lg:hidden">
      <div className="flex h-14 items-center justify-between gap-3 px-4">
        <Link href={items[0]?.href ?? "/"} className="flex min-w-0 items-center gap-2.5">
          <Logo className="h-7 w-7 shrink-0" />
          <span className="min-w-0">
            <span className="block truncate text-sm leading-tight font-semibold">{current?.label ?? app}</span>
            {current && <span className="block truncate text-[11px] leading-tight text-ink-500">{app}</span>}
          </span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? "Zavřít menu" : "Otevřít menu"}
          className="relative -mr-2 flex h-10 w-10 items-center justify-center rounded-lg text-ink-700 active:bg-ink-100"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
          {!open && badge > 0 && (
            <span className="tabular absolute top-1 right-1 min-w-4 rounded-full bg-mid px-1 text-center text-[10px] leading-4 font-semibold text-white">
              {badge}
            </span>
          )}
        </button>
      </div>

      <div
        className={cx("fixed inset-x-0 top-[calc(3.5rem+env(safe-area-inset-top))] bottom-0 z-30", open ? "" : "pointer-events-none")}
        aria-hidden={!open}
      >
        <div
          className={cx("absolute inset-0 bg-ink-900/30 transition-opacity", open ? "opacity-100" : "opacity-0")}
          onClick={() => setOpen(false)}
        />
        <div
          className={cx(
            "pb-safe relative border-b border-ink-200 bg-white shadow-lg transition-all duration-150",
            open ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0",
          )}
        >
          <div className="max-h-[70vh] overflow-y-auto p-3">
            <NavLinks items={items} large />
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-ink-100 px-4 py-3">
            <Link href="/ucet" className="min-w-0">
              <span className="block truncate text-sm font-medium">{user.name}</span>
              <span className="block truncate text-xs text-ink-500">{user.email}</span>
            </Link>
            <LogoutButton className="rounded-lg border border-ink-200 px-3 py-2 text-sm font-medium text-ink-700" label="Odhlásit" />
          </div>
        </div>
      </div>
    </header>
  );
}
