import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TopicScore } from "@/lib/types";

export type ReportRow = {
  id: string;
  company_id: string;
  company_name?: string;
  branch_id: string;
  branch_name: string;
  template_id: string | null;
  title: string;
  window_start: string;
  visit_at: string | null;
  approved_at: string | null;
  score: number | null;
  topic_scores: TopicScore[] | null;
};

export type ReportFilters = {
  company?: string;
  branch?: string;
  template?: string;
  from?: string;
  to?: string;
};

/** Datum, ke kterému se kontrola počítá (návštěva, jinak začátek termínu). */
export function rowDate(r: ReportRow) {
  return (r.visit_at ?? r.window_start).slice(0, 10);
}

/**
 * Omezí dotaz na období už v databázi (rychlost, limit 1000 řádků).
 * Datum kontroly = návštěva, jinak začátek termínu. Hranice jsou o den volnější
 * kvůli časovým pásmům – přesně se filtruje v loadReportRows.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function periodFilter<Q extends { or: (f: string) => any }>(q: Q, f: ReportFilters): Q {
  const shift = (d: string, n: number) => {
    const x = new Date(d + "T12:00:00Z");
    x.setUTCDate(x.getUTCDate() + n);
    return x.toISOString().slice(0, 10);
  };
  let r = q;
  if (f.from) {
    const d = shift(f.from, -1);
    r = r.or(`visit_at.gte.${d},and(visit_at.is.null,window_start.gte.${d})`);
  }
  if (f.to) {
    const d = shift(f.to, 2);
    r = r.or(`visit_at.lt.${d},and(visit_at.is.null,window_start.lt.${d})`);
  }
  return r;
}

export async function loadReportRows(
  db: SupabaseClient,
  asClient: boolean,
  f: ReportFilters,
): Promise<ReportRow[]> {
  let rows: ReportRow[];
  if (asClient) {
    let q = db
      .from("client_inspections")
      .select("id,company_id,branch_id,branch_name,template_id,title,window_start,visit_at,approved_at,score,topic_scores")
      .eq("status", "done");
    if (f.branch) q = q.eq("branch_id", f.branch);
    const { data } = await periodFilter(q, f).order("window_start");
    rows = (data ?? []) as ReportRow[];
  } else {
    let q = db
      .from("inspections")
      .select(
        "id,company_id,branch_id,template_id,title,window_start,visit_at,approved_at,score,topic_scores,branch:branches(name),company:companies(name)",
      )
      .eq("status", "approved");
    if (f.company) q = q.eq("company_id", f.company);
    if (f.branch) q = q.eq("branch_id", f.branch);
    if (f.template) q = q.eq("template_id", f.template);
    const { data } = await periodFilter(q, f).order("window_start");
    rows = (data ?? []).map((r) => {
      const x = r as unknown as ReportRow & { branch: { name: string }; company: { name: string } };
      return { ...x, branch_name: x.branch?.name, company_name: x.company?.name };
    });
  }
  return rows.filter((r) => {
    const d = rowDate(r);
    if (f.from && d < f.from) return false;
    if (f.to && d > f.to) return false;
    if (f.template && r.template_id !== f.template) return false;
    return true;
  });
}

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

export function summary(rows: ReportRow[]) {
  const scores = rows.map((r) => r.score).filter((s): s is number => s !== null).map(Number);
  return { count: rows.length, avg: avg(scores), min: scores.length ? Math.min(...scores) : null, max: scores.length ? Math.max(...scores) : null };
}

/** Průměr celkem a po tématech za každý měsíc. */
export function monthlyTrend(rows: ReportRow[]) {
  const months = new Map<string, ReportRow[]>();
  for (const r of rows) {
    const m = rowDate(r).slice(0, 7);
    months.set(m, [...(months.get(m) ?? []), r]);
  }
  const topicTitles = topicList(rows);
  return [...months.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, rs]) => {
      const point: Record<string, number | string | null> = {
        month,
        Celkem: avg(rs.map((r) => r.score).filter((s): s is number => s !== null).map(Number)),
        count: rs.length,
      };
      for (const t of topicTitles) {
        point[t] = avg(
          rs.flatMap((r) => (r.topic_scores ?? []).filter((x) => x.title === t && x.score !== null).map((x) => Number(x.score))),
        );
      }
      return point;
    });
}

export function topicList(rows: ReportRow[]) {
  const seen = new Map<string, number>();
  for (const r of rows) for (const t of r.topic_scores ?? []) seen.set(t.title, (seen.get(t.title) ?? 0) + 1);
  return [...seen.keys()];
}

export function topicAverages(rows: ReportRow[]) {
  return topicList(rows)
    .map((t) => ({
      title: t,
      score: avg(rows.flatMap((r) => (r.topic_scores ?? []).filter((x) => x.title === t && x.score !== null).map((x) => Number(x.score)))),
    }))
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
}

/** Žebříček provozoven + matice téma × provozovna. */
export function branchRanking(rows: ReportRow[]) {
  const by = new Map<string, ReportRow[]>();
  for (const r of rows) by.set(r.branch_id, [...(by.get(r.branch_id) ?? []), r]);
  const topics = topicList(rows);
  return [...by.entries()]
    .map(([branchId, rs]) => {
      const sorted = [...rs].sort((a, b) => rowDate(a).localeCompare(rowDate(b)));
      const last = sorted.at(-1);
      const prev = sorted.at(-2);
      return {
        branchId,
        name: rs[0].branch_name,
        company: rs[0].company_name,
        count: rs.length,
        avg: avg(rs.map((r) => r.score).filter((s): s is number => s !== null).map(Number)),
        last: last?.score ?? null,
        change: last?.score !== null && last?.score !== undefined && prev?.score !== null && prev?.score !== undefined ? Math.round((Number(last.score) - Number(prev.score)) * 10) / 10 : null,
        topics: Object.fromEntries(
          topics.map((t) => [
            t,
            avg(rs.flatMap((r) => (r.topic_scores ?? []).filter((x) => x.title === t && x.score !== null).map((x) => Number(x.score)))),
          ]),
        ),
      };
    })
    .sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1));
}

export type WeakPoint = { text: string; topic: string; total: number; negative: number; share: number };

/** Otázky s nejčastější zápornou (nulovou) odpovědí – spočítá databáze (funkce weak_points). */
export async function weakPoints(db: SupabaseClient, inspectionIds: string[], limit = 10): Promise<WeakPoint[]> {
  if (inspectionIds.length === 0) return [];
  const { data, error } = await db.rpc("weak_points", { p_ids: inspectionIds, p_limit: limit });
  if (error) {
    console.error("Slabá místa se nepodařilo spočítat:", error.message);
    return [];
  }
  return ((data ?? []) as { text: string; topic: string; total: number; negative: number }[]).map((w) => ({
    ...w,
    share: Math.round((w.negative / w.total) * 100),
  }));
}

/** Nejčastěji použitý dotazník v datech (výchozí pro grafy vývoje). */
export function templateOptions(rows: ReportRow[], names: Map<string, string>) {
  const count = new Map<string, number>();
  for (const r of rows) if (r.template_id) count.set(r.template_id, (count.get(r.template_id) ?? 0) + 1);
  return [...count.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => ({ id, name: names.get(id) ?? "Dotazník", count: n }));
}
