import { Badge, Card, CardHeader, EmptyState, PageHeader, Table, Tabs, Td, Th } from "@/components/ui";
import { UserDialog } from "@/app/admin/user-form";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "agenti" } = await searchParams;
  const role = tab === "spravci" ? "admin" : "agent";
  const db = await createClient();
  const { data } = await db.from("profiles").select("*").eq("role", role).order("active", { ascending: false }).order("full_name");
  const users = (data ?? []) as Profile[];

  let stats = new Map<string, { open: number; done: number }>();
  if (role === "agent") {
    const { data: ins } = await db.from("inspections").select("agent_id,status").not("agent_id", "is", null);
    stats = new Map();
    for (const r of ins ?? []) {
      const s = stats.get(r.agent_id) ?? { open: 0, done: 0 };
      if (["assigned", "in_progress", "returned"].includes(r.status)) s.open++;
      if (["submitted", "approved"].includes(r.status)) s.done++;
      stats.set(r.agent_id, s);
    }
  }

  return (
    <>
      <PageHeader title="Agenti a správci" />
      <Tabs
        active={tab}
        tabs={[
          { key: "agenti", label: "Agenti", href: "/admin/uzivatele?tab=agenti" },
          { key: "spravci", label: "Správci", href: "/admin/uzivatele?tab=spravci" },
        ]}
      />
      <Card>
        <CardHeader
          title={role === "agent" ? "Agenti" : "Správci"}
          sub={role === "agent" ? "Vidí jen kontroly, které jim přiřadíte." : "Mají plný přístup ke všem firmám a kontrolám."}
          action={<UserDialog role={role} triggerLabel={role === "agent" ? "Přidat agenta" : "Přidat správce"} />}
        />
        {users.length === 0 ? (
          <EmptyState title="Zatím nikdo" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Jméno</Th>
                <Th>Kontakt</Th>
                {role === "agent" && <Th className="text-right">Rozpracované</Th>}
                {role === "agent" && <Th className="text-right">Odevzdané</Th>}
                <Th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <Td className="font-medium">
                    {u.full_name} {!u.active && <Badge tone="bad">deaktivovaný</Badge>}
                  </Td>
                  <Td className="text-ink-600">
                    {u.email}
                    {u.phone && <span className="block text-xs">{u.phone}</span>}
                  </Td>
                  {role === "agent" && <Td className="tabular text-right">{stats.get(u.id)?.open ?? 0}</Td>}
                  {role === "agent" && <Td className="tabular text-right">{stats.get(u.id)?.done ?? 0}</Td>}
                  <Td className="text-right">
                    <UserDialog role={role} user={u} triggerLabel="Upravit" />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
