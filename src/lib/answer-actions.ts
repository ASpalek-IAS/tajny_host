"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { notifySubmitted } from "@/lib/notify";
import { errorMessage, type ActionResult } from "@/lib/action-result";

/** Uloží odpověď (agent na své kontrole, správce kdykoli – oprávnění hlídá databáze). */
export async function saveAnswer(questionId: string, value: unknown, comment: string | null): Promise<ActionResult> {
  try {
    const profile = await getProfile();
    if (!profile || profile.role === "client") return { error: "K této akci nemáte oprávnění." };
    const db = await createClient();
    const { data, error } = await db
      .from("answers")
      .upsert(
        { question_id: questionId, value: value === undefined ? null : value, comment: comment?.trim() || null },
        { onConflict: "question_id" },
      )
      .select("id");
    if (error) throw error;
    if (!data?.length) return { error: "Kontrolu už nelze upravit." };
    return { ok: true };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function saveVisitAt(inspectionId: string, isoOrNull: string | null): Promise<ActionResult> {
  try {
    const db = await createClient();
    const { error } = await db.rpc("set_visit_at", { p_id: inspectionId, p_at: isoOrNull });
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function saveExpense(inspectionId: string, amount: number | null): Promise<ActionResult> {
  try {
    const db = await createClient();
    const { error } = await db.rpc("set_expense", { p_id: inspectionId, p_amount: amount });
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export type SubmitResult = ActionResult & { missing?: { question_id: string | null; reason: string }[] };

export async function submitInspection(inspectionId: string): Promise<SubmitResult> {
  try {
    const db = await createClient();
    const { data, error } = await db.rpc("submit_inspection", { p_id: inspectionId });
    if (error) throw error;
    const res = data as { ok: boolean; missing?: { question_id: string | null; reason: string }[] };
    if (!res.ok) return { error: "Některé povinné údaje chybí – jsou označené červeně.", missing: res.missing };
    await notifySubmitted(inspectionId);
    revalidatePath("/agent");
    revalidatePath(`/agent/kontroly/${inspectionId}`);
    return { ok: true };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}
