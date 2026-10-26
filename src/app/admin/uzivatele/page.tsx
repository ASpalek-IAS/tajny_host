import { Badge, Card, CardHeader, EmptyState, Notice, PageHeader, Table, Tabs, Td, Th } from "@/components/ui";
import { UserDialog } from "@/app/admin/user-form";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth";
import type { Profile, Role } from "@/lib/types";

const TABS: { key: string; role: Role; label: string; title: string; sub: string; add: string }[] = [
  { key: "agenti", role: "agent", label: "Agenti", title: "Agenti", sub: "Vidí jen kontroly, které jim přiřadíte.", add: "Přidat agenta" },
  {
    key: "kontrolori",
    role: "controller",
    label: "Kontroloři",
    title: "Kontroloři",
    sub: "Plánují kontroly, přiřazují agenty, kontrolují a schvalují výsledky. Nemění šablony ani otázky a nevidí účetnictví.",
    add: "Přidat kontrolora",
  },
  { key: "spravci", role: "admin", label: "Správci", title: "Správci", sub: "Mají plný přístup ke všem firmám a kontrolám.", add: "Přidat správce" },
];

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const me = await requireStaff();
  const isAdmin = me.role === "admin";
  const { tab: tabKey = "agenti" } = await searchParams;
  // kontrolor pracuje jen s agenty
  const tab = (isAdmin && TABS.find((t) => t.key === tabKey)) || TABS[0];
  const role = tab.role;
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
      <PageHeader title={isAdmin ? "Agenti a správci" : "Agenti"} />
      {isAdmin ? (
        <Tabs active={tab.key} tabs={TABS.map((t) => ({ key: t.key, label: t.label, href: `/admin/uzivatele?tab=${t.key}` }))} />
      ) : (
        <div className="mb-6">
          <Notice>
            Jako kontrolor vidíte a spravujete jen agenty. Kontrolory a správce může zobrazit a upravovat pouze správce.
          </Notice>
        </div>
      )}
      <Card>
        <CardHeader title={tab.title} sub={tab.sub} action={<UserDialog role={role} triggerLabel={tab.add} />} />
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
