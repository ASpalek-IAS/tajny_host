import { AppShell } from "@/components/app-shell";
import { requireStaff } from "@/lib/auth";
import { navFor } from "@/lib/nav";
import { createClient } from "@/lib/supabase/server";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireStaff();
  const db = await createClient();
  const { count } = await db.from("inspections").select("id", { count: "exact", head: true }).eq("status", "submitted");
  return (
    <AppShell profile={profile} nav={navFor(profile.role, count ?? 0)}>
      {children}
    </AppShell>
  );
}
