import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/client-ui";
import { Card, CardHeader, Field, Notice, PageHeader } from "@/components/ui";
import { QuestionnaireEditor, type LibraryQuestion } from "@/components/questionnaire-editor";
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

  // Knihovna: otázky z témat se stejným názvem ve všech ostatních šablonách
  const titles = [...new Set((topics ?? []).map((t) => t.title as string))];
  const library: Record<string, LibraryQuestion[]> = {};
  if (titles.length) {
    const { data: lib } = await db
      .from("template_topics")
      .select("title,template:templates(id,name,company:companies(name)),template_questions(*)")
      .neq("template_id", id)
      .in("title", titles);
    for (const t of (lib ?? []) as unknown as {
      title: string;
      template: { id: string; name: string; company: { name: string } | null } | null;
      template_questions: Question[];
    }[]) {
      const key = t.title.trim().toLowerCase();
      const seen = new Set((library[key] ?? []).map((q) => q.text.trim().toLowerCase() + "|" + q.template_name));
      for (const q of [...t.template_questions].sort((a, b) => a.position - b.position)) {
        const item = { ...q, template_name: t.template?.name ?? "", company_name: t.template?.company?.name ?? "" };
        const k = q.text.trim().toLowerCase() + "|" + item.template_name;
        if (seen.has(k)) continue;
        seen.add(k);
        (library[key] ??= []).push(item);
      }
    }
  }

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
