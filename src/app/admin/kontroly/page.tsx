import Link from "next/link";
import { Card, LinkButton, PageHeader, cx } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/client-ui";
import { InspectionTable, INSPECTION_LIST_SELECT, isOverdue, type InspectionListRow } from "@/components/inspection-table";
import { createClient } from "@/lib/supabase/server";
import { bulkAssign } from "@/app/admin/actions/inspections";
import { STATUS_LABEL, type InspectionStatus } from "@/lib/types";
import { addDays, todayISO } from "@/lib/format";

type SP = { firma?: string; agent?: string; stav?: string; od?: string; do?: string; pohled?: string; mesic?: string };

export default async function InspectionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const db = await createClient();
  const view = sp.pohled === "kalendar" ? "kalendar" : "seznam";

  const [{ data: companies }, { data: agents }] = await Promise.all([
    db.from("companies").select("id,name").order("name"),
    db.from("profiles").select("id,full_name").eq("role", "agent").order("full_name"),
  ]);

  let q = db.from("inspections").select(INSPECTION_LIST_SELECT);
  if (sp.firma) q = q.eq("company_id", sp.firma);
  if (sp.agent === "none") q = q.is("agent_id", null);
  else if (sp.agent) q = q.eq("agent_id", sp.agent);
  if (sp.stav === "overdue") q = q.in("status", ["planned", "assigned", "in_progress", "returned"]).lt("window_end", todayISO());
  else if (sp.stav === "open") q = q.in("status", ["planned", "assigned", "in_progress", "returned", "submitted"]);
  else if (sp.stav) q = q.eq("status", sp.stav);
  else q = q.neq("status", "cancelled");

  const month = sp.mesic ?? todayISO().slice(0, 7);
  if (view === "kalendar") {
    const start = `${month}-01`;
    const [y, m] = month.split("-").map(Number);
    const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    q = q.lte("window_start", end).gte("window_end", start);
  } else {
    if (sp.od) q = q.gte("window_end", sp.od);
    if (sp.do) q = q.lte("window_start", sp.do);
  }
  const { data } = await q.order("window_start", { ascending: view === "kalendar" }).limit(500);
  const rows = (data ?? []) as unknown as InspectionListRow[];

  const qs = (patch: Partial<SP>) => {
    const p = new URLSearchParams();
    Object.entries({ ...sp, ...patch }).forEach(([k, v]) => v && p.set(k, v));
    return `/admin/kontroly?${p.toString()}`;
  };

  return (
    <>
      <PageHeader title="Kontroly" actions={<LinkButton href="/admin/kontroly/nova">Naplánovat kontrolu</LinkButton>} />

      <form className="mb-4 flex flex-wrap items-end gap-3" action="/admin/kontroly">
        <input type="hidden" name="pohled" value={view} />
        {view === "kalendar" && <input type="hidden" name="mesic" value={month} />}
        <label>
          <span className="label">Firma</span>
          <select name="firma" defaultValue={sp.firma ?? ""} className="input w-48">
            <option value="">Všechny</option>
            {(companies ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Agent</span>
          <select name="agent" defaultValue={sp.agent ?? ""} className="input w-44">
            <option value="">Všichni</option>
            <option value="none">Bez agenta</option>
            {(agents ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.full_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Stav</span>
          <select name="stav" defaultValue={sp.stav ?? ""} className="input w-44">
            <option value="">Vše kromě zrušených</option>
            <option value="open">Nedokončené</option>
            <option value="overdue">Po termínu</option>
            {(Object.keys(STATUS_LABEL) as InspectionStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        {view === "seznam" && (
          <>
            <label>
              <span className="label">Od</span>
              <input type="date" name="od" defaultValue={sp.od ?? ""} className="input" />
            </label>
            <label>
              <span className="label">Do</span>
              <input type="date" name="do" defaultValue={sp.do ?? ""} className="input" />
            </label>
          </>
        )}
        <button className="rounded-lg bg-ink-800 px-3.5 py-2 text-sm font-medium text-white">Filtrovat</button>
        <div className="ml-auto flex rounded-lg border border-ink-200 bg-white p-0.5 text-sm">
          {(["seznam", "kalendar"] as const).map((v) => (
            <Link
              key={v}
              href={qs({ pohled: v })}
              className={cx("rounded-md px-3 py-1.5", view === v ? "bg-ink-100 font-medium" : "text-ink-500")}
            >
              {v === "seznam" ? "Seznam" : "Kalendář"}
            </Link>
          ))}
        </div>
      </form>

      {view === "seznam" ? (
        <>
          <ActionForm action={bulkAssign} id="bulk-form" className="mb-3">
            <div id="bulk" className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-ink-500">Vybraným kontrolám přiřadit agenta:</span>
              <select name="agent_id" className="input w-48">
                <option value="">— odebrat agenta —</option>
                {(agents ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.full_name}
                  </option>
                ))}
              </select>
              <SubmitButton variant="secondary" size="sm">
                Přiřadit
              </SubmitButton>
            </div>
          </ActionForm>
          <Card>
            <InspectionTable rows={rows} hrefBase="/admin/kontroly" selectable />
          </Card>
          {rows.length >= 500 && <p className="mt-2 text-xs text-ink-500">Zobrazeno prvních 500 kontrol – upřesněte filtr.</p>}
        </>
      ) : (
        <Calendar rows={rows} month={month} prevHref={qs({ mesic: shiftMonth(month, -1) })} nextHref={qs({ mesic: shiftMonth(month, 1) })} />
      )}
    </>
  );
}

function shiftMonth(ym: string, d: number) {
  const [y, m] = ym.split("-").map(Number);
  const x = new Date(Date.UTC(y, m - 1 + d, 1));
  return x.toISOString().slice(0, 7);
}

function Calendar({ rows, month, prevHref, nextHref }: { rows: InspectionListRow[]; month: string; prevHref: string; nextHref: string }) {
  const [y, m] = month.split("-").map(Number);
  const first = `${month}-01`;
  const dow = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array(dow).fill(null), ...Array.from({ length: days }, (_, i) => addDays(first, i))];
  while (cells.length % 7) cells.push(null);
  const today = todayISO();
  const title = new Date(y, m - 1, 1).toLocaleDateString("cs-CZ", { month: "long", year: "numeric" });
  // Kontrola se zobrazí v den konce svého termínu (do kdy má být hotová)
  const byDay = new Map<string, InspectionListRow[]>();
  for (const r of rows) {
    const day = r.window_end < first ? first : r.window_end;
    byDay.set(day, [...(byDay.get(day) ?? []), r]);
  }
  const tone: Record<InspectionStatus, string> = {
    planned: "bg-ink-100 text-ink-700",
    assigned: "bg-sky-50 text-sky-800",
    in_progress: "bg-indigo-50 text-indigo-800",
    submitted: "bg-mid-bg text-mid",
    returned: "bg-bad-bg text-bad",
    approved: "bg-good-bg text-good",
    cancelled: "bg-ink-100 text-ink-400 line-through",
  };
  return (
    <Card>
      <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3">
        <Link href={prevHref} className="rounded-md px-2 py-1 text-ink-500 hover:bg-ink-100">
          ←
        </Link>
        <h2 className="font-semibold capitalize">{title}</h2>
        <Link href={nextHref} className="rounded-md px-2 py-1 text-ink-500 hover:bg-ink-100">
          →
        </Link>
      </div>
      <p className="px-5 pt-3 text-xs text-ink-500">Kontroly jsou zobrazené v poslední den svého termínu.</p>
      <div className="grid grid-cols-7 gap-px p-3 text-xs">
        {["Po", "Út", "St", "Čt", "Pá", "So", "Ne"].map((d) => (
          <div key={d} className="px-1.5 pb-1 font-medium text-ink-500">
            {d}
          </div>
        ))}
        {cells.map((c, i) => (
          <div key={i} className={cx("min-h-24 rounded-md border border-ink-100 p-1.5", !c && "border-transparent", c === today && "border-brand-500")}>
            {c && <p className="tabular mb-1 text-ink-500">{Number(c.slice(8))}.</p>}
            <div className="space-y-1">
              {(c ? (byDay.get(c) ?? []) : []).map((r) => (
                <Link
                  key={r.id}
                  href={`/admin/kontroly/${r.id}`}
                  className={cx("block truncate rounded px-1.5 py-0.5", tone[r.status], isOverdue(r) && "ring-1 ring-bad")}
                  title={`${r.company?.name} – ${r.branch?.name}`}
                >
                  {r.branch?.name}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
