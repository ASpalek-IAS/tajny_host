import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateScheduled } from "@/lib/schedule";
import { notifyAssigned } from "@/lib/notify";
import { layout, sendEmail, SITE_URL } from "@/lib/email";
import { addDays, fmtScore, fmtWindow, todayISO } from "@/lib/format";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Denní úlohy (Vercel Cron, viz vercel.json):
 * 1. vytvoří kontroly podle plánů opakování
 * 2. připomene agentům blížící se termín
 * 3. upozorní na kontroly po termínu
 * 4. 1. den v měsíci pošle klientům souhrn za minulý měsíc
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const db = createAdminClient();
  const today = todayISO();
  const report: Record<string, number> = {};

  // 1. plány opakování
  const gen = await generateScheduled();
  await notifyAssigned(gen.assigned);
  report.generated = gen.created;

  // 2. připomínky 2 dny před koncem termínu
  const { data: soon } = await db
    .from("inspections")
    .select("id,window_start,window_end,agent:profiles!inspections_agent_id_fkey(email,active),branch:branches(name),company:companies(name)")
    .in("status", ["assigned", "in_progress", "returned"])
    .lte("window_end", addDays(today, 2))
    .gte("window_end", today)
    .is("reminder_sent_at", null);
  for (const r of (soon ?? []) as unknown as Row[]) {
    if (r.agent?.active) {
      await sendEmail({
        to: r.agent.email,
        subject: `Připomínka: kontrola ${r.company?.name} – ${r.branch?.name}`,
        html: layout({
          heading: "Blíží se termín kontroly",
          paragraphs: [`Kontrolu ${r.company?.name} – ${r.branch?.name} je potřeba provést a odeslat do ${fmtWindow(r.window_end, r.window_end)}.`],
          button: { label: "Otevřít kontrolu", url: `${SITE_URL}/agent/kontroly/${r.id}` },
        }),
      });
    }
    await db.from("inspections").update({ reminder_sent_at: new Date().toISOString() }).eq("id", r.id);
  }
  report.reminders = soon?.length ?? 0;

  // 3. po termínu
  const { data: late } = await db
    .from("inspections")
    .select("id,window_start,window_end,agent:profiles!inspections_agent_id_fkey(email,active,full_name),branch:branches(name),company:companies(name)")
    .in("status", ["planned", "assigned", "in_progress", "returned"])
    .lt("window_end", today)
    .is("overdue_sent_at", null);
  const lateRows = (late ?? []) as unknown as Row[];
  for (const r of lateRows) {
    if (r.agent?.active) {
      await sendEmail({
        to: r.agent.email,
        subject: `Kontrola po termínu: ${r.company?.name} – ${r.branch?.name}`,
        html: layout({
          heading: "Kontrola je po termínu",
          paragraphs: [`Termín kontroly ${r.company?.name} – ${r.branch?.name} (${fmtWindow(r.window_start, r.window_end)}) už uplynul. Dokončete ji prosím co nejdříve, nebo kontaktujte správce.`],
          button: { label: "Otevřít kontrolu", url: `${SITE_URL}/agent/kontroly/${r.id}` },
        }),
      });
    }
    await db.from("inspections").update({ overdue_sent_at: new Date().toISOString() }).eq("id", r.id);
  }
  if (lateRows.length) {
    const { data: admins } = await db.from("profiles").select("email").in("role", ["admin", "controller"]).eq("active", true);
    await sendEmail({
      to: (admins ?? []).map((a) => a.email),
      subject: `${lateRows.length} ${lateRows.length === 1 ? "kontrola je" : "kontrol je"} po termínu`,
      html: layout({
        heading: "Kontroly po termínu",
        paragraphs: lateRows.map(
          (r) => `${r.company?.name} – ${r.branch?.name}: termín ${fmtWindow(r.window_start, r.window_end)}, agent ${r.agent?.full_name ?? "nepřiřazen"}`,
        ),
        button: { label: "Zobrazit kontroly po termínu", url: `${SITE_URL}/admin/kontroly?stav=overdue` },
      }),
    });
  }
  report.overdue = lateRows.length;

  // 4. měsíční souhrn pro klienty
  if (today.endsWith("-01")) report.digests = await monthlyDigest(today);

  return NextResponse.json({ ok: true, ...report });
}

type Row = {
  id: string;
  window_start: string;
  window_end: string;
  agent: { email: string; active: boolean; full_name?: string } | null;
  branch: { name: string } | null;
  company: { name: string } | null;
};

async function monthlyDigest(today: string) {
  const db = createAdminClient();
  const monthStart = addDays(today, -1).slice(0, 8) + "01";
  const { data: approved } = await db
    .from("inspections")
    .select("id,company_id,branch_id,score,branch:branches(name)")
    .eq("status", "approved")
    .gte("approved_at", monthStart)
    .lt("approved_at", today);
  if (!approved?.length) return 0;
  const { data: users } = await db
    .from("profiles")
    .select("email,company_id,all_branches,profile_branches(branch_id)")
    .eq("role", "client")
    .eq("active", true)
    .eq("notify_digest", true);
  const monthName = new Date(monthStart + "T12:00:00").toLocaleDateString("cs-CZ", { month: "long", year: "numeric" });
  let sent = 0;
  for (const u of users ?? []) {
    const allowed = new Set(((u.profile_branches ?? []) as { branch_id: string }[]).map((b) => b.branch_id));
    const mine = approved.filter((a) => a.company_id === u.company_id && (u.all_branches || allowed.has(a.branch_id)));
    if (!mine.length) continue;
    const scores = mine.map((m) => m.score).filter((s): s is number => s !== null).map(Number);
    const avg = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;
    await sendEmail({
      to: u.email,
      subject: `Souhrn kontrol za ${monthName}`,
      html: layout({
        heading: `Souhrn za ${monthName}`,
        paragraphs: [
          `Počet kontrol: ${mine.length}, průměrné skóre: ${fmtScore(avg)}.`,
          ...mine.map((m) => `${(m.branch as unknown as { name: string })?.name}: ${fmtScore(m.score)}`),
        ],
        button: { label: "Zobrazit přehled", url: `${SITE_URL}/klient` },
        footer: "Souhrn si můžete vypnout v nastavení svého účtu.",
      }),
    });
    sent++;
  }
  return sent;
}
