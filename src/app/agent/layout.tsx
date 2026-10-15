import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";
import { navFor } from "@/lib/nav";

export default async function AgentLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole("agent");
  return (
    <AppShell profile={profile} nav={navFor("agent")}>
      {children}
    </AppShell>
  );
}
