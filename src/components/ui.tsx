import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { STATUS_LABEL, type InspectionStatus } from "@/lib/types";
import { fmtScore, scoreTone } from "@/lib/format";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";
const btnBase =
  "inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 whitespace-nowrap";
const btnVariant: Record<Variant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-xs",
  secondary: "bg-white text-ink-800 border border-ink-200 hover:bg-ink-50 shadow-xs",
  ghost: "text-ink-700 hover:bg-ink-100",
  danger: "bg-white text-bad border border-ink-200 hover:bg-bad-bg shadow-xs",
};

export function btnClass(variant: Variant = "primary", size: "sm" | "md" = "md") {
  return cx(btnBase, btnVariant[variant], size === "sm" && "px-2.5 py-1.5 text-xs");
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: "sm" | "md" }) {
  return <button {...props} className={cx(btnClass(variant, size), className)} />;
}

export function LinkButton({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: "sm" | "md" }) {
  return <Link {...props} className={cx(btnClass(variant, size), className)} />;
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cx("rounded-xl border border-ink-200 bg-white shadow-xs", className)}>{children}</div>
  );
}

export function CardHeader({ title, action, sub }: { title: ReactNode; action?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 border-b border-ink-100 px-4 py-3.5 sm:px-5">
      <div className="min-w-0 flex-1 basis-48">
        <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
        {sub && <p className="mt-0.5 text-xs text-ink-500">{sub}</p>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  sub,
  actions,
  back,
}: {
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="mb-6">
      {back && (
        <Link href={back.href} className="mb-2 inline-block text-sm text-ink-500 hover:text-ink-800">
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-balance text-ink-900 sm:text-2xl">{title}</h1>
          {sub && <div className="mt-1 text-sm text-ink-500">{sub}</div>}
        </div>
        {actions && <div className="flex w-full flex-wrap gap-2 sm:w-auto">{actions}</div>}
      </div>
    </div>
  );
}

const statusTone: Record<InspectionStatus, string> = {
  planned: "bg-ink-100 text-ink-700",
  assigned: "bg-sky-50 text-sky-800",
  in_progress: "bg-indigo-50 text-indigo-800",
  submitted: "bg-mid-bg text-mid",
  returned: "bg-bad-bg text-bad",
  approved: "bg-good-bg text-good",
  cancelled: "bg-ink-100 text-ink-500 line-through",
};

export function StatusBadge({ status }: { status: InspectionStatus }) {
  return (
    <span className={cx("inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", statusTone[status])}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "brand" | "good" | "bad" | "mid" }) {
  const t = {
    neutral: "bg-ink-100 text-ink-700",
    brand: "bg-brand-50 text-brand-700",
    good: "bg-good-bg text-good",
    bad: "bg-bad-bg text-bad",
    mid: "bg-mid-bg text-mid",
  }[tone];
  return <span className={cx("inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", t)}>{children}</span>;
}

export function ScoreBadge({ score, size = "sm" }: { score: number | null | undefined; size?: "sm" | "lg" }) {
  const tone = scoreTone(score);
  const cls = {
    good: "bg-good-bg text-good",
    mid: "bg-mid-bg text-mid",
    bad: "bg-bad-bg text-bad",
    none: "bg-ink-100 text-ink-500",
  }[tone];
  return (
    <span
      className={cx(
        "tabular inline-flex items-center justify-center rounded-full font-semibold whitespace-nowrap",
        size === "lg" ? "px-3 py-1 text-lg" : "px-2 py-0.5 text-xs",
        cls,
      )}
    >
      {fmtScore(score)}
    </span>
  );
}

export function ScoreBar({ score }: { score: number | null | undefined }) {
  const tone = scoreTone(score);
  const color = { good: "bg-good", mid: "bg-mid", bad: "bg-bad", none: "bg-ink-300" }[tone];
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
      <div className={cx("h-full rounded-full", color)} style={{ width: `${Math.max(0, Math.min(100, score ?? 0))}%` }} />
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cx("block", className)}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="hint block">{hint}</span>}
    </label>
  );
}

/**
 * Tabulka. Na telefonu má minimální šířku a posouvá se do strany, aby se sloupce
 * nemačkaly (text po jednom slově na řádek). Malé tabulky (2–3 sloupce) mají `fit`.
 */
export function Table({ children, fit }: { children: ReactNode; fit?: boolean }) {
  return (
    <div className="table-scroll overflow-x-auto overscroll-x-contain">
      <table className={cx("w-full text-left text-sm", !fit && "min-w-[40rem] lg:min-w-0")}>{children}</table>
    </div>
  );
}
export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th
      className={cx(
        "border-b border-ink-100 px-3 py-2.5 text-xs font-medium tracking-wide whitespace-nowrap text-ink-500 uppercase first:pl-4 last:pr-4 sm:px-4",
        className,
      )}
    >
      {children}
    </th>
  );
}
export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <td className={cx("border-b border-ink-100 px-3 py-3 align-middle first:pl-4 last:pr-4 sm:px-4", className)}>{children}</td>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="px-6 py-12 text-center">
      <p className="text-sm font-medium text-ink-800">{title}</p>
      {children && <div className="mt-1 text-sm text-ink-500">{children}</div>}
    </div>
  );
}

export function Tabs({ tabs, active }: { tabs: { key: string; label: ReactNode; href: string }[]; active: string }) {
  return (
    <div className="no-scrollbar -mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-ink-200 px-4 sm:mx-0 sm:px-0">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={cx(
            "-mb-px border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap",
            t.key === active ? "border-brand-600 text-brand-700" : "border-transparent text-ink-500 hover:text-ink-800",
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "error" | "success"; children: ReactNode }) {
  const t = {
    info: "border-sky-200 bg-sky-50 text-sky-900",
    warn: "border-amber-200 bg-mid-bg text-mid",
    error: "border-red-200 bg-bad-bg text-bad",
    success: "border-emerald-200 bg-good-bg text-good",
  }[tone];
  return <div className={cx("rounded-lg border px-4 py-3 text-sm", t)}>{children}</div>;
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <Card className="px-5 py-4">
      <p className="text-xs font-medium text-ink-500">{label}</p>
      <p className="tabular mt-1 text-2xl font-semibold tracking-tight text-ink-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-ink-500">{sub}</p>}
    </Card>
  );
}

/** Kostra stránky během načítání – zobrazí se okamžitě po kliknutí. */
export function PageSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Načítám…">
      <div className="mb-6 space-y-2">
        <div className="h-7 w-48 rounded-md bg-ink-200/70" />
        <div className="h-4 w-64 max-w-full rounded bg-ink-100" />
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-xl border border-ink-200 bg-white" />
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border border-ink-200 bg-white">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-ink-100 px-5 py-4 last:border-0">
            <div className="h-4 flex-1 rounded bg-ink-100" />
            <div className="h-4 w-20 rounded bg-ink-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
