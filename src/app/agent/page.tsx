import Link from "next/link";
import { Card, CardHeader, EmptyState, Notice, PageHeader, StatusBadge, cx } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { AgentOffline } from "@/components/agent-offline";
import { requireRole } from "@/lib/auth";
import { fmtDate, fmtWindow, todayISO } from "@/lib/format";
import type { InspectionStatus } from "@/lib/types";

type Row = {
  id: string;
  title: string;
  status: InspectionStatus;
  window_start: string;
  window_end: string;
  submitted_at: string | null;
  company: { name: string } | null;
  branch: { name: string; address: string | null } | null;
};

export default async function AgentHome({ searchParams }: { searchParams: Promise<{ odeslano?: string }> }) {
  const { odeslano } = await searchParams;
  const profile = await requireRole("agent");
  const db = await createClient();
  const { data } = await db
    .from("inspections")
    .select("id,title,status,window_start,window_end,submitted_at,company:companies(name),branch:branches(name,address)")
    .eq("agent_id", profile.id)
    .order("window_end");
  const rows = (data ?? []) as unknown as Row[];
  const todo = rows
    .filter((r) => ["assigned", "in_progress", "returned"].includes(r.status))
    .sort((a, b) => Number(b.status === "returned") - Number(a.status === "returned"));
  const waiting = rows.filter((r) => r.status === "submitted");
  const done = rows
    .filter((r) => r.status === "approved")
    .sort((a, b) => (b.submitted_at ?? "").localeCompare(a.submitted_at ?? ""))
    .slice(0, 20);
  const today = todayISO();

  return (
    <>
      <PageHeader title="Moje kontroly" sub={`Dobrý den, ${profile.full_name.split(" ")[0] || ""}`} />
      {odeslano && (
        <div className="mb-4">
          <Notice tone="success">Kontrola byla odeslána ke schválení. Děkujeme!</Notice>
        </div>
      )}

      <AgentOffline inspectionIds={todo.map((r) => r.id)} />

      <h2 className="mb-3 text-sm font-semibold text-ink-700">K vyplnění ({todo.length})</h2>
      {todo.length === 0 ? (
        <Card className="mb-8">
          <EmptyState title="Nemáte žádné kontroly k vyplnění">Jakmile vám správce přiřadí kontrolu, objeví se tady.</EmptyState>
        </Card>
      ) : (
        <div className="mb-8 grid gap-3 sm:grid-cols-2">
          {todo.map((r) => {
            const overdue = r.window_end < today;
            return (
              <Link
                key={r.id}
                href={`/agent/kontroly/${r.id}`}
                className={cx(
                  "block rounded-xl border bg-white p-4 shadow-xs transition hover:border-brand-500",
                  r.status === "returned" ? "border-bad/40" : "border-ink-200",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{r.company?.name}</p>
                    <p className="truncate text-sm text-ink-700">{r.branch?.name}</p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                {r.branch?.address && <p className="mt-2 truncate text-xs text-ink-500">{r.branch.address}</p>}
                <p className={cx("mt-2 text-sm", overdue ? "font-medium text-bad" : "text-ink-600")}>
                  Termín {fmtWindow(r.window_start, r.window_end)}
                  {overdue && " · po termínu"}
                </p>
              </Link>
            );
          })}
        </div>
      )}

      {waiting.length > 0 && (
        <Card className="mb-6">
          <CardHeader title={`Čeká na schválení (${waiting.length})`} />
          <List rows={waiting} />
        </Card>
      )}
      {done.length > 0 && (
        <Card>
          <CardHeader title="Schválené" />
          <List rows={done} />
        </Card>
      )}
    </>
  );
}

function List({ rows }: { rows: Row[] }) {
  return (
    <ul className="divide-y divide-ink-100">
      {rows.map((r) => (
        <li key={r.id}>
          <Link href={`/agent/kontroly/${r.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-ink-50">
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">
                {r.company?.name} – {r.branch?.name}
              </span>
              <span className="text-xs text-ink-500">Odesláno {fmtDate(r.submitted_at)}</span>
            </span>
            <StatusBadge status={r.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
