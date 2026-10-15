import type { ReactNode } from "react";

export function AuthCard({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  const app = process.env.NEXT_PUBLIC_APP_NAME || "Mystery Shopping";
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2.5">
          <Logo />
          <span className="text-sm font-semibold tracking-tight text-ink-800">{app}</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {sub && <p className="mt-1.5 text-sm text-ink-500">{sub}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}

export function Logo({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="var(--color-brand-600)" />
      <circle cx="14" cy="14" r="6.5" fill="none" stroke="white" strokeWidth="2.5" />
      <path d="M19 19l5.5 5.5" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M11.2 14.2l2 2 3.6-4" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
