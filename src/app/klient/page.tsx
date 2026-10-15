import Link from "next/link";
import { Card, CardHeader, EmptyState, PageHeader, ScoreBadge, Stat } from "@/components/ui";
import { TrendChart } from "@/components/charts";
import { ReportFilters, TopicAverages, WeakPointsCard, type FilterValues } from "@/components/report-blocks";
import { clientScope } from "@/lib/client-scope";
import { loadReportRows, monthlyTrend, rowDate, summary, templateOptions, topicAverages, topicList, weakPoints } from "@/lib/reports";
import { fmtDate, fmtScore, fmtWindow } from "@/lib/format";

export default async function ClientHome({ searchParams }: { searchParams: Promise<FilterValues> }) {
  const sp = await searchParams;
  const { db, branches, templateNames, values, filters } = await clientScope(sp);
  const allRows = await loadReportRows(db, true, { ...filters, template: undefined });
  const templates = templateOptions(allRows, templateNames);
  // vývoj v čase porovnáváme v rámci jednoho dotazníku
  if (!filters.template && templates.length > 1) filters.template = templates[0].id;
  const rows = filters.template ? allRows.filter((r) => r.template_id === filters.template) : allRows;
  const sum = summary(rows);
  const weak = await weakPoints(db, rows.map((r) => r.id));
  const { data: planned } = await db
    .from("client_inspections")
    .select("id,branch_name,title,window_start,window_end")
    .eq("status", "planned")
    .order("window_start")
    .limit(8);
  const latest = [...rows].sort((a, b) => rowDate(b).localeCompare(rowDate(a))).slice(0, 6);

  return (
    <>
      <PageHeader title="Přehled" sub="Výsledky schválených kontrol" />
      <ReportFilters action="/klient" values={{ ...values, dotaznik: filters.template }} branches={branches} templates={templates} />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Kontrol v období" value={sum.count} />
        <Stat label="Průměrné skóre" value={fmtScore(sum.avg)} />
        <Stat label="Nejlepší" value={fmtScore(sum.max)} />
        <Stat label="Nejslabší" value={fmtScore(sum.min)} />
      </div>

      <Card className="mb-6">
        <CardHeader
          title="Vývoj skóre po měsících"
          sub={templates.length > 1 ? `Dotazník: ${templateNames.get(filters.template!) ?? ""}` : undefined}
        />
        <TrendChart data={monthlyTrend(rows)} topics={topicList(rows)} />
      </Card>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <TopicAverages topics={topicAverages(rows)} />
        <WeakPointsCard weak={weak} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Poslední výsledky" action={<Link href="/klient/kontroly" className="text-sm text-brand-700">Vše →</Link>} />
          {latest.length === 0 ? (
            <EmptyState title="Zatím žádné výsledky" />
          ) : (
            <ul className="divide-y divide-ink-100">
              {latest.map((r) => (
                <li key={r.id}>
                  <Link href={`/klient/kontroly/${r.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-ink-50">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{r.branch_name}</span>
                      <span className="text-xs text-ink-500">{fmtDate(rowDate(r))}</span>
                    </span>
                    <ScoreBadge score={r.score} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Naplánované kontroly" />
          {(planned ?? []).length === 0 ? (
            <EmptyState title="Žádné naplánované kontroly" />
          ) : (
            <ul className="divide-y divide-ink-100">
              {(planned ?? []).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <span className="truncate font-medium">{p.branch_name}</span>
                  <span className="whitespace-nowrap text-ink-500">{fmtWindow(p.window_start, p.window_end)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
