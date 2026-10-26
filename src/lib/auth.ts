import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isStaff, type Profile, type Role } from "@/lib/types";

/** Přihlášený uživatel a jeho profil (jednou za požadavek). */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (!data || !data.active) return null;
  return data as Profile;
});

export async function requireRole(...roles: Role[]): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!roles.includes(profile.role)) redirect(homeFor(profile.role));
  return profile;
}

/** Stránka jen pro správce – kontrolora vrátí na přehled. */
export function requireAdmin() {
  return requireRole("admin");
}

/** Správce i kontrolor (administrace). */
export function requireStaff() {
  return requireRole("admin", "controller");
}

export function homeFor(role: Role) {
  return isStaff(role) ? "/admin" : role === "client" ? "/klient" : "/agent";
}
