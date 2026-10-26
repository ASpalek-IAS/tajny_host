import Link from "next/link";
import { EmptyState, ScoreBadge, StatusBadge, Table, Td, Th, cx } from "@/components/ui";
import { fmtWindow, todayISO } from "@/lib/format";
import type { InspectionStatus } from "@/lib/types";

export type InspectionListRow = {
  id: string;
  title: string;
  status: InspectionStatus;
  window_start: string;
  window_end: string;
  score: number | null;
  company: { name: string } | null;
  branch: { name: string } | null;
  agent: { full_name: string } | null;
  template?: { name: string } | null;
};

export const INSPECTION_LIST_SELECT =
  "id,title,status,window_start,window_end,score,company:companies(name),branch:branches(name),agent:profiles!inspections_agent_id_fkey(full_name),template:templates(name)";

export function isOverdue(r: { status: InspectionStatus; window_end: string }) {
  return ["planned", "assigned", "in_progress", "returned"].includes(r.status) && r.window_end < todayISO();
}

export function InspectionTable({
  rows,
  hrefBase,
  showCompany = true,
  showAgent = true,
  selectable,
  empty = "Žádné kontroly",
}: {
  rows: InspectionListRow[];
  hrefBase: string;
  showCompany?: boolean;
  showAgent?: boolean;
  selectable?: boolean;
  empty?: string;
}) {
  if (rows.length === 0) return <EmptyState title={empty} />;
  return (
    <Table>
      <thead>
        <tr>
          {selectable && <Th className="w-8" />}
          <Th>Kontrola</Th>
          <Th>Termín</Th>
          {showAgent && <Th>Agent</Th>}
          <Th>Stav</Th>
          <Th className="text-right">Skóre</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="hover:bg-ink-50">
            {selectable && (
              <Td>
                <input
                  type="checkbox"
                  name="ids"
                  value={r.id}
                  form="bulk-form"
                  disabled={!["planned", "assigned"].includes(r.status)}
                  aria-label="Vybrat"
                />
              </Td>
            )}
            <Td>
              <Link href={`${hrefBase}/${r.id}`} className="font-medium text-ink-900 hover:text-brand-700">
                {showCompany ? `${r.company?.name} – ${r.branch?.name}` : r.branch?.name}
              </Link>
              <p className="text-xs text-ink-500">{r.template?.name ?? r.title}</p>
            </Td>
            <Td className={cx("whitespace-nowrap", isOverdue(r) && "font-medium text-bad")}>
              {fmtWindow(r.window_start, r.window_end)}
              {isOverdue(r) && <span className="block text-xs">po termínu</span>}
            </Td>
            {showAgent && <Td className="whitespace-nowrap text-ink-700">{r.agent?.full_name ?? <span className="text-ink-400">nepřiřazeno</span>}</Td>}
            <Td>
              <StatusBadge status={r.status} />
            </Td>
            <Td className="text-right">{r.status === "approved" ? <ScoreBadge score={r.score} /> : null}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
