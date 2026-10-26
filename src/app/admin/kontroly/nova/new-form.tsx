"use client";

import { useState } from "react";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/client-ui";
import { Field } from "@/components/ui";
import { createInspections } from "@/app/admin/actions/inspections";
import { addDays, todayISO } from "@/lib/format";

type C = {
  id: string;
  name: string;
  branches: { id: string; name: string; active: boolean }[];
  templates: { id: string; name: string; archived: boolean }[];
};

export function NewInspectionForm({
  companies,
  agents,
  initialCompany,
}: {
  companies: C[];
  agents: { id: string; full_name: string }[];
  initialCompany?: string;
}) {
  const [companyId, setCompanyId] = useState(
    initialCompany ?? companies[0]?.id ?? "",
  );
  const company = companies.find((c) => c.id === companyId);
  const branches = (company?.branches ?? [])
    .filter((b) => b.active)
    .sort((a, b) => a.name.localeCompare(b.name, "cs"));
  const templates = (company?.templates ?? []).filter((t) => !t.archived);
  const today = todayISO();

  return (
    <ActionForm action={createInspections} className="space-y-5">
      <Field label="Firma">
        <select
          className="input"
          value={companyId}
          onChange={(e) => setCompanyId(e.target.value)}
        >
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>

      {company && templates.length === 0 ? (
        <p className="text-sm text-mid">
          Firma nemá žádný dotazník.{" "}
          <Link
            className="underline"
            href={`/admin/firmy/${companyId}?tab=dotazniky`}
          >
            Vytvořit dotazník
          </Link>
        </p>
      ) : (
        <Field
          label="Dotazník"
          hint="Kontrola dostane kopii otázek. Před přiřazením je můžete upravit jen pro tuto kontrolu."
        >
          <select name="template_id" className="input" key={companyId}>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      {branches.length === 0 ? (
        <p className="text-sm text-mid">
          Firma nemá provozovny.{" "}
          <Link
            className="underline"
            href={`/admin/firmy/${companyId}?tab=provozovny`}
          >
            Přidat provozovnu
          </Link>
        </p>
      ) : (
        <Field label="Provozovna">
          <select
            name="branch_ids"
            required
            className="input"
            key={companyId}
            defaultValue={branches.length === 1 ? branches[0].id : ""}
          >
            {branches.length > 1 && (
              <option value="" disabled>
                — vyberte provozovnu —
              </option>
            )}
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Termín od">
          <input
            type="date"
            name="window_start"
            required
            defaultValue={today}
            className="input"
          />
        </Field>
        <Field label="Termín do" hint="Do kdy má agent návštěvu provést">
          <input
            type="date"
            name="window_end"
            required
            defaultValue={addDays(today, 14)}
            className="input"
          />
        </Field>
      </div>

      <Field label="Agent">
        <select name="agent_id" className="input">
          <option value="">— přiřadit později —</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.full_name}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="Zadání pro agenta"
        hint="Scénář návštěvy – co koupit, na co se zeptat, jak se chovat."
      >
        <textarea name="instructions" rows={4} className="input" />
      </Field>

      <SubmitButton pendingText="Vytvářím…">Vytvořit kontrolu</SubmitButton>
    </ActionForm>
  );
}
