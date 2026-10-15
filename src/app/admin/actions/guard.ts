import "server-only";
import { getProfile } from "@/lib/auth";

export async function assertAdmin() {
  const p = await getProfile();
  if (!p || p.role !== "admin") throw new Error("K této akci nemáte oprávnění.");
  return p;
}
