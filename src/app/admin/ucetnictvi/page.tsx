import Link from "next/link";
import { Card, EmptyState, PageHeader, Stat, Table, Td, Th, cx } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { addDays, fmtCZK, fmtDate, monthBounds, pragueDate, todayISO } from "@/lib/format";

type SP = { od?: string; do?: string; q?: string; skryt?: string; f?: string };

type Row = { id: string; name: string; email: string; active: boolean; visits: number; total: number; noExpense: number };

/** Návštěva = odeslaná nebo schválená kontrola s datem návštěvy v období. */
const DONE = ["submitted", "approved"];

export default async function AccountingPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const month = monthBounds(todayISO());
  const from = sp.od || month.from;
  const to = sp.do || month.to;
  const q = (sp.q ?? "").trim();
  // filtr je výchozí zapnutý; po odeslání formuláře (f=1) rozhoduje zaškrtnutí
  const hideEmpty = sp.f ? sp.skryt === "1" : true;

  const db = await createClient();
  const [{ data: agents }, { data: insp }] = await Promise.all([
    db.from("profiles").select("id,full_name,email,active").eq("role", "agent").order("full_name"),
    // o den širší rozsah kvůli časovému pásmu, přesně se filtruje níže podle pražského data
    db
      .from("inspections")
      .select("agent_id,visit_at,expense")
      .in("status", DONE)
      .not("agent_id", "is", null)
      .gte("visit_at", `${addDays(from, -1)}T00:00:00Z`)
      .lt("visit_at", `${addDays(to, 2)}T00:00:00Z`),
  ]);

  const stats = new Map<string, { visits: number; total: number; noExpense: number }>();
  for (const r of insp ?? []) {
    const d = pragueDate(r.visit_at as string);
    if (d < from || d > to) continue;
    const s = stats.get(r.agent_id as string) ?? { visits: 0, total: 0, noExpense: 0 };
    s.visits++;
    if (r.expense === null) s.noExpense++;
    else s.total += Number(r.expense);
    stats.set(r.agent_id as string, s);
  }

  const needle = q.toLocaleLowerCase("cs");
  const rows: Row[] = (agents ?? [])
    .map((a) => ({
      id: a.id as string,
      name: (a.full_name as string) || (a.email as string),
      email: a.email as string,
      active: a.active as boolean,
      ...(stats.get(a.id as string) ?? { visits: 0, total: 0, noExpense: 0 }),
    }))
    .filter((r) => !needle || `${r.name} ${r.email}`.toLocaleLowerCase("cs").includes(needle))
    .filter((r) => (hideEmpty ? r.visits > 0 : r.active || r.visits > 0))
    .sort((a, b) => a.name.localeCompare(b.name, "cs"));

  const sum = rows.reduce(
    (s, r) => ({ visits: s.visits + r.visits, total: s.total + r.total, noExpense: s.noExpense + r.noExpense }),
    { visits: 0, total: 0, noExpense: 0 },
  );

  // rychlá volba období
  const prev = monthBounds(addDays(month.from, -1));
  const link = (o: string, d: string) => {
    const p = new URLSearchParams({ od: o, do: d, f: "1" });
    if (q) p.set("q", q);
    if (hideEmpty) p.set("skryt", "1");
    return `/admin/ucetnictvi?${p}`;
  };
  const presets = [
    { label: "Tento měsíc", ...month },
    { label: "Minulý měsíc", ...prev },
    { label: "Letos", from: `${month.from.slice(0, 4)}-01-01`, to: `${month.from.slice(0, 4)}-12-31` },
  ];

  return (
    <>
      <PageHeader
        title="Účetnictví"
        sub="Počet návštěv a útrata agentů za období. Počítají se odeslané a schválené kontroly podle data návštěvy."
      />

      <form action="/admin/ucetnictvi" className="mb-6 space-y-3">
        <input type="hidden" name="f" value="1" />
        <div className="flex flex-wrap items-end gap-3">
          <label>
            <span className="label">Od</span>
            <input type="date" name="od" defaultValue={from} className="input" />
          </label>
          <label>
            <span className="label">Do</span>
            <input type="date" name="do" defaultValue={to} className="input" />
          </label>
          <label className="min-w-56 flex-1 sm:max-w-xs">
            <span className="label">Hledat agenta</span>
            <input type="search" name="q" defaultValue={q} placeholder="Jméno nebo e-mail" className="input" />
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm text-ink-700">
            <input type="checkbox" name="skryt" value="1" defaultChecked={hideEmpty} className="h-4 w-4 accent-brand-600" />
            Skrýt agenty bez kontroly v období
          </label>
          <button className="rounded-lg bg-ink-800 px-3.5 py-2 text-sm font-medium text-white">Filtrovat</button>
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs">
          {presets.map((p) => {
            const on = p.from === from && p.to === to;
            return (
              <Link
                key={p.label}
                href={link(p.from, p.to)}
                className={cx(
                  "rounded-full border px-2.5 py-1",
                  on ? "border-brand-500 bg-brand-50 text-brand-700" : "border-ink-200 text-ink-600 hover:border-ink-300",
                )}
              >
                {p.label}
              </Link>
            );
          })}
        </div>
      </form>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Období" value={<span className="text-lg">{`${fmtDate(from)} – ${fmtDate(to)}`}</span>} />
        <Stat label="Návštěv celkem" value={sum.visits} sub={agentsLabel(rows.filter((r) => r.visits > 0).length)} />
        <Stat
          label="Útrata celkem"
          value={fmtCZK(sum.total)}
          sub={sum.noExpense ? `${sum.noExpense} ${sum.noExpense === 1 ? "návštěva" : sum.noExpense < 5 ? "návštěvy" : "návštěv"} bez vyplněné útraty` : undefined}
        />
      </div>

      <Card>
        {rows.length === 0 ? (
          <EmptyState title={q ? "Žádný agent neodpovídá hledání" : "V tomto období neudělal žádný agent kontrolu"}>
            {hideEmpty && "Zkuste vypnout filtr „Skrýt agenty bez kontroly v období“ nebo změnit období."}
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Agent</Th>
                <Th className="text-right">Počet návštěv</Th>
                <Th className="text-right">Útrata celkem</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.visits === 0 ? "text-ink-400" : undefined}>
                  <Td>
                    <Link href={`/admin/kontroly?agent=${r.id}`} className="font-medium text-ink-900 hover:text-brand-700 hover:underline">
                      {r.name}
                    </Link>
                    {!r.active && <span className="ml-2 text-xs text-ink-400">(neaktivní)</span>}
                    <span className="block text-xs text-ink-500">{r.email}</span>
                  </Td>
                  <Td className="tabular text-right">{r.visits}</Td>
                  <Td className="tabular text-right">
                    <span className={r.visits ? "font-medium text-ink-900" : undefined}>{r.visits ? fmtCZK(r.total) : "—"}</span>
                    {r.noExpense > 0 && (
                      <span className="block text-xs text-mid">
                        {r.noExpense}× bez vyplněné útraty
                      </span>
                    )}
                  </Td>
                </tr>
              ))}
              <tr className="bg-ink-50">
                <Td className="font-semibold">Celkem</Td>
                <Td className="tabular text-right font-semibold">{sum.visits}</Td>
                <Td className="tabular text-right font-semibold">{fmtCZK(sum.total)}</Td>
              </tr>
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}

function agentsLabel(n: number) {
  return `${n} ${n === 1 ? "agent" : n >= 2 && n <= 4 ? "agenti" : "agentů"}`;
}
