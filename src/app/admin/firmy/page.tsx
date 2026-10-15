import Link from "next/link";
import { Badge, Card, EmptyState, LinkButton, PageHeader, Table, Td, Th } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export default async function CompaniesPage() {
  const db = await createClient();
  const { data } = await db
    .from("companies")
    .select("id,name,ico,active,contact_name,branches(count),profiles(count),inspections(count)")
    .order("name");
  const rows = (data ?? []) as unknown as {
    id: string;
    name: string;
    ico: string | null;
    active: boolean;
    contact_name: string | null;
    branches: { count: number }[];
    profiles: { count: number }[];
    inspections: { count: number }[];
  }[];
  return (
    <>
      <PageHeader title="Firmy" sub="Klienti agentury" actions={<LinkButton href="/admin/firmy/nova">Nová firma</LinkButton>} />
      <Card>
        {rows.length === 0 ? (
          <EmptyState title="Zatím žádné firmy">Začněte založením první firmy.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Firma</Th>
                <Th>Kontakt</Th>
                <Th className="text-right">Provozovny</Th>
                <Th className="text-right">Uživatelé</Th>
                <Th className="text-right">Kontroly</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="hover:bg-ink-50">
                  <Td>
                    <Link href={`/admin/firmy/${c.id}`} className="font-medium hover:text-brand-700">
                      {c.name}
                    </Link>{" "}
                    {!c.active && <Badge>neaktivní</Badge>}
                    {c.ico && <p className="text-xs text-ink-500">IČO {c.ico}</p>}
                  </Td>
                  <Td className="text-ink-600">{c.contact_name ?? "—"}</Td>
                  <Td className="tabular text-right">{c.branches[0]?.count ?? 0}</Td>
                  <Td className="tabular text-right">{c.profiles[0]?.count ?? 0}</Td>
                  <Td className="tabular text-right">{c.inspections[0]?.count ?? 0}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
