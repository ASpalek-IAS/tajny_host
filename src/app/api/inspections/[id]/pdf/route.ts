import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { loadInspectionContent } from "@/lib/inspection-data";
import { renderReportPdf } from "@/lib/pdf/report";
import { APP_NAME } from "@/lib/email";

export const runtime = "nodejs";
export const maxDuration = 60;

async function fetchBuffer(url: string | null) {
  if (!url) return null;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch {
    return null;
  }
}

function slug(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const profile = await getProfile();
  if (!profile || profile.role === "agent") return new NextResponse("Nemáte oprávnění", { status: 403 });
  const db = await createClient();

  let base: {
    title: string;
    visit_at: string | null;
    approved_at: string | null;
    score: number | null;
    approved: boolean;
    branch_name: string;
    branch_address: string | null;
    company_id: string;
  } | null = null;

  if (profile.role === "admin") {
    const { data } = await db
      .from("inspections")
      .select("title,visit_at,approved_at,score,status,company_id,branch:branches(name,address)")
      .eq("id", id)
      .maybeSingle();
    if (data) {
      const b = data.branch as unknown as { name: string; address: string | null };
      base = { ...data, approved: data.status === "approved", branch_name: b.name, branch_address: b.address };
    }
  } else {
    const { data } = await db.from("client_inspections").select("*").eq("id", id).eq("status", "done").maybeSingle();
    if (data) base = { ...data, approved: true };
  }
  if (!base) return new NextResponse("Kontrola nenalezena", { status: 404 });

  const [{ data: company }, content] = await Promise.all([
    db.from("companies").select("name,logo_url").eq("id", base.company_id).single(),
    loadInspectionContent(db, id),
  ]);

  const imgs = content.attachments.filter((a) => a.mime_type === "image/jpeg" || a.mime_type === "image/png");
  const buffers = await Promise.all(imgs.map((a) => fetchBuffer(a.url)));
  const images: Record<string, Buffer> = {};
  imgs.forEach((a, i) => {
    if (buffers[i]) images[a.id] = buffers[i]!;
  });
  const logoUrl = company?.logo_url && /\.(png|jpe?g)$/i.test(company.logo_url) ? company.logo_url : null;

  const pdf = await renderReportPdf({
    appName: APP_NAME,
    companyName: company?.name ?? "",
    logo: await fetchBuffer(logoUrl),
    branchName: base.branch_name,
    branchAddress: base.branch_address,
    title: base.title,
    visitAt: base.visit_at,
    approvedAt: base.approved_at,
    score: base.score,
    approved: base.approved,
    content,
    images,
  });

  const date = (base.visit_at ?? new Date().toISOString()).slice(0, 10);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="kontrola-${slug(base.branch_name)}-${date}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
