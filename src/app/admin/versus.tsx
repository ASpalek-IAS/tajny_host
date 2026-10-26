import { Card, CardHeader, EmptyState, ScoreBadge, Table, Td, Th, cx } from "@/components/ui";
import { VersusTrend } from "@/components/charts";
import { VERSUS_COLORS } from "@/lib/palette";
import { createClient } from "@/lib/supabase/server";
import { loadReportRows, rowDate, type ReportRow } from "@/lib/reports";
import { addDays, fmtDate, fmtScore, scoreTone, todayISO } from "@/lib/format";

export type VersusParams = { a?: string; b?: string; c?: string; od?: string; do?: string };

type Entity = { key: string; label: string; sub: string; rows: ReportRow[] };

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null);
const scores = (rows: ReportRow[]) => rows.map((r) => r.score).filter((s): s is number => s !== null).map(Number);

function topicAvg(rows: ReportRow[], title: string) {
  return avg(
    rows.flatMap((r) => (r.topic_scores ?? []).filter((t) => t.title === title && t.score !== null).map((t) => Number(t.score))),
  );
}

const SLOT = ["A", "B", "C"] as const;

export async function Versus({ sp }: { sp: VersusParams }) {
  const db = await createClient();
  const from = sp.od ?? addDays(todayISO(), -365);
  const to = sp.do;

  const { data: companies } = await db
    .from("companies")
    .select("id,name,branches(id,name)")
    .order("name");
  const firms = (companies ?? []) as { id: string; name: string; branches: { id: string; name: string }[] }[];
  for (const f of firms) f.branches.sort((x, y) => x.name.localeCompare(y.name, "cs"));

  const all = await loadReportRows(db, false, { from, to });

  // Výchozí výběr: dvě provozovny s nejvíce schválenými kontrolami
  let picks = [sp.a, sp.b, sp.c].filter((x): x is string => !!x);
  if (!sp.a && !sp.b && !sp.c) {
    const count = new Map<string, number>();
    for (const r of all) count.set(r.branch_id, (count.get(r.branch_id) ?? 0) + 1);
    picks = [...count.entries()]
      .sort((x, y) => y[1] - x[1])
      .slice(0, 2)
      .map(([id]) => `b:${id}`);
  }

  const entities: Entity[] = [];
  for (const p of picks) {
    const [kind, id] = p.split(":");
    if (kind === "c") {
      const f = firms.find((x) => x.id === id);
      if (!f) continue;
      entities.push({ key: p, label: f.name, sub: `všechny provozovny (${f.branches.length})`, rows: all.filter((r) => r.company_id === id) });
    } else {
      const f = firms.find((x) => x.branches.some((b) => b.id === id));
      const b = f?.branches.find((x) => x.id === id);
      if (!f || !b) continue;
      entities.push({ key: p, label: b.name, sub: f.name, rows: all.filter((r) => r.branch_id === id) });
    }
  }

  // Bodovaná témata, která má alespoň jeden soupeř
  const topicOrder: string[] = [];
  for (const e of entities)
    for (const r of e.rows)
      for (const t of r.topic_scores ?? [])
        if (t.score !== null && Number(t.weight) > 0 && !topicOrder.includes(t.title)) topicOrder.push(t.title);

  // Vývoj po měsících
  const months = [...new Set(entities.flatMap((e) => e.rows.map((r) => rowDate(r).slice(0, 7))))].sort();
  const trend = months.map((m) => {
    const point: Record<string, string | number | null> = { month: m };
    entities.forEach((e, i) => {
      point[`s${i}`] = avg(scores(e.rows.filter((r) => rowDate(r).startsWith(m))));
    });
    return point;
  });

  const summary = entities.map((e) => {
    const sc = scores(e.rows);
    const last = [...e.rows].sort((x, y) => rowDate(y).localeCompare(rowDate(x)))[0];
    return { avg: avg(sc), count: e.rows.length, min: sc.length ? Math.min(...sc) : null, max: sc.length ? Math.max(...sc) : null, last };
  });
  const best = Math.max(...summary.map((s) => s.avg ?? -1));

  return (
    <>
      <form action="/admin" className="mb-6 space-y-3">
        <input type="hidden" name="tab" value="versus" />
        <div className="grid gap-3 md:grid-cols-3">
          {SLOT.map((slot, i) => (
            <label key={slot} className="block">
              <span className="label flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: VERSUS_COLORS[i] }} />
                Soupeř {slot}
              </span>
              <select name={slot.toLowerCase()} defaultValue={picks[i] ?? ""} className="input">
                <option value="">— nevybráno —</option>
                {firms.map((f) => (
                  <optgroup key={f.id} label={f.name}>
                    <option value={`c:${f.id}`}>{f.name} – celá firma</option>
                    {f.branches.map((b) => (
                      <option key={b.id} value={`b:${b.id}`}>
                        {b.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
          ))}
        </div>
        <div className="filters">
          <label>
            <span className="label">Od</span>
            <input type="date" name="od" defaultValue={from} className="input" />
          </label>
          <label>
            <span className="label">Do</span>
            <input type="date" name="do" defaultValue={to ?? ""} className="input" />
          </label>
          <button className="rounded-lg bg-ink-800 px-3.5 py-2 text-sm font-medium text-white">Porovnat</button>
        </div>
      </form>

      {entities.length < 2 ? (
        <Card>
          <EmptyState title="Vyberte alespoň dva soupeře">
            Porovnat můžete celé firmy, jednotlivé provozovny, nebo obojí dohromady.
          </EmptyState>
        </Card>
      ) : (
        <div className="space-y-6">
          <div className={cx("grid gap-3", entities.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2")}>
            {entities.map((e, i) => {
              const s = summary[i];
              const win = s.avg !== null && s.avg === best && entities.length > 1;
              return (
                <Card key={e.key} className="relative overflow-hidden p-5">
                  <span className="absolute inset-x-0 top-0 h-1" style={{ background: VERSUS_COLORS[i] }} />
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-ink-500">Soupeř {SLOT[i]}</p>
                      <p className="truncate font-semibold text-ink-900">{e.label}</p>
                      <p className="truncate text-xs text-ink-500">{e.sub}</p>
                    </div>
                    {win && <span className="rounded-full bg-good-bg px-2 py-0.5 text-xs font-semibold text-good">Vede</span>}
                  </div>
                  <p
                    className={cx(
                      "tabular mt-4 text-4xl font-semibold tracking-tight",
                      { good: "text-good", mid: "text-mid", bad: "text-bad", none: "text-ink-400" }[scoreTone(s.avg)],
                    )}
                  >
                    {fmtScore(s.avg)}
                  </p>
                  <p className="mt-1 text-xs text-ink-500">průměrné skóre</p>
                  <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-ink-100 pt-3 text-sm">
                    <div>
                      <dt className="text-xs text-ink-500">Kontrol</dt>
                      <dd className="tabular font-medium">{s.count}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-500">Rozpětí</dt>
                      <dd className="tabular font-medium">
                        {s.min === null ? "—" : `${Math.round(s.min)}–${Math.round(s.max!)} %`}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-500">Poslední</dt>
                      <dd className="tabular font-medium">{s.last ? fmtDate(rowDate(s.last)) : "—"}</dd>
                    </div>
                  </dl>
                </Card>
              );
            })}
          </div>

          <Card>
            <CardHeader title="Srovnání po tématech" sub="Průměr schválených kontrol za období. Zvýrazněn je nejlepší výsledek v každém tématu." />
            {topicOrder.length === 0 ? (
              <EmptyState title="Žádná data" />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Téma</Th>
                    {entities.map((e, i) => (
                      <Th key={e.key} className="text-right normal-case">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full" style={{ background: VERSUS_COLORS[i] }} />
                          {e.label}
                        </span>
                      </Th>
                    ))}
                    {entities.length === 2 && <Th className="text-right">Rozdíl A − B</Th>}
                  </tr>
                </thead>
                <tbody>
                  {topicOrder.map((t) => {
                    const vals = entities.map((e) => topicAvg(e.rows, t));
                    const top = Math.max(...vals.map((v) => v ?? -1));
                    const diff = vals[0] !== null && vals[1] !== null ? Math.round((vals[0]! - vals[1]!) * 10) / 10 : null;
                    return (
                      <tr key={t}>
                        <Td className="font-medium">{t}</Td>
                        {vals.map((v, i) => (
                          <Td key={i} className="text-right">
                            <div className="flex items-center justify-end gap-3">
                              <div className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-ink-100 sm:block">
                                <div className="h-full rounded-full" style={{ width: `${v ?? 0}%`, background: VERSUS_COLORS[i] }} />
                              </div>
                              <span className={cx("tabular w-14", v !== null && v === top && vals.filter((x) => x === top).length === 1 ? "font-semibold text-ink-900" : "text-ink-600")}>
                                {v === null ? "—" : `${v.toLocaleString("cs-CZ")} %`}
                              </span>
                            </div>
                          </Td>
                        ))}
                        {entities.length === 2 && (
                          <Td className={cx("tabular text-right", diff === null ? "text-ink-400" : diff > 0 ? "text-good" : diff < 0 ? "text-bad" : "text-ink-600")}>
                            {diff === null ? "—" : `${diff > 0 ? "+" : ""}${diff.toLocaleString("cs-CZ")} b.`}
                          </Td>
                        )}
                      </tr>
                    );
                  })}
                  <tr className="bg-ink-50">
                    <Td className="font-semibold">Celkem</Td>
                    {summary.map((s, i) => (
                      <Td key={i} className="text-right">
                        <ScoreBadge score={s.avg} />
                      </Td>
                    ))}
                    {entities.length === 2 && (
                      <Td className="tabular text-right font-semibold">
                        {summary[0].avg !== null && summary[1].avg !== null
                          ? `${summary[0].avg - summary[1].avg > 0 ? "+" : ""}${(Math.round((summary[0].avg - summary[1].avg) * 10) / 10).toLocaleString("cs-CZ")} b.`
                          : "—"}
                      </Td>
                    )}
                  </tr>
                </tbody>
              </Table>
            )}
          </Card>

          <Card>
            <CardHeader title="Vývoj skóre po měsících" />
            <VersusTrend data={trend} series={entities.map((e, i) => ({ key: `s${i}`, label: e.label }))} />
          </Card>
        </div>
      )}
    </>
  );
}
