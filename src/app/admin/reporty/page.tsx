import { Card, CardHeader, EmptyState, LinkButton, PageHeader, ScoreBadge, Stat, Table, Tabs, Td, Th } from "@/components/ui";
import { BranchBars, TrendChart } from "@/components/charts";
import { RankingTable, ReportFilters, TopicAverages, WeakPointsCard, type FilterValues } from "@/components/report-blocks";
import { createClient } from "@/lib/supabase/server";
import { branchRanking, loadReportRows, monthlyTrend, summary, templateOptions, topicAverages, topicList, weakPoints } from "@/lib/reports";
import { addDays, fmtScore, todayISO } from "@/lib/format";

type SP = FilterValues & { tab?: string };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const tab = sp.tab ?? "prehled";
  const db = await createClient();
  const values: FilterValues = { ...sp, od: sp.od ?? addDays(todayISO(), -365) };

  const [{ data: companies }, { data: branches }, { data: templates }] = await Promise.all([
    db.from("companies").select("id,name").order("name"),
    sp.firma ? db.from("branches").select("id,name").eq("company_id", sp.firma).order("name") : Promise.resolve({ data: [] }),
    db.from("templates").select("id,name,company:companies(name)"),
  ]);
  const templateNames = new Map(
    ((templates ?? []) as unknown as { id: string; name: string; company: { name: string } }[]).map((t) => [
      t.id,
      sp.firma ? t.name : `${t.company?.name} – ${t.name}`,
    ]),
  );

  const filters = { company: sp.firma, branch: sp.provozovna, from: values.od, to: values.do };
  const allRows = await loadReportRows(db, false, filters);
  const tOptions = templateOptions(allRows, templateNames);
  const rows = sp.dotaznik ? allRows.filter((r) => r.template_id === sp.dotaznik) : allRows;
  const qs = new URLSearchParams(
    Object.entries({ firma: sp.firma, provozovna: sp.provozovna, dotaznik: sp.dotaznik, od: values.od, do: sp.do }).filter(
      ([, v]) => v,
    ) as [string, string][],
  ).toString();

  return (
    <>
      <PageHeader
        title="Reporty"
        actions={
          <LinkButton variant="secondary" href={`/api/export?${qs}`} prefetch={false}>
            Export do Excelu
          </LinkButton>
        }
      />
      <Tabs
        active={tab}
        tabs={[
          { key: "prehled", label: "Přehled", href: `/admin/reporty?${qs}&tab=prehled` },
          { key: "provozovny", label: "Srovnání provozoven", href: `/admin/reporty?${qs}&tab=provozovny` },
          { key: "agenti", label: "Agenti", href: `/admin/reporty?${qs}&tab=agenti` },
        ]}
      />
      <ReportFilters
        action="/admin/reporty"
        values={values}
        companies={companies ?? []}
        branches={sp.firma ? (branches ?? []) : undefined}
        templates={tOptions}
        extra={<input type="hidden" name="tab" value={tab} />}
      />

      {tab === "prehled" && <Overview rows={rows} mixed={!sp.dotaznik && tOptions.length > 1} />}
      {tab === "provozovny" && <Branches rows={rows} showCompany={!sp.firma} />}
      {tab === "agenti" && <Agents from={values.od!} to={sp.do} company={sp.firma} />}
    </>
  );

  async function Overview({ rows, mixed }: { rows: typeof allRows; mixed: boolean }) {
    const sum = summary(rows);
    const weak = await weakPoints(db, rows.map((r) => r.id));
    return (
      <>
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Schválených kontrol" value={sum.count} />
          <Stat label="Průměrné skóre" value={fmtScore(sum.avg)} />
          <Stat label="Nejlepší" value={fmtScore(sum.max)} />
          <Stat label="Nejslabší" value={fmtScore(sum.min)} />
        </div>
        <Card className="mb-6">
          <CardHeader
            title="Vývoj skóre po měsících"
            sub={mixed ? "Data obsahují více dotazníků – pro srovnání témat vyberte jeden dotazník." : undefined}
          />
          <TrendChart data={monthlyTrend(rows)} topics={mixed ? [] : topicList(rows)} />
        </Card>
        <div className="grid gap-6 lg:grid-cols-2">
          <TopicAverages topics={topicAverages(rows)} />
          <WeakPointsCard weak={weak} />
        </div>
      </>
    );
  }

  function Branches({ rows, showCompany }: { rows: typeof allRows; showCompany: boolean }) {
    const ranking = branchRanking(rows);
    return (
      <>
        <Card className="mb-6">
          <CardHeader title="Průměrné skóre provozoven" />
          <BranchBars data={ranking.map((r) => ({ name: showCompany ? `${r.company} – ${r.name}` : r.name, avg: r.avg, count: r.count }))} />
        </Card>
        <Card>
          <CardHeader title="Provozovny podle témat" />
          <RankingTable rows={ranking} topics={sp.dotaznik || tOptions.length <= 1 ? topicList(rows) : []} showCompany={showCompany} />
        </Card>
      </>
    );
  }

  async function Agents({ from, to, company }: { from: string; to?: string; company?: string }) {
    let q = db
      .from("inspections")
      .select("id,status,window_end,submitted_at,score,agent:profiles!inspections_agent_id_fkey(id,full_name)")
      .not("agent_id", "is", null)
      .neq("status", "cancelled")
      .gte("window_start", from);
    if (to) q = q.lte("window_start", to);
    if (company) q = q.eq("company_id", company);
    const { data } = await q;
    const list = (data ?? []) as unknown as {
      id: string;
      status: string;
      window_end: string;
      submitted_at: string | null;
      score: number | null;
      agent: { id: string; full_name: string };
    }[];
    const { data: returns } = list.length
      ? await db.from("audit_log").select("inspection_id").eq("action", "returned").in("inspection_id", list.map((l) => l.id).slice(0, 1000))
      : { data: [] };
    const returnCount = new Map<string, number>();
    for (const r of returns ?? []) returnCount.set(r.inspection_id, (returnCount.get(r.inspection_id) ?? 0) + 1);
    const today = todayISO();
    const by = new Map<string, { name: string; total: number; submitted: number; onTime: number; overdue: number; returns: number; scores: number[] }>();
    for (const l of list) {
      const s = by.get(l.agent.id) ?? { name: l.agent.full_name, total: 0, submitted: 0, onTime: 0, overdue: 0, returns: 0, scores: [] };
      s.total++;
      if (l.submitted_at) {
        s.submitted++;
        if (l.submitted_at.slice(0, 10) <= l.window_end) s.onTime++;
      } else if (l.window_end < today) s.overdue++;
      s.returns += returnCount.get(l.id) ?? 0;
      if (l.status === "approved" && l.score !== null) s.scores.push(Number(l.score));
      by.set(l.agent.id, s);
    }
    const rows = [...by.values()].sort((a, b) => b.total - a.total);
    return (
      <Card>
        <CardHeader title="Přehled agentů" sub="Kontroly s termínem začínajícím ve zvoleném období" />
        {rows.length === 0 ? (
          <EmptyState title="Žádná data" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Agent</Th>
                <Th className="text-right">Přiřazeno</Th>
                <Th className="text-right">Odevzdáno</Th>
                <Th className="text-right">Včas</Th>
                <Th className="text-right">Po termínu</Th>
                <Th className="text-right">Vráceno k opravě</Th>
                <Th className="text-right">Průměrné skóre</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name}>
                  <Td className="font-medium">{r.name}</Td>
                  <Td className="tabular text-right">{r.total}</Td>
                  <Td className="tabular text-right">{r.submitted}</Td>
                  <Td className="tabular text-right">{r.submitted ? `${Math.round((r.onTime / r.submitted) * 100)} %` : "—"}</Td>
                  <Td className="tabular text-right">{r.overdue || "—"}</Td>
                  <Td className="tabular text-right">{r.returns || "—"}</Td>
                  <Td className="text-right">
                    <ScoreBadge score={r.scores.length ? Math.round((r.scores.reduce((a, b) => a + b, 0) / r.scores.length) * 10) / 10 : null} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    );
  }
}
