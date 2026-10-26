import Link from "next/link";
import { Card, EmptyState, LinkButton, PageHeader, ScoreBadge, Table, Td, Th } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/format";

type SP = { provozovna?: string; od?: string; do?: string };

export default async function ClientInspections({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const db = await createClient();
  const { data: branches } = await db.from("branches").select("id,name").order("name");
  let q = db.from("client_inspections").select("*").eq("status", "done");
  if (sp.provozovna) q = q.eq("branch_id", sp.provozovna);
  const { data } = await q.order("visit_at", { ascending: false, nullsFirst: false }).limit(500);
  const day = (r: { visit_at: string | null; window_start: string }) => (r.visit_at ?? r.window_start).slice(0, 10);
  const rows = (data ?? []).filter((r) => (!sp.od || day(r) >= sp.od) && (!sp.do || day(r) <= sp.do));
  const exportQs = new URLSearchParams(Object.entries({ provozovna: sp.provozovna, od: sp.od, do: sp.do }).filter(([, v]) => v) as [string, string][]);

  return (
    <>
      <PageHeader
        title="Kontroly"
        actions={
          <LinkButton variant="secondary" href={`/api/export?${exportQs.toString()}`} prefetch={false}>
            Export do Excelu
          </LinkButton>
        }
      />
      <form className="filters mb-4">
        <label>
          <span className="label">Provozovna</span>
          <select name="provozovna" defaultValue={sp.provozovna ?? ""} className="input w-52">
            <option value="">Všechny</option>
            {(branches ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Od</span>
          <input type="date" name="od" defaultValue={sp.od ?? ""} className="input" />
        </label>
        <label>
          <span className="label">Do</span>
          <input type="date" name="do" defaultValue={sp.do ?? ""} className="input" />
        </label>
        <button className="rounded-lg bg-ink-800 px-3.5 py-2 text-sm font-medium text-white">Filtrovat</button>
      </form>
      <Card>
        {rows.length === 0 ? (
          <EmptyState title="Zatím žádné výsledky kontrol" />
        ) : (
          <Table fit>
            <thead>
              <tr>
                <Th>Provozovna</Th>
                <Th>Datum návštěvy</Th>
                <Th className="text-right">Skóre</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-ink-50">
                  <Td>
                    <Link href={`/klient/kontroly/${r.id}`} className="font-medium hover:text-brand-700">
                      {r.branch_name}
                    </Link>
                    <p className="text-xs text-ink-500">{r.template_name ?? r.title}</p>
                  </Td>
                  <Td className="whitespace-nowrap">{fmtDate(day(r))}</Td>
                  <Td className="text-right">
                    <ScoreBadge score={r.score} />
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
