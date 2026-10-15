"use client";

import { ActionForm, Dialog, SubmitButton } from "@/components/client-ui";
import { Button, Field } from "@/components/ui";
import { importBranches, saveBranch } from "@/app/admin/actions/companies";
import { createTemplate, saveSchedule } from "@/app/admin/actions/templates";
import { INTERVAL_LABEL, type Branch } from "@/lib/types";
import { todayISO } from "@/lib/format";

export function BranchDialog({ companyId, branch }: { companyId: string; branch?: Branch }) {
  return (
    <Dialog
      title={branch ? "Upravit provozovnu" : "Nová provozovna"}
      trigger={(open) => (
        <Button variant={branch ? "ghost" : "primary"} size={branch ? "sm" : "md"} onClick={open}>
          {branch ? "Upravit" : "Přidat provozovnu"}
        </Button>
      )}
      content={(close) => (
        <ActionForm action={saveBranch} onSuccess={close} className="space-y-4">
          <input type="hidden" name="company_id" value={companyId} />
          {branch && <input type="hidden" name="id" value={branch.id} />}
          <Field label="Název">
            <input name="name" required defaultValue={branch?.name} className="input" placeholder="např. Plzeň – Náměstí" />
          </Field>
          <Field label="Adresa">
            <input name="address" defaultValue={branch?.address ?? ""} className="input" />
          </Field>
          <Field label="Poznámka pro agenta" hint="Např. otevírací doba, kde je vchod, na co si dát pozor.">
            <textarea name="note_for_agent" rows={2} defaultValue={branch?.note_for_agent ?? ""} className="input" />
          </Field>
          {branch && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" defaultChecked={branch.active} /> Aktivní (lze na ni plánovat kontroly)
            </label>
          )}
          <div className="flex justify-end">
            <SubmitButton>Uložit</SubmitButton>
          </div>
        </ActionForm>
      )}
    />
  );
}

export function ImportBranchesDialog({ companyId }: { companyId: string }) {
  return (
    <Dialog
      title="Hromadné přidání provozoven"
      trigger={(open) => (
        <Button variant="secondary" onClick={open}>
          Vložit seznam
        </Button>
      )}
      content={(close) => (
        <ActionForm action={importBranches} onSuccess={close} className="space-y-4">
          <input type="hidden" name="company_id" value={companyId} />
          <Field label="Jedna provozovna na řádek" hint="Formát: Název; adresa. Lze vložit i dva sloupce zkopírované z Excelu.">
            <textarea name="lines" rows={8} className="input font-mono text-xs" placeholder={"Plzeň – Náměstí; Náměstí Republiky 1, Plzeň\nPraha – Anděl; Nádražní 10, Praha 5"} />
          </Field>
          <div className="flex justify-end">
            <SubmitButton>Přidat</SubmitButton>
          </div>
        </ActionForm>
      )}
    />
  );
}

export function TemplateDialog({
  companyId,
  sources,
}: {
  companyId: string;
  sources: { id: string; name: string; company: string }[];
}) {
  return (
    <Dialog
      title="Nový dotazník"
      trigger={(open) => <Button onClick={open}>Nový dotazník</Button>}
      content={() => (
        <ActionForm action={createTemplate} className="space-y-4">
          <input type="hidden" name="company_id" value={companyId} />
          <Field label="Název" hint="Např. „Standardní kontrola prodejny“">
            <input name="name" required className="input" />
          </Field>
          <Field label="Popis (interní)">
            <input name="description" className="input" />
          </Field>
          {sources.length > 0 && (
            <Field label="Začít jako kopie existujícího dotazníku" hint="Nepovinné – zkopíruje témata i otázky.">
              <select name="copy_from" className="input" defaultValue="">
                <option value="">Prázdný dotazník</option>
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.company} – {s.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <div className="flex justify-end">
            <SubmitButton>Vytvořit a otevřít editor</SubmitButton>
          </div>
        </ActionForm>
      )}
    />
  );
}

export type ScheduleRow = {
  id: string;
  name: string;
  template_id: string;
  interval: "weekly" | "monthly" | "quarterly";
  start_date: string;
  end_date: string | null;
  branch_ids: string[];
  default_agent_id: string | null;
  instructions: string | null;
  active: boolean;
};

export function ScheduleDialog({
  companyId,
  templates,
  branches,
  agents,
  schedule,
}: {
  companyId: string;
  templates: { id: string; name: string }[];
  branches: Branch[];
  agents: { id: string; full_name: string }[];
  schedule?: ScheduleRow;
}) {
  return (
    <Dialog
      wide
      title={schedule ? "Upravit plán" : "Nový plán opakování"}
      trigger={(open) => (
        <Button variant={schedule ? "ghost" : "primary"} size={schedule ? "sm" : "md"} onClick={open} disabled={!schedule && templates.length === 0}>
          {schedule ? "Upravit" : "Nový plán"}
        </Button>
      )}
      content={(close) => (
        <ActionForm action={saveSchedule} onSuccess={close} className="space-y-4">
          <input type="hidden" name="company_id" value={companyId} />
          {schedule && <input type="hidden" name="id" value={schedule.id} />}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Název" hint="Zobrazí se jako název kontroly">
              <input name="name" required defaultValue={schedule?.name} className="input" placeholder="Měsíční kontrola" />
            </Field>
            <Field label="Dotazník">
              <select name="template_id" required defaultValue={schedule?.template_id} className="input">
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Opakování">
              <select name="interval" defaultValue={schedule?.interval ?? "monthly"} className="input">
                {Object.entries(INTERVAL_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Od">
              <input name="start_date" type="date" required defaultValue={schedule?.start_date ?? todayISO()} className="input" />
            </Field>
            <Field label="Do (nepovinné)">
              <input name="end_date" type="date" defaultValue={schedule?.end_date ?? ""} className="input" />
            </Field>
          </div>
          <div>
            <span className="label">Provozovny</span>
            <div className="grid max-h-48 gap-1.5 overflow-y-auto rounded-lg bg-ink-50 p-3 sm:grid-cols-2">
              {branches.map((b) => (
                <label key={b.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="branch_ids" value={b.id} defaultChecked={schedule ? schedule.branch_ids.includes(b.id) : true} />
                  {b.name}
                </label>
              ))}
            </div>
          </div>
          <Field label="Výchozí agent" hint="Nové kontroly se mu rovnou přiřadí. Bez agenta zůstanou ve stavu Naplánovaná.">
            <select name="default_agent_id" defaultValue={schedule?.default_agent_id ?? ""} className="input">
              <option value="">— bez agenta —</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.full_name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Zadání pro agenta" hint="Scénář návštěvy – co koupit, na co se ptát.">
            <textarea name="instructions" rows={3} defaultValue={schedule?.instructions ?? ""} className="input" />
          </Field>
          {schedule && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" defaultChecked={schedule.active} /> Aktivní (vytváří nové kontroly)
            </label>
          )}
          <p className="text-xs text-ink-500">
            Kontroly se vytváří automaticky s předstihem (týdenní 7 dní, měsíční 14 dní, čtvrtletní 21 dní před začátkem období). Každá kontrola
            dostane vlastní kopii otázek, takže pozdější úprava dotazníku nezmění hotové kontroly.
          </p>
          <div className="flex justify-end">
            <SubmitButton>Uložit plán</SubmitButton>
          </div>
        </ActionForm>
      )}
    />
  );
}
