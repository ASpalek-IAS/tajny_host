import Link from "next/link";
import { Badge, Card, EmptyState, LinkButton, PageHeader, ScoreBadge, Table, Td, Th } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtWindow } from "@/lib/format";

type SP = { provozovna?: string; stav?: string; od?: string; do?: string };

export default async function ClientInspections({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const db = await createClient();
  const { data: branches } = await db.from("branches").select("id,name").order("name");
  let q = db.from("client_inspections").select("*");
  if (sp.provozovna) q = q.eq("branch_id", sp.provozovna);
  if (sp.stav === "done" || sp.stav === "planned") q = q.eq("status", sp.stav);
  if (sp.od) q = q.gte("window_end", sp.od);
  if (sp.do) q = q.lte("window_start", sp.do);
  const { data } = await q.order("window_start", { ascending: false }).limit(500);
  const rows = data ?? [];
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
      <form className="mb-4 flex flex-wrap items-end gap-3">
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
          <span className="label">Stav</span>
          <select name="stav" defaultValue={sp.stav ?? ""} className="input w-40">
            <option value="">Vše</option>
            <option value="done">Hotové</option>
            <option value="planned">Naplánované</option>
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
          <EmptyState title="Žádné kontroly" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Provozovna</Th>
                <Th>Termín</Th>
                <Th>Návštěva</Th>
                <Th>Stav</Th>
                <Th className="text-right">Skóre</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-ink-50">
                  <Td>
                    {r.status === "done" ? (
                      <Link href={`/klient/kontroly/${r.id}`} className="font-medium hover:text-brand-700">
                        {r.branch_name}
                      </Link>
                    ) : (
                      <span className="font-medium">{r.branch_name}</span>
                    )}
                    <p className="text-xs text-ink-500">{r.title}</p>
                  </Td>
                  <Td className="whitespace-nowrap">{fmtWindow(r.window_start, r.window_end)}</Td>
                  <Td className="whitespace-nowrap">{r.visit_at ? fmtDate(r.visit_at) : "—"}</Td>
                  <Td>{r.status === "done" ? <Badge tone="good">Hotová</Badge> : <Badge>Naplánovaná</Badge>}</Td>
                  <Td className="text-right">{r.status === "done" && <ScoreBadge score={r.score} />}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
