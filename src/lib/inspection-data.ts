import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Answer, Attachment, Question, Topic } from "@/lib/types";

export type AttachmentWithUrl = Attachment & { url: string | null };

export type InspectionContent = {
  topics: Topic[];
  questions: Question[];
  answers: Record<string, Answer>;
  attachments: AttachmentWithUrl[];
};

export async function loadInspectionContent(db: SupabaseClient, inspectionId: string): Promise<InspectionContent> {
  const [{ data: topics }, { data: questions }, { data: answers }, { data: attachments }] = await Promise.all([
    db.from("inspection_topics").select("*").eq("inspection_id", inspectionId).order("position"),
    db.from("inspection_questions").select("*").eq("inspection_id", inspectionId).order("position"),
    db.from("answers").select("*").eq("inspection_id", inspectionId),
    db.from("attachments").select("*").eq("inspection_id", inspectionId).order("created_at"),
  ]);
  const files = (attachments ?? []) as Attachment[];
  let urls: Record<string, string> = {};
  if (files.length) {
    const { data } = await db.storage
      .from("attachments")
      .createSignedUrls(
        files.map((f) => f.storage_path),
        60 * 60,
      );
    urls = Object.fromEntries((data ?? []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
  }
  return {
    topics: (topics ?? []) as Topic[],
    questions: (questions ?? []) as Question[],
    answers: Object.fromEntries(((answers ?? []) as Answer[]).map((a) => [a.question_id, a])),
    attachments: files.map((f) => ({ ...f, url: urls[f.storage_path] ?? null })),
  };
}
