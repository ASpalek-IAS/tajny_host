import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { loadReportRows, rowDate, type ReportRow } from "@/lib/reports";
import { formatAnswer } from "@/lib/answer-format";
import type { Question } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type Q = Question & { inspection_id: string; topic: { title: string; position: number } | null };

export async function GET(req: NextRequest) {
  const profile = await getProfile();
  if (!profile || profile.role === "agent") return new NextResponse("Nemáte oprávnění", { status: 403 });
  const sp = req.nextUrl.searchParams;
  const db = await createClient();
  const isClient = profile.role === "client";

  const rows = await loadReportRows(db, isClient, {
    company: isClient ? undefined : sp.get("firma") ?? undefined,
    branch: sp.get("provozovna") ?? undefined,
    template: sp.get("dotaznik") ?? undefined,
    from: sp.get("od") ?? undefined,
    to: sp.get("do") ?? undefined,
  });
  rows.sort((a, b) => rowDate(a).localeCompare(rowDate(b)));
  const ids = rows.map((r) => r.id);

  const questions: Q[] = [];
  const answers = new Map<string, { value: unknown; comment: string | null }>();
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const [{ data: qs }, { data: as }] = await Promise.all([
      db.from("inspection_questions").select("*,topic:inspection_topics(title,position)").in("inspection_id", chunk),
      db.from("answers").select("question_id,value,comment").in("inspection_id", chunk),
    ]);
    questions.push(...((qs ?? []) as Q[]));
    for (const a of as ?? []) answers.set(a.question_id, { value: a.value, comment: a.comment });
  }

  const { data: tpls } = await db.from("templates").select("id,name");
  const tName = new Map((tpls ?? []).map((t) => [t.id as string, t.name as string]));

  const wb = new ExcelJS.Workbook();
  wb.creator = process.env.NEXT_PUBLIC_APP_NAME || "Mystery Shopping";
  const headStyle = (ws: ExcelJS.Worksheet) => {
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEEEB" } };
    ws.views = [{ state: "frozen", ySplit: 1 }];
  };

  // Souhrn
  const sum = wb.addWorksheet("Souhrn");
  sum.columns = [
    ...(isClient ? [] : [{ header: "Firma", key: "company", width: 24 }]),
    { header: "Provozovna", key: "branch", width: 28 },
    { header: "Dotazník", key: "template", width: 26 },
    { header: "Kontrola", key: "title", width: 26 },
    { header: "Datum návštěvy", key: "date", width: 15 },
    { header: "Skóre %", key: "score", width: 10 },
  ];
  for (const r of rows) {
    sum.addRow({
      company: r.company_name,
      branch: r.branch_name,
      template: r.template_id ? tName.get(r.template_id) : "",
      title: r.title,
      date: new Date(rowDate(r) + "T12:00:00"),
      score: r.score === null ? null : Number(r.score),
    });
  }
  sum.getColumn("date").numFmt = "d.m.yyyy";
  headStyle(sum);

  // List pro každý dotazník: řádek = kontrola, sloupec = otázka
  const byTemplate = new Map<string, ReportRow[]>();
  for (const r of rows) {
    const k = r.template_id ?? "bez";
    byTemplate.set(k, [...(byTemplate.get(k) ?? []), r]);
  }
  const usedNames = new Set<string>(["Souhrn", "Komentáře"]);
  for (const [tid, trows] of byTemplate) {
    let name = (tName.get(tid) ?? "Dotazník").replace(/[\\/*?:[\]]/g, " ").slice(0, 28);
    while (usedNames.has(name)) name = name.slice(0, 26) + "_" + usedNames.size;
    usedNames.add(name);
    const ws = wb.addWorksheet(name);
    const inspIds = new Set(trows.map((r) => r.id));
    const qs = questions.filter((q) => inspIds.has(q.inspection_id));
    // sloupce podle tématu a textu otázky (kopie otázek se mohou lišit id)
    const cols = new Map<string, { key: string; header: string; order: [number, number] }>();
    for (const q of qs) {
      const key = `${q.topic?.title}|${q.text}`;
      if (!cols.has(key))
        cols.set(key, { key, header: `${q.topic?.title}: ${q.text}`, order: [q.topic?.position ?? 0, q.position] });
    }
    const topicTitles = [...new Set(trows.flatMap((r) => (r.topic_scores ?? []).map((t) => t.title)))];
    const qCols = [...cols.values()].sort((a, b) => a.order[0] - b.order[0] || a.order[1] - b.order[1]);
    ws.columns = [
      { header: "Provozovna", key: "branch", width: 26 },
      { header: "Datum návštěvy", key: "date", width: 15 },
      { header: "Celkem %", key: "score", width: 10 },
      ...topicTitles.map((t) => ({ header: `${t} %`, key: `t:${t}`, width: 12 })),
      ...qCols.map((c) => ({ header: c.header, key: c.key, width: 22 })),
    ];
    for (const r of trows) {
      const row: Record<string, unknown> = {
        branch: r.branch_name,
        date: new Date(rowDate(r) + "T12:00:00"),
        score: r.score === null ? null : Number(r.score),
      };
      for (const t of r.topic_scores ?? []) row[`t:${t.title}`] = t.score === null ? null : Number(t.score);
      for (const q of qs.filter((x) => x.inspection_id === r.id)) {
        const a = answers.get(q.id);
        row[`${q.topic?.title}|${q.text}`] = q.type === "file" ? "" : formatAnswer(q, a?.value);
      }
      ws.addRow(row);
    }
    ws.getColumn("date").numFmt = "d.m.yyyy";
    ws.getRow(1).alignment = { wrapText: true, vertical: "top" };
    ws.getRow(1).height = 48;
    headStyle(ws);
  }

  // Komentáře
  const cm = wb.addWorksheet("Komentáře");
  cm.columns = [
    { header: "Provozovna", key: "branch", width: 26 },
    { header: "Datum", key: "date", width: 12 },
    { header: "Téma", key: "topic", width: 20 },
    { header: "Otázka", key: "q", width: 40 },
    { header: "Odpověď", key: "a", width: 18 },
    { header: "Komentář", key: "c", width: 60 },
  ];
  const rowById = new Map(rows.map((r) => [r.id, r]));
  for (const q of questions) {
    const a = answers.get(q.id);
    if (!a?.comment) continue;
    const r = rowById.get(q.inspection_id)!;
    cm.addRow({ branch: r.branch_name, date: new Date(rowDate(r) + "T12:00:00"), topic: q.topic?.title, q: q.text, a: formatAnswer(q, a.value), c: a.comment });
  }
  cm.getColumn("date").numFmt = "d.m.yyyy";
  headStyle(cm);

  const buf = await wb.xlsx.writeBuffer();
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="kontroly-${date}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
