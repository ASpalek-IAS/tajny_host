import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";
import { navFor } from "@/lib/nav";
import { createClient } from "@/lib/supabase/server";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole("client");
  const db = await createClient();
  const { data: company } = await db.from("companies").select("name").eq("id", profile.company_id!).maybeSingle();
  return (
    <AppShell profile={profile} nav={navFor("client")} subtitle={company?.name}>
      {children}
    </AppShell>
  );
}
