"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { homeFor, getProfile } from "@/lib/auth";
import { sendAccessLink } from "@/lib/notify";
import type { ActionResult } from "@/lib/action-result";

export async function login(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Nesprávný e-mail nebo heslo." };
  const profile = await getProfileFresh();
  if (!profile) {
    await supabase.auth.signOut();
    return { error: "Účet není aktivní. Obraťte se na správce." };
  }
  redirect(homeFor(profile.role));
}

async function getProfileFresh() {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;
  const { data } = await supabase.from("profiles").select("role,active").eq("id", u.user.id).maybeSingle();
  return data?.active ? data : null;
}

export async function requestReset(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "Zadejte e-mail." };
  const db = createAdminClient();
  const { data } = await db.from("profiles").select("id,active").eq("email", email).maybeSingle();
  if (data?.active) {
    await sendAccessLink({ email, type: "recovery" });
  }
  // Neprozrazujeme, zda účet existuje.
  return { ok: true, message: "Pokud účet s tímto e-mailem existuje, poslali jsme na něj odkaz pro nastavení hesla." };
}

export async function setPassword(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const password = String(fd.get("password") ?? "");
  const confirm = String(fd.get("confirm") ?? "");
  if (password.length < 8) return { error: "Heslo musí mít alespoň 8 znaků." };
  if (password !== confirm) return { error: "Hesla se neshodují." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "Heslo se nepodařilo uložit. Odkaz mohl vypršet – požádejte o nový." };
  const profile = await getProfile();
  redirect(profile ? homeFor(profile.role) : "/login");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
