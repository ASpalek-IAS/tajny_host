import { Card, CardHeader, LinkButton, PageHeader, Stat } from "@/components/ui";
import { InspectionTable, INSPECTION_LIST_SELECT, type InspectionListRow } from "@/components/inspection-table";
import { createClient } from "@/lib/supabase/server";
import { addDays, fmtScore, todayISO } from "@/lib/format";

export default async function AdminHome() {
  const db = await createClient();
  const today = todayISO();
  const weekEnd = addDays(today, 7);
  const monthStart = today.slice(0, 8) + "01";

  const [submitted, overdue, upcoming, approvedMonth] = await Promise.all([
    db.from("inspections").select(INSPECTION_LIST_SELECT).eq("status", "submitted").order("submitted_at"),
    db
      .from("inspections")
      .select(INSPECTION_LIST_SELECT)
      .in("status", ["planned", "assigned", "in_progress", "returned"])
      .lt("window_end", today)
      .order("window_end"),
    db
      .from("inspections")
      .select(INSPECTION_LIST_SELECT)
      .in("status", ["planned", "assigned", "in_progress", "returned"])
      .gte("window_end", today)
      .lte("window_start", weekEnd)
      .order("window_end")
      .limit(30),
    db.from("inspections").select("score").eq("status", "approved").gte("approved_at", monthStart),
  ]);

  const scores = (approvedMonth.data ?? []).map((r) => r.score).filter((s): s is number => s !== null);
  const avg = scores.length ? scores.reduce((a, b) => a + Number(b), 0) / scores.length : null;
  const unassigned = (upcoming.data ?? []).filter((r) => r.status === "planned").length;

  return (
    <>
      <PageHeader
        title="Přehled"
        actions={
          <>
            <LinkButton href="/admin/kontroly/nova">Naplánovat kontrolu</LinkButton>
          </>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Ke schválení" value={submitted.data?.length ?? 0} />
        <Stat label="Po termínu" value={overdue.data?.length ?? 0} />
        <Stat label="Nadcházející 7 dní" value={upcoming.data?.length ?? 0} sub={unassigned ? `${unassigned} bez agenta` : "všechny přiřazené"} />
        <Stat label="Schváleno tento měsíc" value={scores.length} sub={`průměr ${fmtScore(avg)}`} />
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader title="Čeká na schválení" />
          <InspectionTable rows={(submitted.data ?? []) as unknown as InspectionListRow[]} hrefBase="/admin/kontroly" empty="Nic nečeká na schválení" />
        </Card>
        {(overdue.data?.length ?? 0) > 0 && (
          <Card>
            <CardHeader title="Po termínu" sub="Kontroly, jejichž termín už uplynul a nejsou odeslané" />
            <InspectionTable rows={(overdue.data ?? []) as unknown as InspectionListRow[]} hrefBase="/admin/kontroly" />
          </Card>
        )}
        <Card>
          <CardHeader title="Nadcházející 7 dní" />
          <InspectionTable rows={(upcoming.data ?? []) as unknown as InspectionListRow[]} hrefBase="/admin/kontroly" empty="Žádné kontroly v nejbližších dnech" />
        </Card>
      </div>
    </>
  );
}
