import { Card, CardHeader, PageHeader } from "@/components/ui";
import { BranchBars } from "@/components/charts";
import { RankingTable, ReportFilters, type FilterValues } from "@/components/report-blocks";
import { clientScope } from "@/lib/client-scope";
import { branchRanking, loadReportRows, templateOptions, topicList } from "@/lib/reports";

export default async function ComparePage({ searchParams }: { searchParams: Promise<FilterValues> }) {
  const sp = await searchParams;
  const { db, templateNames, values, filters } = await clientScope({ ...sp, provozovna: undefined });
  const allRows = await loadReportRows(db, true, { ...filters, template: undefined });
  const templates = templateOptions(allRows, templateNames);
  if (!filters.template && templates.length > 1) filters.template = templates[0].id;
  const rows = filters.template ? allRows.filter((r) => r.template_id === filters.template) : allRows;
  const ranking = branchRanking(rows);
  return (
    <>
      <PageHeader title="Srovnání provozoven" sub="Průměrné skóre schválených kontrol za zvolené období" />
      <ReportFilters action="/klient/srovnani" values={{ ...values, dotaznik: filters.template }} templates={templates} />
      <Card className="mb-6">
        <CardHeader title="Průměrné skóre" />
        <BranchBars data={ranking.map((r) => ({ name: r.name, avg: r.avg, count: r.count }))} />
      </Card>
      <Card>
        <CardHeader title="Provozovny podle témat" sub="Zelená 85 % a více, oranžová 65–85 %, červená pod 65 %" />
        <RankingTable rows={ranking} topics={topicList(rows)} />
      </Card>
    </>
  );
}
