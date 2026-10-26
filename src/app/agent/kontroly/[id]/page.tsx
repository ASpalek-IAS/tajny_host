import { notFound } from "next/navigation";
import { Card, Notice, PageHeader, StatusBadge } from "@/components/ui";
import { InspectionForm } from "@/components/inspection-form";
import { InspectionResult } from "@/components/inspection-result";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { loadInspectionContent } from "@/lib/inspection-data";
import { fmtWindow, todayISO } from "@/lib/format";
import type { InspectionStatus } from "@/lib/types";

export default async function AgentInspectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireRole("agent");
  const db = await createClient();
  const { data } = await db
    .from("inspections")
    .select("id,title,status,window_start,window_end,instructions,visit_at,expense,return_comment,agent_id,company:companies(name),branch:branches(name,address,note_for_agent)")
    .eq("id", id)
    .eq("agent_id", profile.id)
    .maybeSingle();
  if (!data) notFound();
  const i = data as unknown as {
    id: string;
    title: string;
    status: InspectionStatus;
    window_start: string;
    window_end: string;
    instructions: string | null;
    visit_at: string | null;
    expense: number | null;
    return_comment: string | null;
    company: { name: string };
    branch: { name: string; address: string | null; note_for_agent: string | null };
  };
  const content = await loadInspectionContent(db, id);
  const editable = ["assigned", "in_progress", "returned"].includes(i.status);
  const overdue = editable && i.window_end < todayISO();

  return (
    <>
      <PageHeader
        title={`${i.company.name} – ${i.branch.name}`}
        sub={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={i.status} />
            <span className={overdue ? "font-medium text-bad" : undefined}>
              Termín {fmtWindow(i.window_start, i.window_end)}
              {overdue && " (po termínu)"}
            </span>
          </span>
        }
        back={{ href: "/agent", label: "Moje kontroly" }}
      />

      <div className="mb-4 space-y-3">
        {i.status === "returned" && i.return_comment && (
          <Notice tone="error">
            <strong>Správce vrátil kontrolu k opravě:</strong> {i.return_comment}
          </Notice>
        )}
        {i.status === "submitted" && <Notice>Kontrola je odeslaná a čeká na schválení správcem.</Notice>}
        {(i.branch.address || i.instructions || i.branch.note_for_agent) && (
          <Card className="grid gap-4 p-5 text-sm sm:grid-cols-2">
            {i.branch.address && (
              <div>
                <p className="text-xs font-medium text-ink-500">Adresa</p>
                <p>
                  <a
                    className="text-brand-700 hover:underline"
                    href={`https://mapy.cz/zakladni?q=${encodeURIComponent(i.branch.address)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {i.branch.address}
                  </a>
                </p>
              </div>
            )}
            {i.branch.note_for_agent && (
              <div>
                <p className="text-xs font-medium text-ink-500">Poznámka k provozovně</p>
                <p className="whitespace-pre-wrap">{i.branch.note_for_agent}</p>
              </div>
            )}
            {i.instructions && (
              <div className="sm:col-span-2">
                <p className="text-xs font-medium text-ink-500">Zadání</p>
                <p className="whitespace-pre-wrap">{i.instructions}</p>
              </div>
            )}
          </Card>
        )}
      </div>

      {editable ? (
        <InspectionForm
          inspectionId={id}
          mode="agent"
          topics={content.topics}
          questions={content.questions}
          answers={content.answers}
          attachments={content.attachments}
          visitAt={i.visit_at}
          expense={i.expense === null ? null : Number(i.expense)}
        />
      ) : (
        <InspectionResult content={content} showScores={false} />
      )}
    </>
  );
}
