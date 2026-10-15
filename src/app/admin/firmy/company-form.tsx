"use client";

import { useRef, useState, useTransition } from "react";
import { ActionForm, SubmitButton } from "@/components/client-ui";
import { Button, Field } from "@/components/ui";
import { lookupAres } from "@/app/admin/actions/companies";
import type { ActionResult } from "@/lib/action-result";
import type { Company } from "@/lib/types";

export function CompanyForm({
  action,
  company,
}: {
  action: (p: ActionResult, fd: FormData) => Promise<ActionResult>;
  company?: Company;
}) {
  const nameRef = useRef<HTMLInputElement>(null);
  const icoRef = useRef<HTMLInputElement>(null);
  const [aresMsg, setAresMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <ActionForm action={action} className="space-y-4">
      {company && <input type="hidden" name="id" value={company.id} />}
      <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
        <Field label="Název firmy">
          <input ref={nameRef} name="name" required defaultValue={company?.name} className="input" />
        </Field>
        <div>
          <span className="label">IČO</span>
          <div className="flex gap-2">
            <input ref={icoRef} name="ico" defaultValue={company?.ico ?? ""} className="input" inputMode="numeric" />
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await lookupAres(icoRef.current?.value ?? "");
                  if (r.error) setAresMsg(r.error);
                  else {
                    if (nameRef.current && r.name) nameRef.current.value = r.name;
                    setAresMsg(r.address ? `Sídlo: ${r.address}` : "Načteno z ARES");
                  }
                })
              }
            >
              ARES
            </Button>
          </div>
          {aresMsg && <p className="hint">{aresMsg}</p>}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Kontaktní osoba">
          <input name="contact_name" defaultValue={company?.contact_name ?? ""} className="input" />
        </Field>
        <Field label="E-mail">
          <input name="contact_email" type="email" defaultValue={company?.contact_email ?? ""} className="input" />
        </Field>
        <Field label="Telefon">
          <input name="contact_phone" defaultValue={company?.contact_phone ?? ""} className="input" />
        </Field>
      </div>
      <Field label="Interní poznámka">
        <textarea name="note" rows={2} defaultValue={company?.note ?? ""} className="input" />
      </Field>
      <Field label="Logo (pro PDF reporty)" hint="PNG nebo JPG, nejvýše 2 MB">
        <div className="flex items-center gap-4">
          {company?.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={company.logo_url} alt="" className="h-10 max-w-32 object-contain" />
          )}
          <input name="logo" type="file" accept="image/png,image/jpeg" className="text-sm" />
        </div>
      </Field>
      {company && (
        <div className="flex flex-wrap gap-6">
          {company.logo_url && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="remove_logo" /> Odebrat logo
            </label>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={company.active} /> Aktivní klient
          </label>
        </div>
      )}
      <SubmitButton>{company ? "Uložit změny" : "Vytvořit firmu"}</SubmitButton>
    </ActionForm>
  );
}
