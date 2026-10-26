"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { assertAdmin } from "./guard";
import { notifyApproved, notifyAssigned, notifyReturned } from "@/lib/notify";
import { errorMessage, type ActionResult } from "@/lib/action-result";

function revalidateInspection(id?: string) {
  revalidatePath("/admin/kontroly");
  revalidatePath("/admin");
  if (id) revalidatePath(`/admin/kontroly/${id}`);
}

export async function createInspections(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ids: string[] = [];
  try {
    await assertAdmin();
    const db = await createClient();
    const branchIds = fd.getAll("branch_ids").map(String).filter(Boolean);
    const templateId = String(fd.get("template_id") ?? "");
    const ws = String(fd.get("window_start") ?? "");
    const we = String(fd.get("window_end") ?? "") || ws;
    if (!templateId) return { error: "Vyberte šablonu dotazníku." };
    if (branchIds.length === 0) return { error: "Vyberte provozovnu." };
    if (!ws) return { error: "Zadejte termín." };
    if (we < ws) return { error: "Konec termínu musí být po začátku." };
    const agent = String(fd.get("agent_id") ?? "") || null;
    for (const b of branchIds) {
      const { data, error } = await db.rpc("create_inspection", {
        p_template: templateId,
        p_branch: b,
        p_window_start: ws,
        p_window_end: we,
        p_agent: agent,
        p_title: null,
        p_instructions: String(fd.get("instructions") ?? "").trim() || null,
      });
      if (error) throw error;
      ids.push(data as string);
    }
    if (agent) await notifyAssigned(ids);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidateInspection();
  redirect(ids.length === 1 ? `/admin/kontroly/${ids[0]}` : "/admin/kontroly");
}

export async function updateInspection(_: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    await assertAdmin();
    const db = await createClient();
    const id = String(fd.get("id"));
    const { data: before } = await db.from("inspections").select("agent_id,status").eq("id", id).single();
    const agent = String(fd.get("agent_id") ?? "") || null;
    const ws = String(fd.get("window_start"));
    const we = String(fd.get("window_end") ?? "") || ws;
    if (we < ws) return { error: "Konec termínu musí být po začátku." };
    if (agent !== before?.agent_id && before && !["planned", "assigned"].includes(before.status)) {
      return { error: "Agenta lze změnit jen dokud kontrolu nezačal vyplňovat." };
    }
    const { error } = await db
      .from("inspections")
      .update({
        window_start: ws,
        window_end: we,
        agent_id: agent,
        instructions: String(fd.get("instructions") ?? "").trim() || null,
      })
      .eq("id", id);
    if (error) throw error;
    if (agent && agent !== before?.agent_id) await notifyAssigned([id]);
    revalidateInspection(id);
    return { ok: true, message: "Uloženo." };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function bulkAssign(_: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    await assertAdmin();
    const db = await createClient();
    const ids = fd.getAll("ids").map(String);
    const agent = String(fd.get("agent_id") ?? "") || null;
    if (ids.length === 0) return { error: "Nevybrali jste žádnou kontrolu." };
    const { data, error } = await db
      .from("inspections")
      .update({ agent_id: agent })
      .in("id", ids)
      .in("status", ["planned", "assigned"])
      .select("id");
    if (error) throw error;
    if (agent) await notifyAssigned((data ?? []).map((r) => r.id));
    revalidateInspection();
    const skipped = ids.length - (data?.length ?? 0);
    return {
      ok: true,
      message: `Upraveno ${data?.length ?? 0} kontrol.${skipped ? ` ${skipped} přeskočeno (agent už je vyplňuje).` : ""}`,
    };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function approveInspection(_: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    await assertAdmin();
    const id = String(fd.get("id"));
    const db = await createClient();
    const { error } = await db.rpc("approve_inspection", { p_id: id });
    if (error) throw error;
    await notifyApproved(id);
    revalidateInspection(id);
    return { ok: true, message: "Kontrola je schválená a klient byl upozorněn." };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function returnInspection(_: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    await assertAdmin();
    const id = String(fd.get("id"));
    const db = await createClient();
    const { error } = await db.rpc("return_inspection", { p_id: id, p_comment: String(fd.get("comment") ?? "") });
    if (error) throw error;
    await notifyReturned(id);
    revalidateInspection(id);
    return { ok: true, message: "Kontrola byla vrácena agentovi." };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function cancelInspection(_: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    await assertAdmin();
    const id = String(fd.get("id"));
    const db = await createClient();
    const { error } = await db.rpc("cancel_inspection", { p_id: id });
    if (error) throw error;
    revalidateInspection(id);
    return { ok: true, message: "Kontrola byla zrušena." };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function reopenInspection(_: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    await assertAdmin();
    const id = String(fd.get("id"));
    const db = await createClient();
    const { error } = await db.rpc("reopen_inspection", { p_id: id });
    if (error) throw error;
    revalidateInspection(id);
    return { ok: true, message: "Kontrola je znovu ve stavu „Ke schválení“." };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function deleteInspection(fd: FormData) {
  await assertAdmin();
  const db = await createClient();
  const id = String(fd.get("id"));
  const { data } = await db.from("inspections").select("status").eq("id", id).single();
  if (data && ["planned", "assigned", "cancelled"].includes(data.status)) {
    await db.from("inspections").delete().eq("id", id);
  }
  revalidateInspection();
  redirect("/admin/kontroly");
}
