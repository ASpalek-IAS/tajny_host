import "server-only";
import { getProfile } from "@/lib/auth";
import { isStaff } from "@/lib/types";

/** Jen správce (šablony, firmy, uživatelé klientů, účetnictví). */
export async function assertAdmin() {
  const p = await getProfile();
  if (!p || p.role !== "admin") throw new Error("K této akci nemáte oprávnění.");
  return p;
}

/** Správce nebo kontrolor (plánování, schvalování kontrol, agenti). */
export async function assertStaff() {
  const p = await getProfile();
  if (!p || !isStaff(p.role)) throw new Error("K této akci nemáte oprávnění.");
  return p;
}
