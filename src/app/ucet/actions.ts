"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import type { ActionResult } from "@/lib/action-result";

export async function updateAccount(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const profile = await getProfile();
  if (!profile) return { error: "Nejste přihlášeni." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: String(fd.get("full_name") ?? "").trim(),
      phone: String(fd.get("phone") ?? "").trim() || null,
      notify_digest: fd.get("notify_digest") === "on",
    })
    .eq("id", profile.id);
  if (error) return { error: "Uložení se nepovedlo." };
  revalidatePath("/", "layout");
  return { ok: true, message: "Uloženo." };
}

export async function changePassword(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const password = String(fd.get("password") ?? "");
  if (password.length < 8) return { error: "Heslo musí mít alespoň 8 znaků." };
  if (password !== String(fd.get("confirm") ?? "")) return { error: "Hesla se neshodují." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "Heslo se nepodařilo změnit." };
  return { ok: true, message: "Heslo bylo změněno." };
}
