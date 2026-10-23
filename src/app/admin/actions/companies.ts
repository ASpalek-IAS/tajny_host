"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { assertAdmin } from "./guard";
import { errorMessage, type ActionResult } from "@/lib/action-result";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim() || null;

async function uploadLogo(companyId: string, file: File | null) {
  if (!file || file.size === 0) return undefined;
  if (!file.type.startsWith("image/")) throw new Error("Logo musí být obrázek.");
  if (file.size > 2 * 1024 * 1024) throw new Error("Logo může mít nejvýše 2 MB.");
  const db = await createClient();
  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const path = `${companyId}/logo-${Date.now()}.${ext}`;
  const { error } = await db.storage.from("logos").upload(path, file, { contentType: file.type });
  if (error) throw new Error(`Logo se nepodařilo nahrát: ${error.message}`);
  return db.storage.from("logos").getPublicUrl(path).data.publicUrl;
}

export async function createCompany(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let id: string;
  try {
    await assertAdmin();
    const db = await createClient();
    const name = s(fd, "name");
    if (!name) return { error: "Vyplňte název firmy." };
    const { data, error } = await db
      .from("companies")
      .insert({
        name,
        ico: s(fd, "ico"),
        contact_name: s(fd, "contact_name"),
        contact_email: s(fd, "contact_email"),
        contact_phone: s(fd, "contact_phone"),
        note: s(fd, "note"),
      })
      .select("id")
      .single();
    if (error) throw error;
    id = data.id;
    const logo = await uploadLogo(id, fd.get("logo") as File | null);
    if (logo) await db.from("companies").update({ logo_url: logo }).eq("id", id);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  redirect(`/admin/firmy/${id}`);
}

export async function updateCompany(_: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    await assertAdmin();
    const db = await createClient();
    const id = String(fd.get("id"));
    const logo = await uploadLogo(id, fd.get("logo") as File | null);
    const { error } = await db
      .from("companies")
      .update({
        name: s(fd, "name") ?? "Bez názvu",
        ico: s(fd, "ico"),
        contact_name: s(fd, "contact_name"),
        contact_email: s(fd, "contact_email"),
        contact_phone: s(fd, "contact_phone"),
        note: s(fd, "note"),
        active: fd.get("active") === "on",
        ...(logo ? { logo_url: logo } : {}),
        ...(fd.get("remove_logo") === "on" ? { logo_url: null } : {}),
      })
      .eq("id", id);
    if (error) throw error;
    revalidatePath(`/admin/firmy/${id}`);
    return { ok: true, message: "Uloženo." };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

/** Načte údaje firmy z ARES podle IČO. */
export async function lookupAres(ico: string): Promise<{ name?: string; address?: string; error?: string }> {
  await assertAdmin();
  const clean = ico.replace(/\D/g, "");
  if (clean.length !== 8) return { error: "IČO musí mít 8 číslic." };
  try {
    const r = await fetch(`https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/${clean}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!r.ok) return { error: "Firma s tímto IČO nebyla v ARES nalezena." };
    const j = await r.json();
    return { name: j.obchodniJmeno, address: j.sidlo?.textovaAdresa };
  } catch {
    return { error: "ARES je teď nedostupný." };
  }
}

export async function saveBranch(_: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    await assertAdmin();
    const db = await createClient();
    const id = s(fd, "id");
    const companyId = String(fd.get("company_id"));
    const row = {
      name: s(fd, "name") ?? "Provozovna",
      address: s(fd, "address"),
      note_for_agent: s(fd, "note_for_agent"),
      active: id ? fd.get("active") === "on" : true,
    };
    const { error } = id
      ? await db.from("branches").update(row).eq("id", id)
      : await db.from("branches").insert({ ...row, company_id: companyId });
    if (error) throw error;
    revalidatePath(`/admin/firmy/${companyId}`);
    return { ok: true };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

/** Hromadné přidání provozoven – jedna na řádek: "Název; adresa" */
export async function importBranches(_: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    await assertAdmin();
    const db = await createClient();
    const companyId = String(fd.get("company_id"));
    const rows = String(fd.get("lines") ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [name, ...rest] = l.split(/[;\t]/);
        return { company_id: companyId, name: name.trim(), address: rest.join(", ").trim() || null };
      });
    if (rows.length === 0) return { error: "Vložte alespoň jeden řádek." };
    const { error } = await db.from("branches").insert(rows);
    if (error) throw error;
    revalidatePath(`/admin/firmy/${companyId}`);
    return { ok: true, message: `Přidáno ${rows.length} provozoven.` };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}
