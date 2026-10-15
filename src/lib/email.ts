import "server-only";

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Mystery Shopping";
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");

export function emailEnabled() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/** Jednoduchá HTML šablona e-mailu. Odstavce jsou čistý text. */
export function layout({
  heading,
  paragraphs,
  button,
  footer,
}: {
  heading: string;
  paragraphs: string[];
  button?: { label: string; url: string };
  footer?: string;
}) {
  const ps = paragraphs
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#2b2926">${esc(p)}</p>`)
    .join("");
  const btn = button
    ? `<p style="margin:22px 0"><a href="${button.url}" style="display:inline-block;background:#136f61;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:11px 20px;border-radius:8px">${esc(button.label)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f7f7f5;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #e2e0db;border-radius:12px">
<tr><td style="padding:26px 28px 6px;font-size:13px;font-weight:600;color:#136f61;letter-spacing:.02em">${esc(APP_NAME)}</td></tr>
<tr><td style="padding:6px 28px 24px">
<h1 style="margin:0 0 16px;font-size:20px;color:#1b1a18">${esc(heading)}</h1>${ps}${btn}
<p style="margin:18px 0 0;font-size:12px;color:#77736b">${esc(footer ?? "Tento e-mail byl odeslán automaticky.")}</p>
</td></tr></table></td></tr></table></body></html>`;
}

export async function sendEmail(opts: { to: string | string[]; subject: string; html: string }) {
  const to = (Array.isArray(opts.to) ? opts.to : [opts.to]).filter(Boolean);
  if (to.length === 0) return { ok: true, skipped: true };
  if (!emailEnabled()) {
    console.info(`[e-mail vypnutý] ${opts.subject} -> ${to.join(", ")}`);
    return { ok: true, skipped: true };
  }
  try {
    // Resend posílá max. 50 příjemců na e-mail – posíláme každému zvlášť kvůli soukromí.
    const results = await Promise.all(
      to.map((addr) =>
        fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ from: process.env.EMAIL_FROM, to: addr, subject: opts.subject, html: opts.html }),
        }),
      ),
    );
    const failed = results.filter((r) => !r.ok);
    if (failed.length) {
      console.error("Resend chyba", failed[0].status, await failed[0].text());
      return { ok: false };
    }
    return { ok: true };
  } catch (e) {
    console.error("Odeslání e-mailu selhalo", e);
    return { ok: false };
  }
}
