"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { assertAdmin, assertStaff } from "./guard";
import { generateScheduled } from "@/lib/schedule";
import { notifyAssigned } from "@/lib/notify";
import { errorMessage, type ActionResult } from "@/lib/action-result";

export async function createTemplate(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let id: string;
  try {
    await assertAdmin();
    const db = await createClient();
    const companyId = String(fd.get("company_id"));
    const name = String(fd.get("name") ?? "").trim();
    if (!name) return { error: "Vyplňte název." };
    const copyFrom = String(fd.get("copy_from") ?? "");
    if (copyFrom) {
      const { data, error } = await db.rpc("duplicate_template", { p_template: copyFrom, p_company: companyId, p_name: name });
      if (error) throw error;
      id = data as string;
    } else {
      const { data, error } = await db
        .from("templates")
        .insert({ company_id: companyId, name, description: String(fd.get("description") ?? "").trim() || null })
        .select("id")
        .single();
      if (error) throw error;
      id = data.id;
    }
  } catch (e) {
    return { error: errorMessage(e) };
  }
  redirect(`/admin/sablony/${id}`);
}

export async function updateTemplate(_: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    await assertAdmin();
    const db = await createClient();
    const id = String(fd.get("id"));
    const { error } = await db
      .from("templates")
      .update({
        name: String(fd.get("name") ?? "").trim() || "Šablona",
        description: String(fd.get("description") ?? "").trim() || null,
        archived: fd.get("archived") === "on",
      })
      .eq("id", id);
    if (error) throw error;
    revalidatePath(`/admin/sablony/${id}`);
    return { ok: true, message: "Uloženo." };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function saveSchedule(_: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    await assertStaff();
    const db = await createClient();
    const id = String(fd.get("id") ?? "") || null;
    const companyId = String(fd.get("company_id"));
    const branchIds = fd.getAll("branch_ids").map(String);
    if (branchIds.length === 0) return { error: "Vyberte alespoň jednu provozovnu." };
    const row = {
      company_id: companyId,
      template_id: String(fd.get("template_id")),
      name: String(fd.get("name") ?? "").trim() || "Pravidelná kontrola",
      interval: String(fd.get("interval")),
      start_date: String(fd.get("start_date")),
      end_date: String(fd.get("end_date") ?? "") || null,
      branch_ids: branchIds,
      default_agent_id: String(fd.get("default_agent_id") ?? "") || null,
      instructions: String(fd.get("instructions") ?? "").trim() || null,
      active: id ? fd.get("active") === "on" : true,
    };
    if (!row.template_id || !row.start_date) return { error: "Vyberte šablonu a datum začátku." };
    if (row.end_date && row.end_date < row.start_date) return { error: "Konec musí být po začátku." };
    const res = id
      ? await db.from("schedules").update(row).eq("id", id).select("id").single()
      : await db.from("schedules").insert(row).select("id").single();
    if (res.error) throw res.error;
    const gen = await generateScheduled(res.data.id);
    await notifyAssigned(gen.assigned);
    revalidatePath(`/admin/firmy/${companyId}`);
    revalidatePath("/admin/kontroly");
    return {
      ok: true,
      message: gen.created ? `Plán uložen, vytvořeno ${gen.created} kontrol.` : "Plán uložen.",
    };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function deleteSchedule(fd: FormData) {
  await assertStaff();
  const db = await createClient();
  const companyId = String(fd.get("company_id"));
  await db.from("schedules").delete().eq("id", String(fd.get("id")));
  revalidatePath(`/admin/firmy/${companyId}`);
}
