import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/client-ui";
import { Card, CardHeader, Field, Notice, PageHeader } from "@/components/ui";
import { QuestionnaireEditor } from "@/components/questionnaire-editor";
import { loadQuestionLibrary } from "@/lib/question-library";
import { createClient } from "@/lib/supabase/server";
import { updateTemplate } from "@/app/admin/actions/templates";
import type { Question, Topic } from "@/lib/types";

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await createClient();
  const { data: tpl } = await db.from("templates").select("*,company:companies(id,name)").eq("id", id).maybeSingle();
  if (!tpl) notFound();
  const { data: topics } = await db.from("template_topics").select("*").eq("template_id", id).order("position");
  const topicIds = (topics ?? []).map((t) => t.id);
  const { data: questions } = topicIds.length
    ? await db.from("template_questions").select("*").in("topic_id", topicIds).order("position")
    : { data: [] };
  const company = tpl.company as { id: string; name: string };

  // Kolik kontrol z této šablony už existuje (pro zpětné úpravy)
  const { data: usage } = await db.rpc("template_usage", { p_template: id });

  // Knihovna: otázky z témat se stejným názvem ze všech šablon i z dřívějších verzí (kontrol)
  const library = await loadQuestionLibrary(db, (topics ?? []).map((t) => t.title as string));

  return (
    <>
      <PageHeader
        title={tpl.name}
        sub={`Dotazník firmy ${company.name}`}
        back={{ href: `/admin/firmy/${company.id}?tab=dotazniky`, label: company.name }}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-4">
          <Notice>
            Změny se standardně projeví jen u nově vytvořených kontrol. Při úpravě otázky nebo tématu můžete zvolit, aby se
            změna promítla i do {Number(usage ?? 0)} existujících kontrol z této šablony.
          </Notice>
          <QuestionnaireEditor
            scope="template"
            parentId={id}
            topics={(topics ?? []) as Topic[]}
            questions={(questions ?? []) as Question[]}
            usage={Number(usage ?? 0)}
            library={library}
          />
        </div>
        <div>
          <Card>
            <CardHeader title="Nastavení" />
            <ActionForm action={updateTemplate} className="space-y-4 p-5">
              <input type="hidden" name="id" value={id} />
              <Field label="Název">
                <input name="name" defaultValue={tpl.name} className="input" required />
              </Field>
              <Field label="Popis">
                <textarea name="description" rows={2} defaultValue={tpl.description ?? ""} className="input" />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="archived" defaultChecked={tpl.archived} /> Archivovat (nepůjde vybrat pro nové kontroly)
              </label>
              <SubmitButton variant="secondary">Uložit</SubmitButton>
            </ActionForm>
          </Card>
        </div>
      </div>
    </>
  );
}
