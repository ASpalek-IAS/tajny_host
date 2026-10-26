"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertStaff } from "./guard";
import { sendAccessLink } from "@/lib/notify";
import { errorMessage, type ActionResult } from "@/lib/action-result";
import type { Role } from "@/lib/types";

const NO_RIGHTS = "Kontrolor může spravovat jen agenty.";

function linkResult(r: { link?: string; emailed: boolean }, what: string): ActionResult {
  return r.emailed
    ? { ok: true, message: `${what} E-mail s odkazem pro nastavení hesla byl odeslán.` }
    : {
        ok: true,
        link: r.link,
        message: `${what} E-maily nejsou nastavené, pošlete uživateli tento odkaz ručně: ${r.link}`,
      };
}

export async function inviteUser(_: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const me = await assertStaff();
    const role = String(fd.get("role")) as Role;
    if (!["admin", "controller", "client", "agent"].includes(role)) return { error: "Neplatná role." };
    // kontrolora (i správce a klienty) přidává jen správce
    if (me.role !== "admin" && role !== "agent") return { error: NO_RIGHTS };
    const email = String(fd.get("email") ?? "").trim().toLowerCase();
    const fullName = String(fd.get("full_name") ?? "").trim();
    if (!email || !fullName) return { error: "Vyplňte jméno a e-mail." };
    const companyId = role === "client" ? String(fd.get("company_id") ?? "") : null;
    if (role === "client" && !companyId) return { error: "Chybí firma." };
    const allBranches = role !== "client" || fd.get("all_branches") !== "restricted";
    const branchIds = fd.getAll("branch_ids").map(String).filter(Boolean);
    if (!allBranches && branchIds.length === 0) return { error: "Vyberte alespoň jednu provozovnu." };

    const db = createAdminClient();
    const { data: existing } = await db.from("profiles").select("id").eq("email", email).maybeSingle();
    if (existing) return { error: "Uživatel s tímto e-mailem už existuje." };

    const r = await sendAccessLink({ email, type: "invite", fullName });
    if (!r.userId) return { error: r.error?.includes("already") ? "Účet s tímto e-mailem už existuje." : (r.error ?? "Účet se nepodařilo vytvořit.") };

    const { error } = await db.from("profiles").insert({
      id: r.userId,
      role,
      email,
      full_name: fullName,
      phone: String(fd.get("phone") ?? "").trim() || null,
      company_id: companyId,
      all_branches: allBranches,
    });
    if (error) {
      await db.auth.admin.deleteUser(r.userId);
      throw error;
    }
    if (!allBranches) {
      await db.from("profile_branches").insert(branchIds.map((b) => ({ profile_id: r.userId, branch_id: b })));
    }
    revalidatePath("/admin/uzivatele");
    if (companyId) revalidatePath(`/admin/firmy/${companyId}`);
    return linkResult(r, "Účet byl vytvořen.");
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function updateUser(_: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const me = await assertStaff();
    const id = String(fd.get("id"));
    const db = createAdminClient();
    const { data: p } = await db.from("profiles").select("role,company_id").eq("id", id).single();
    if (!p) return { error: "Uživatel nenalezen." };
    if (me.role !== "admin" && p.role !== "agent") return { error: NO_RIGHTS };
    const active = fd.get("active") === "on";
    if (id === me.id && !active) return { error: "Sami sebe deaktivovat nemůžete." };
    const allBranches = p.role !== "client" || fd.get("all_branches") !== "restricted";
    const branchIds = fd.getAll("branch_ids").map(String).filter(Boolean);
    if (!allBranches && branchIds.length === 0) return { error: "Vyberte alespoň jednu provozovnu." };

    const { error } = await db
      .from("profiles")
      .update({
        full_name: String(fd.get("full_name") ?? "").trim(),
        phone: String(fd.get("phone") ?? "").trim() || null,
        active,
        all_branches: allBranches,
      })
      .eq("id", id);
    if (error) throw error;
    if (p.role === "client") {
      await db.from("profile_branches").delete().eq("profile_id", id);
      if (!allBranches)
        await db.from("profile_branches").insert(branchIds.map((b) => ({ profile_id: id, branch_id: b })));
    }
    // deaktivace = zablokování přihlášení
    await db.auth.admin.updateUserById(id, { ban_duration: active ? "none" : "876000h" });
    revalidatePath("/admin/uzivatele");
    if (p.company_id) revalidatePath(`/admin/firmy/${p.company_id}`);
    return { ok: true, message: "Uloženo." };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function resendAccess(_: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const me = await assertStaff();
    const email = String(fd.get("email"));
    if (me.role !== "admin") {
      const { data: p } = await createAdminClient().from("profiles").select("role").eq("email", email).maybeSingle();
      if (p?.role !== "agent") return { error: NO_RIGHTS };
    }
    const r = await sendAccessLink({ email, type: "recovery" });
    if (r.error) return { error: r.error };
    return linkResult(r, "Nový odkaz připraven.");
  } catch (e) {
    return { error: errorMessage(e) };
  }
}
