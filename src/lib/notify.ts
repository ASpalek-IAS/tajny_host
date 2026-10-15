import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { layout, sendEmail, SITE_URL, APP_NAME, emailEnabled } from "@/lib/email";
import { fmtScore, fmtWindow } from "@/lib/format";

type InspectionRow = {
  id: string;
  title: string;
  window_start: string;
  window_end: string;
  score: number | null;
  return_comment: string | null;
  branch_id: string;
  company_id: string;
  agent: { email: string; full_name: string; active: boolean } | null;
  branch: { name: string; address: string | null } | null;
  company: { name: string } | null;
};

async function loadInspections(ids: string[]) {
  const db = createAdminClient();
  const { data } = await db
    .from("inspections")
    .select(
      "id,title,window_start,window_end,score,return_comment,branch_id,company_id," +
        "agent:profiles!inspections_agent_id_fkey(email,full_name,active)," +
        "branch:branches(name,address),company:companies(name)",
    )
    .in("id", ids);
  return (data ?? []) as unknown as InspectionRow[];
}

async function adminEmails() {
  const db = createAdminClient();
  const { data } = await db.from("profiles").select("email").eq("role", "admin").eq("active", true);
  return (data ?? []).map((p) => p.email as string);
}

/** E-maily klientských uživatelů, kteří vidí danou provozovnu. */
export async function clientEmailsForBranch(companyId: string, branchId: string, digestOnly = false) {
  const db = createAdminClient();
  let q = db
    .from("profiles")
    .select("id,email,all_branches,notify_digest,profile_branches(branch_id)")
    .eq("role", "client")
    .eq("active", true)
    .eq("company_id", companyId);
  if (digestOnly) q = q.eq("notify_digest", true);
  const { data } = await q;
  return (data ?? [])
    .filter(
      (p) =>
        p.all_branches ||
        ((p.profile_branches as { branch_id: string }[]) ?? []).some((pb) => pb.branch_id === branchId),
    )
    .map((p) => p.email as string);
}

export async function notifyAssigned(ids: string[]) {
  if (ids.length === 0) return;
  const rows = await loadInspections(ids);
  // jeden e-mail na agenta
  const byAgent = new Map<string, InspectionRow[]>();
  for (const r of rows) {
    if (!r.agent?.active) continue;
    byAgent.set(r.agent.email, [...(byAgent.get(r.agent.email) ?? []), r]);
  }
  await Promise.all(
    [...byAgent.entries()].map(([email, list]) =>
      sendEmail({
        to: email,
        subject: list.length === 1 ? `Nová kontrola: ${list[0].company?.name} – ${list[0].branch?.name}` : `Máte ${list.length} nové kontroly`,
        html: layout({
          heading: list.length === 1 ? "Byla vám přiřazena kontrola" : `Bylo vám přiřazeno ${list.length} kontrol`,
          paragraphs: list.map(
            (r) =>
              `${r.company?.name} – ${r.branch?.name}${r.branch?.address ? ` (${r.branch.address})` : ""}, termín ${fmtWindow(r.window_start, r.window_end)}`,
          ),
          button: { label: "Otevřít moje kontroly", url: `${SITE_URL}/agent` },
        }),
      }),
    ),
  );
}

export async function notifySubmitted(id: string) {
  const [r] = await loadInspections([id]);
  if (!r) return;
  await sendEmail({
    to: await adminEmails(),
    subject: `Ke schválení: ${r.company?.name} – ${r.branch?.name}`,
    html: layout({
      heading: "Kontrola čeká na schválení",
      paragraphs: [
        `${r.agent?.full_name ?? "Agent"} odeslal kontrolu „${r.title}“ pro ${r.company?.name} – ${r.branch?.name}.`,
      ],
      button: { label: "Zkontrolovat a schválit", url: `${SITE_URL}/admin/kontroly/${r.id}` },
    }),
  });
}

export async function notifyReturned(id: string) {
  const [r] = await loadInspections([id]);
  if (!r?.agent) return;
  await sendEmail({
    to: r.agent.email,
    subject: `Kontrola vrácena k opravě: ${r.company?.name} – ${r.branch?.name}`,
    html: layout({
      heading: "Kontrola potřebuje opravu",
      paragraphs: [
        `Správce vrátil kontrolu „${r.title}“ (${r.company?.name} – ${r.branch?.name}) s tímto komentářem:`,
        r.return_comment ?? "",
      ],
      button: { label: "Opravit kontrolu", url: `${SITE_URL}/agent/kontroly/${r.id}` },
    }),
  });
}

export async function notifyApproved(id: string) {
  const [r] = await loadInspections([id]);
  if (!r) return;
  const to = await clientEmailsForBranch(r.company_id, r.branch_id);
  await sendEmail({
    to,
    subject: `Nový výsledek kontroly: ${r.branch?.name} (${fmtScore(r.score)})`,
    html: layout({
      heading: "Výsledek kontroly je k dispozici",
      paragraphs: [`Kontrola „${r.title}“ na provozovně ${r.branch?.name} je hotová. Celkové skóre: ${fmtScore(r.score)}.`],
      button: { label: "Zobrazit výsledek", url: `${SITE_URL}/klient/kontroly/${r.id}` },
    }),
  });
}

/**
 * Vytvoří odkaz na nastavení hesla (pozvánka nebo obnova) a pošle ho e-mailem.
 * Vrací odkaz, aby ho správce mohl předat ručně, když e-maily nejsou nastavené.
 */
export async function sendAccessLink(opts: {
  email: string;
  type: "invite" | "recovery";
  fullName?: string;
}): Promise<{ userId?: string; link?: string; emailed: boolean; error?: string }> {
  const db = createAdminClient();
  const { data, error } = await db.auth.admin.generateLink({ type: opts.type, email: opts.email });
  if (error || !data?.properties?.hashed_token) {
    return { emailed: false, error: error?.message ?? "Odkaz se nepodařilo vytvořit" };
  }
  const link = `${SITE_URL}/auth/confirm?token_hash=${data.properties.hashed_token}&type=${opts.type === "invite" ? "invite" : "recovery"}`;
  const invite = opts.type === "invite";
  const res = await sendEmail({
    to: opts.email,
    subject: invite ? `Pozvánka do aplikace ${APP_NAME}` : `Nastavení hesla – ${APP_NAME}`,
    html: layout({
      heading: invite ? "Byl vám vytvořen účet" : "Nastavení nového hesla",
      paragraphs: invite
        ? [
            `Dobrý den${opts.fullName ? `, ${opts.fullName}` : ""},`,
            `byl vám vytvořen přístup do aplikace ${APP_NAME}. Kliknutím na tlačítko si nastavíte heslo.`,
          ]
        : ["Kliknutím na tlačítko si nastavíte nové heslo. Pokud jste o změnu nežádali, e-mail ignorujte."],
      button: { label: "Nastavit heslo", url: link },
      footer: "Odkaz lze použít jen jednou a po čase vyprší. Pokud nefunguje, požádejte o nový.",
    }),
  });
  return { userId: data.user?.id, link, emailed: emailEnabled() && res.ok && !("skipped" in res && res.skipped) };
}
