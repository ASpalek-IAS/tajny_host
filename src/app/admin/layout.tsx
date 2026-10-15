import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";
import { navFor } from "@/lib/nav";
import { createClient } from "@/lib/supabase/server";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole("admin");
  const db = await createClient();
  const { count } = await db.from("inspections").select("id", { count: "exact", head: true }).eq("status", "submitted");
  return (
    <AppShell profile={profile} nav={navFor("admin", count ?? 0)}>
      {children}
    </AppShell>
  );
}
