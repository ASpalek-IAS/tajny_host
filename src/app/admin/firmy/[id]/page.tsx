import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, CardHeader, EmptyState, LinkButton, PageHeader, Table, Tabs, Td, Th } from "@/components/ui";
import { SubmitButton } from "@/components/client-ui";
import { InspectionTable, INSPECTION_LIST_SELECT, type InspectionListRow } from "@/components/inspection-table";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { INTERVAL_LABEL, type Branch, type Company, type Profile } from "@/lib/types";
import { CompanyForm } from "../company-form";
import { updateCompany } from "@/app/admin/actions/companies";
import { deleteSchedule } from "@/app/admin/actions/templates";
import { UserDialog } from "@/app/admin/user-form";
import { BranchDialog, ImportBranchesDialog, ScheduleDialog, TemplateDialog, type ScheduleRow } from "./dialogs";

// adminOnly = kontrolor záložku nevidí
const TABS = [
  { key: "provozovny", label: "Provozovny" },
  { key: "uzivatele", label: "Uživatelé klienta", adminOnly: true },
  { key: "dotazniky", label: "Dotazníky" },
  { key: "plany", label: "Plány opakování" },
  { key: "kontroly", label: "Kontroly" },
  { key: "udaje", label: "Údaje firmy", adminOnly: true },
];

export default async function CompanyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const me = await requireStaff();
  const isAdmin = me.role === "admin";
  const tabs = TABS.filter((t) => isAdmin || !t.adminOnly);
  const { tab: tabKey = "provozovny" } = await searchParams;
  const tab = tabs.some((t) => t.key === tabKey) ? tabKey : "provozovny";
  const db = await createClient();
  const { data: company } = await db.from("companies").select("*").eq("id", id).maybeSingle();
  if (!company) notFound();
  const { data: branchesData } = await db.from("branches").select("*").eq("company_id", id).order("name");
  const branches = (branchesData ?? []) as Branch[];

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {company.name} {!company.active && <Badge>neaktivní</Badge>}
          </span>
        }
        sub={[company.ico && `IČO ${company.ico}`, company.contact_name, company.contact_email].filter(Boolean).join(" · ")}
        back={{ href: "/admin/firmy", label: "Firmy" }}
        actions={<LinkButton href={`/admin/kontroly/nova?firma=${id}`}>Naplánovat kontrolu</LinkButton>}
      />
      <Tabs active={tab} tabs={tabs.map((t) => ({ key: t.key, label: t.label, href: `/admin/firmy/${id}?tab=${t.key}` }))} />

      {tab === "provozovny" && <BranchesTab companyId={id} branches={branches} canEdit={isAdmin} />}
      {tab === "uzivatele" && <UsersTab companyId={id} branches={branches} />}
      {tab === "dotazniky" && <TemplatesTab companyId={id} canEdit={isAdmin} />}
      {tab === "plany" && <SchedulesTab companyId={id} branches={branches} />}
      {tab === "kontroly" && <InspectionsTab companyId={id} />}
      {tab === "udaje" && (
        <Card className="max-w-3xl p-6">
          <CompanyForm action={updateCompany} company={company as Company} />
        </Card>
      )}
    </>
  );
}

function BranchesTab({ companyId, branches, canEdit }: { companyId: string; branches: Branch[]; canEdit: boolean }) {
  return (
    <Card>
      <CardHeader
        title={`Provozovny (${branches.length})`}
        action={
          canEdit ? (
            <div className="flex gap-2">
              <ImportBranchesDialog companyId={companyId} />
              <BranchDialog companyId={companyId} />
            </div>
          ) : undefined
        }
      />
      {branches.length === 0 ? (
        <EmptyState title="Firma zatím nemá provozovny" />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Název</Th>
              <Th>Adresa</Th>
              <Th>Poznámka pro agenta</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {branches.map((b) => (
              <tr key={b.id}>
                <Td className="font-medium">
                  {b.name} {!b.active && <Badge>neaktivní</Badge>}
                </Td>
                <Td className="text-ink-600">{b.address ?? "—"}</Td>
                <Td className="max-w-xs truncate text-ink-600">{b.note_for_agent ?? "—"}</Td>
                <Td className="text-right">{canEdit && <BranchDialog companyId={companyId} branch={b} />}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

async function UsersTab({ companyId, branches }: { companyId: string; branches: Branch[] }) {
  const db = await createClient();
  const { data } = await db
    .from("profiles")
    .select("*,profile_branches(branch_id)")
    .eq("company_id", companyId)
    .order("full_name");
  const users = (data ?? []).map((u) => ({
    ...(u as Profile),
    branch_ids: ((u.profile_branches ?? []) as { branch_id: string }[]).map((pb) => pb.branch_id),
  }));
  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  return (
    <Card>
      <CardHeader
        title="Uživatelé klienta"
        sub="Vidí naplánované kontroly a schválené výsledky svých provozoven."
        action={<UserDialog role="client" companyId={companyId} branches={branches} triggerLabel="Přidat uživatele" />}
      />
      {users.length === 0 ? (
        <EmptyState title="Zatím žádní uživatelé" />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Jméno</Th>
              <Th>E-mail</Th>
              <Th>Přístup</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <Td className="font-medium">
                  {u.full_name} {!u.active && <Badge tone="bad">deaktivovaný</Badge>}
                </Td>
                <Td className="text-ink-600">{u.email}</Td>
                <Td className="text-ink-600">
                  {u.all_branches ? (
                    <Badge tone="brand">Všechny provozovny</Badge>
                  ) : (
                    <span className="text-sm">{u.branch_ids.map((b) => branchName.get(b)).join(", ")}</span>
                  )}
                </Td>
                <Td className="text-right">
                  <UserDialog role="client" companyId={companyId} branches={branches} user={u} triggerLabel="Upravit" />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

async function TemplatesTab({ companyId, canEdit }: { companyId: string; canEdit: boolean }) {
  const db = await createClient();
  const [{ data }, { data: all }] = await Promise.all([
    db
      .from("templates")
      .select("id,name,description,archived,updated_at,template_topics(id,template_questions(count))")
      .eq("company_id", companyId)
      .order("archived")
      .order("name"),
    db.from("templates").select("id,name,company:companies(name)").eq("archived", false).order("name"),
  ]);
  const rows = (data ?? []) as unknown as {
    id: string;
    name: string;
    description: string | null;
    archived: boolean;
    updated_at: string;
    template_topics: { id: string; template_questions: { count: number }[] }[];
  }[];
  const sources = ((all ?? []) as unknown as { id: string; name: string; company: { name: string } }[]).map((t) => ({
    id: t.id,
    name: t.name,
    company: t.company?.name ?? "",
  }));
  return (
    <Card>
      <CardHeader
        title="Dotazníky"
        sub={
          canEdit
            ? "Šablony otázek. Každá kontrola si při vytvoření uloží vlastní kopii."
            : "Šablony otázek. Upravovat je může jen správce."
        }
        action={canEdit ? <TemplateDialog companyId={companyId} sources={sources} /> : undefined}
      />
      {rows.length === 0 ? (
        <EmptyState title="Firma zatím nemá žádný dotazník" />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Název</Th>
              <Th className="text-right">Témata</Th>
              <Th className="text-right">Otázky</Th>
              <Th>Upraveno</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className="hover:bg-ink-50">
                <Td>
                  {canEdit ? (
                    <Link href={`/admin/sablony/${t.id}`} className="font-medium hover:text-brand-700">
                      {t.name}
                    </Link>
                  ) : (
                    <span className="font-medium">{t.name}</span>
                  )}{" "}
                  {t.archived && <Badge>archiv</Badge>}
                  {t.description && <p className="text-xs text-ink-500">{t.description}</p>}
                </Td>
                <Td className="tabular text-right">{t.template_topics.length}</Td>
                <Td className="tabular text-right">
                  {t.template_topics.reduce((s, tp) => s + (tp.template_questions[0]?.count ?? 0), 0)}
                </Td>
                <Td className="text-ink-600">{fmtDateTime(t.updated_at)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

async function SchedulesTab({ companyId, branches }: { companyId: string; branches: Branch[] }) {
  const db = await createClient();
  const [{ data }, { data: templates }, { data: agents }] = await Promise.all([
    db.from("schedules").select("*").eq("company_id", companyId).order("created_at"),
    db.from("templates").select("id,name").eq("company_id", companyId).eq("archived", false).order("name"),
    db.from("profiles").select("id,full_name").eq("role", "agent").eq("active", true).order("full_name"),
  ]);
  const schedules = (data ?? []) as ScheduleRow[];
  const tName = new Map((templates ?? []).map((t) => [t.id, t.name]));
  const aName = new Map((agents ?? []).map((a) => [a.id, a.full_name]));
  return (
    <Card>
      <CardHeader
        title="Plány opakování"
        sub="Pravidelné kontroly se zakládají automaticky podle plánu."
        action={<ScheduleDialog companyId={companyId} templates={templates ?? []} branches={branches} agents={agents ?? []} />}
      />
      {(templates ?? []).length === 0 && (
        <p className="px-5 pt-4 text-sm text-ink-500">Nejdřív vytvořte dotazník na záložce Dotazníky.</p>
      )}
      {schedules.length === 0 ? (
        <EmptyState title="Žádné plány" />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Plán</Th>
              <Th>Opakování</Th>
              <Th>Období</Th>
              <Th>Provozovny</Th>
              <Th>Agent</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {schedules.map((s) => (
              <tr key={s.id}>
                <Td>
                  <p className="font-medium">
                    {s.name} {!s.active && <Badge>pozastaveno</Badge>}
                  </p>
                  <p className="text-xs text-ink-500">{tName.get(s.template_id) ?? "—"}</p>
                </Td>
                <Td>{INTERVAL_LABEL[s.interval]}</Td>
                <Td className="whitespace-nowrap">
                  {fmtDate(s.start_date)} – {s.end_date ? fmtDate(s.end_date) : "bez konce"}
                </Td>
                <Td className="tabular">{s.branch_ids.length}</Td>
                <Td>{s.default_agent_id ? aName.get(s.default_agent_id) : <span className="text-ink-400">—</span>}</Td>
                <Td className="text-right whitespace-nowrap">
                  <ScheduleDialog
                    companyId={companyId}
                    templates={templates ?? []}
                    branches={branches}
                    agents={agents ?? []}
                    schedule={s}
                  />
                  <form action={deleteSchedule} className="inline">
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="company_id" value={companyId} />
                    <SubmitButton variant="ghost" size="sm" className="text-bad!" confirm="Smazat plán? Už vytvořené kontroly zůstanou.">
                      Smazat
                    </SubmitButton>
                  </form>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

async function InspectionsTab({ companyId }: { companyId: string }) {
  const db = await createClient();
  const { data } = await db
    .from("inspections")
    .select(INSPECTION_LIST_SELECT)
    .eq("company_id", companyId)
    .order("window_start", { ascending: false })
    .limit(200);
  return (
    <Card>
      <InspectionTable rows={(data ?? []) as unknown as InspectionListRow[]} hrefBase="/admin/kontroly" showCompany={false} />
    </Card>
  );
}
