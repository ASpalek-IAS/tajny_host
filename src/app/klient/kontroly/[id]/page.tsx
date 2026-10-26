import { notFound } from "next/navigation";
import { LinkButton, PageHeader } from "@/components/ui";
import { InspectionResult, ScoreSummary } from "@/components/inspection-result";
import { createClient } from "@/lib/supabase/server";
import { loadInspectionContent } from "@/lib/inspection-data";
import { fmtDateTime } from "@/lib/format";

export default async function ClientInspectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await createClient();
  const [{ data: i }, content] = await Promise.all([
    db.from("client_inspections").select("*").eq("id", id).eq("status", "done").maybeSingle(),
    loadInspectionContent(db, id),
  ]);
  if (!i) notFound();
  return (
    <>
      <PageHeader
        title={i.branch_name}
        sub={`${i.template_name ?? i.title} · návštěva ${fmtDateTime(i.visit_at)}`}
        back={{ href: "/klient/kontroly", label: "Kontroly" }}
        actions={
          <LinkButton variant="secondary" href={`/api/inspections/${id}/pdf`} prefetch={false}>
            Stáhnout PDF
          </LinkButton>
        }
      />
      <div className="space-y-4">
        <ScoreSummary score={i.score} topics={content.topics.map((t) => ({ title: t.title, score: t.score }))} />
        <InspectionResult content={content} />
      </div>
    </>
  );
}
