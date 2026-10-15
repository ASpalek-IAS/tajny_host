import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDays, todayISO } from "@/lib/format";
import type { ScheduleInterval } from "@/lib/types";

type Period = { start: string; end: string };

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}
function d(isoStr: string) {
  return new Date(isoStr + "T00:00:00Z");
}

function periodContaining(interval: ScheduleInterval, day: string): Period {
  const x = d(day);
  if (interval === "weekly") {
    const dow = (x.getUTCDay() + 6) % 7; // pondělí = 0
    const start = addDays(day, -dow);
    return { start, end: addDays(start, 6) };
  }
  const months = interval === "monthly" ? 1 : 3;
  const m0 = interval === "monthly" ? x.getUTCMonth() : Math.floor(x.getUTCMonth() / 3) * 3;
  const start = new Date(Date.UTC(x.getUTCFullYear(), m0, 1));
  const end = new Date(Date.UTC(x.getUTCFullYear(), m0 + months, 0));
  return { start: iso(start), end: iso(end) };
}

const LEAD_DAYS: Record<ScheduleInterval, number> = { weekly: 7, monthly: 14, quarterly: 21 };

/**
 * Období, pro která má plán mít kontrolu: od začátku plánu, ale ne zpětně
 * (období, které už skončilo, se nevytváří) a nejvýše s předstihem LEAD_DAYS.
 */
export function duePeriods(
  interval: ScheduleInterval,
  startDate: string,
  endDate: string | null,
  today = todayISO(),
): Period[] {
  const horizon = addDays(today, LEAD_DAYS[interval]);
  const out: Period[] = [];
  let p = periodContaining(interval, startDate);
  for (let guard = 0; guard < 500 && p.start <= horizon; guard++) {
    const win = {
      start: p.start < startDate ? startDate : p.start,
      end: endDate && p.end > endDate ? endDate : p.end,
    };
    if (endDate && win.start > endDate) break;
    if (win.end >= today) out.push(win);
    p = periodContaining(interval, addDays(p.end, 1));
  }
  return out;
}

/** Vytvoří chybějící kontroly podle plánů. Vrací id nových kontrol s agentem. */
export async function generateScheduled(scheduleId?: string): Promise<{ created: number; assigned: string[] }> {
  const db = createAdminClient();
  let q = db.from("schedules").select("*").eq("active", true);
  if (scheduleId) q = q.eq("id", scheduleId);
  const { data: schedules } = await q;
  let created = 0;
  const assigned: string[] = [];

  for (const s of schedules ?? []) {
    const periods = duePeriods(s.interval, s.start_date, s.end_date);
    if (periods.length === 0 || (s.branch_ids ?? []).length === 0) continue;
    const { data: existing } = await db
      .from("inspections")
      .select("branch_id,window_start")
      .eq("schedule_id", s.id)
      .in("window_start", periods.map((p) => p.start));
    const have = new Set((existing ?? []).map((e) => `${e.branch_id}|${e.window_start}`));
    const { data: activeBranches } = await db
      .from("branches")
      .select("id")
      .in("id", s.branch_ids)
      .eq("active", true);
    for (const p of periods) {
      for (const b of activeBranches ?? []) {
        if (have.has(`${b.id}|${p.start}`)) continue;
        const { data: id, error } = await db.rpc("create_inspection", {
          p_template: s.template_id,
          p_branch: b.id,
          p_window_start: p.start,
          p_window_end: p.end,
          p_agent: s.default_agent_id,
          p_title: s.name,
          p_instructions: s.instructions,
          p_schedule: s.id,
        });
        if (error) {
          if (!error.message.includes("duplicate")) console.error("Generování kontroly selhalo", s.id, error.message);
          continue;
        }
        created++;
        if (s.default_agent_id) assigned.push(id as string);
      }
    }
  }
  return { created, assigned };
}
