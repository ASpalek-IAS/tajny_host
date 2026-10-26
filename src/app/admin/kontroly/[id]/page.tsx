import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/client-ui";
import {
  Card,
  CardHeader,
  Field,
  LinkButton,
  Notice,
  PageHeader,
  StatusBadge,
} from "@/components/ui";
import { InspectionResult, ScoreSummary } from "@/components/inspection-result";
import { InspectionForm } from "@/components/inspection-form";
import { QuestionnaireEditor } from "@/components/questionnaire-editor";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth";
import { loadInspectionContent } from "@/lib/inspection-data";
import { loadQuestionLibrary } from "@/lib/question-library";
import { fmtCZK, fmtDateTime, fmtWindow } from "@/lib/format";
import type { InspectionStatus } from "@/lib/types";
import {
  approveInspection,
  cancelInspection,
  deleteInspection,
  reopenInspection,
  returnInspection,
  updateInspection,
} from "@/app/admin/actions/inspections";

const ACTION_LABEL: Record<string, string> = {
  created: "Kontrola vytvořena",
  submitted: "Agent odeslal ke schválení",
  resubmitted: "Agent znovu odeslal po opravě",
  returned: "Vráceno agentovi k opravě",
  approved: "Schváleno",
  cancelled: "Zrušeno",
  reopened: "Znovu otevřeno ke schválení",
  answer_edited: "Upravena odpověď",
  template_sync: "Převzata úprava ze šablony",
};

export default async function AdminInspectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ upravit?: string }>;
}) {
  const { id } = await params;
  const { upravit } = await searchParams;
  const me = await requireStaff();
  const isAdmin = me.role === "admin";
  const db = await createClient();
  const { data: insp } = await db
    .from("inspections")
    .select(
      "*,company:companies(id,name),branch:branches(name,address,note_for_agent),template:templates(name)," +
        "agent:profiles!inspections_agent_id_fkey(id,full_name,email,phone)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!insp) notFound();
  const i = insp as unknown as {
    id: string;
    title: string;
    status: InspectionStatus;
    window_start: string;
    window_end: string;
    agent_id: string | null;
    instructions: string | null;
    visit_at: string | null;
    expense: number | null;
    score: number | null;
    return_comment: string | null;
    submitted_at: string | null;
    approved_at: string | null;
    company: { id: string; name: string };
    template: { name: string } | null;
    branch: {
      name: string;
      address: string | null;
      note_for_agent: string | null;
    };
    agent: {
      id: string;
      full_name: string;
      email: string;
      phone: string | null;
    } | null;
  };

  const [content, { data: agents }, { data: log }] = await Promise.all([
    loadInspectionContent(db, id),
    db
      .from("profiles")
      .select("id,full_name")
      .eq("role", "agent")
      .eq("active", true)
      .order("full_name"),
    db
      .from("audit_log")
      .select("id,action,details,created_at,actor:profiles(full_name)")
      .eq("inspection_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const beforeStart = i.status === "planned" || i.status === "assigned";
  const hasAnswers = Object.keys(content.answers).length > 0;
  // otázky kontroly upravuje jen správce
  const canEditQuestions = isAdmin && beforeStart && !hasAnswers;
  const library = canEditQuestions
    ? await loadQuestionLibrary(
        db,
        content.topics.map((t) => t.title),
      )
    : {};
  const editing = upravit === "1" && i.status !== "cancelled";

  return (
    <>
      <PageHeader
        title={`${i.company.name} – ${i.branch.name}`}
        sub={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={i.status} /> {i.template?.name ?? i.title} ·
            termín {fmtWindow(i.window_start, i.window_end)}
          </span>
        }
        back={{ href: "/admin/kontroly", label: "Kontroly" }}
        actions={
          <>
            {(i.status === "approved" || i.status === "submitted") && (
              <LinkButton
                variant="secondary"
                href={`/api/inspections/${id}/pdf`}
                prefetch={false}
              >
                Stáhnout PDF
              </LinkButton>
            )}
            {!editing && !beforeStart && i.status !== "cancelled" && (
              <LinkButton
                variant="secondary"
                href={`/admin/kontroly/${id}?upravit=1`}
              >
                Upravit odpovědi
              </LinkButton>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          {i.status === "returned" && i.return_comment && (
            <Notice tone="warn">
              <strong>Vráceno agentovi:</strong> {i.return_comment}
            </Notice>
          )}
          {i.status === "approved" && !editing && (
            <ScoreSummary
              score={i.score}
              topics={content.topics.map((t) => ({
                title: t.title,
                score: t.score,
              }))}
            />
          )}

          {editing ? (
            <>
              <Notice tone="warn">
                Upravujete odpovědi agenta. Změny se ukládají hned
                {i.status === "approved"
                  ? ", skóre se přepočítá a klient uvidí novou verzi"
                  : ""}
                . Každá změna se zapíše do historie.
              </Notice>
              <InspectionForm
                inspectionId={id}
                mode="admin"
                topics={content.topics}
                questions={content.questions}
                answers={content.answers}
                attachments={content.attachments}
                visitAt={i.visit_at}
              />
            </>
          ) : canEditQuestions ? (
            <>
              <Notice>
                Agent zatím nezačal. Otázky této kontroly můžete upravit – změna
                se týká jen této kontroly, šablona zůstane beze změny.
              </Notice>
              <QuestionnaireEditor
                scope="inspection"
                parentId={id}
                topics={content.topics}
                questions={content.questions}
                library={library}
              />
            </>
          ) : (
            <>
              {beforeStart && !hasAnswers && (
                <Notice>
                  Agent zatím nezačal. Otázky kontroly může upravit jen správce.
                </Notice>
              )}
              <InspectionResult
                content={content}
                showScores={i.status === "approved"}
              />
            </>
          )}
        </div>

        <aside className="space-y-4">
          {i.status === "submitted" && (
            <Card>
              <CardHeader title="Schválení" />
              <div className="space-y-4 p-5">
                <ActionForm action={approveInspection}>
                  <input type="hidden" name="id" value={id} />
                  <SubmitButton className="w-full" pendingText="Schvaluji…">
                    Schválit a zveřejnit klientovi
                  </SubmitButton>
                </ActionForm>
                <ActionForm
                  action={returnInspection}
                  className="space-y-2 border-t border-ink-100 pt-4"
                >
                  <input type="hidden" name="id" value={id} />
                  <Field label="Vrátit agentovi k opravě">
                    <textarea
                      name="comment"
                      rows={3}
                      required
                      className="input"
                      placeholder="Co má agent opravit nebo doplnit"
                    />
                  </Field>
                  <SubmitButton variant="secondary" className="w-full">
                    Vrátit k opravě
                  </SubmitButton>
                </ActionForm>
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="Detaily" />
            <ActionForm action={updateInspection} className="space-y-3 p-5">
              <input type="hidden" name="id" value={id} />
              <div className="grid grid-cols-2 gap-2">
                <Field label="Termín od">
                  <input
                    type="date"
                    name="window_start"
                    defaultValue={i.window_start}
                    className="input px-2"
                  />
                </Field>
                <Field label="do">
                  <input
                    type="date"
                    name="window_end"
                    defaultValue={i.window_end}
                    className="input px-2"
                  />
                </Field>
              </div>
              <Field
                label="Agent"
                hint={
                  beforeStart
                    ? undefined
                    : "Agenta už nelze změnit, kontrolu vyplňuje."
                }
              >
                {beforeStart ? (
                  <select
                    name="agent_id"
                    defaultValue={i.agent_id ?? ""}
                    className="input"
                  >
                    <option value="">— nepřiřazeno —</option>
                    {(agents ?? []).map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.full_name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <>
                    <input
                      type="hidden"
                      name="agent_id"
                      value={i.agent_id ?? ""}
                    />
                    <input
                      disabled
                      value={i.agent?.full_name ?? "—"}
                      className="input"
                    />
                  </>
                )}
              </Field>
              {isAdmin && (
                <Field label="Útrata agenta (Kč)">
                  <input
                    name="expense"
                    inputMode="decimal"
                    defaultValue={
                      i.expense === null
                        ? ""
                        : String(i.expense).replace(".", ",")
                    }
                    className="input tabular"
                    placeholder="nevyplněno"
                  />
                </Field>
              )}
              <Field label="Zadání pro agenta">
                <textarea
                  name="instructions"
                  rows={3}
                  defaultValue={i.instructions ?? ""}
                  className="input"
                />
              </Field>
              <SubmitButton variant="secondary">Uložit</SubmitButton>
            </ActionForm>
          </Card>

          <Card className="space-y-2 p-5 text-sm">
            <Info
              label="Provozovna"
              value={[i.branch.name, i.branch.address]
                .filter(Boolean)
                .join(", ")}
            />
            {i.agent && (
              <Info
                label="Agent"
                value={[i.agent.full_name, i.agent.email, i.agent.phone]
                  .filter(Boolean)
                  .join(" · ")}
              />
            )}
            <Info label="Návštěva" value={fmtDateTime(i.visit_at)} />
            {isAdmin && (
              <Info
                label="Útrata"
                value={i.expense === null ? "—" : fmtCZK(Number(i.expense))}
              />
            )}
            <Info label="Odesláno" value={fmtDateTime(i.submitted_at)} />
            <Info label="Schváleno" value={fmtDateTime(i.approved_at)} />
            <p className="pt-1">
              <Link
                href={`/admin/firmy/${i.company.id}`}
                className="text-brand-700 hover:underline"
              >
                Otevřít firmu →
              </Link>
            </p>
          </Card>

          <Card className="space-y-2 p-5">
            {i.status !== "approved" && i.status !== "cancelled" && (
              <ActionForm action={cancelInspection}>
                <input type="hidden" name="id" value={id} />
                <SubmitButton
                  variant="danger"
                  size="sm"
                  className="w-full"
                  confirm="Opravdu zrušit tuto kontrolu?"
                >
                  Zrušit kontrolu
                </SubmitButton>
              </ActionForm>
            )}
            {(i.status === "approved" || i.status === "cancelled") && (
              <ActionForm action={reopenInspection}>
                <input type="hidden" name="id" value={id} />
                <SubmitButton
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  confirm={
                    i.status === "approved"
                      ? "Klient výsledek přestane vidět, dokud ho znovu neschválíte. Pokračovat?"
                      : undefined
                  }
                >
                  Vrátit do stavu „Ke schválení“
                </SubmitButton>
              </ActionForm>
            )}
            {(beforeStart || i.status === "cancelled") && (
              <form action={deleteInspection}>
                <input type="hidden" name="id" value={id} />
                <SubmitButton
                  variant="ghost"
                  size="sm"
                  className="w-full text-bad!"
                  confirm="Kontrolu nenávratně smazat?"
                >
                  Smazat kontrolu
                </SubmitButton>
              </form>
            )}
          </Card>

          <Card>
            <CardHeader title="Historie" />
            <ol className="space-y-3 p-5 text-sm">
              {(log ?? []).map((l) => (
                <li key={l.id}>
                  <p className="font-medium text-ink-800">
                    {ACTION_LABEL[l.action] ?? l.action}
                  </p>
                  <p className="text-xs text-ink-500">
                    {fmtDateTime(l.created_at)}
                    {(l.actor as unknown as { full_name: string } | null)
                      ?.full_name &&
                      ` · ${(l.actor as unknown as { full_name: string }).full_name}`}
                  </p>
                  {l.action === "returned" &&
                    (l.details as { comment?: string })?.comment && (
                      <p className="mt-0.5 text-xs text-ink-600">
                        „{(l.details as { comment: string }).comment}“
                      </p>
                    )}
                </li>
              ))}
            </ol>
          </Card>
        </aside>
      </div>
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-ink-500">{label}</p>
      <p className="text-ink-800">{value || "—"}</p>
    </div>
  );
}
