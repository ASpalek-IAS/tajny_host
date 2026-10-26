import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LibraryQuestion } from "@/components/questionnaire-editor";

/**
 * Otázky z témat se stejnými názvy ze všech šablon i z dřívějších znění použitých
 * v kontrolách. Klíč = název tématu malými písmeny.
 */
export async function loadQuestionLibrary(db: SupabaseClient, titles: string[]) {
  const library: Record<string, LibraryQuestion[]> = {};
  const uniq = [...new Set(titles)];
  if (!uniq.length) return library;
  const { data, error } = await db.rpc("question_library", { p_titles: uniq });
  if (error) console.error("Knihovnu otázek se nepodařilo načíst:", error.message);
  ((data ?? []) as (Omit<LibraryQuestion, "id" | "topic_id" | "position"> & { topic_title: string })[]).forEach((q, i) => {
    const key = q.topic_title.trim().toLowerCase();
    (library[key] ??= []).push({
      ...q,
      id: `lib-${i}`,
      topic_id: "",
      position: i,
      template_name: q.template_name ?? "",
      company_name: q.company_name ?? "",
    });
  });
  for (const k of Object.keys(library)) {
    // aktuální znění ze šablon má přednost před dřívějším
    library[k].sort((x, y) => Number(x.source === "history") - Number(y.source === "history"));
    // stejné znění otázky ve více šablonách = jedna položka se seznamem šablon
    const byText = new Map<string, LibraryQuestion>();
    for (const q of library[k]) {
      const t = q.text.trim().toLowerCase();
      const first = byText.get(t);
      if (!first) byText.set(t, { ...q, sources: [{ template_name: q.template_name, company_name: q.company_name }] });
      else if (!first.sources!.some((s) => s.template_name === q.template_name))
        first.sources!.push({ template_name: q.template_name, company_name: q.company_name });
    }
    library[k] = [...byText.values()].sort((x, y) => x.text.localeCompare(y.text, "cs"));
  }
  return library;
}
