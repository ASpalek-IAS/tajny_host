"use client";

import { useState } from "react";
import { ActionForm, CopyField, Dialog, SubmitButton } from "@/components/client-ui";
import { Button, Field } from "@/components/ui";
import { inviteUser, resendAccess, updateUser } from "@/app/admin/actions/users";
import type { ActionResult } from "@/lib/action-result";
import type { Branch, Profile, Role } from "@/lib/types";

type EditableProfile = Profile & { branch_ids?: string[] };

export function UserDialog({
  role,
  companyId,
  branches = [],
  user,
  triggerLabel,
}: {
  role: Role;
  companyId?: string;
  branches?: Branch[];
  user?: EditableProfile;
  triggerLabel: string;
}) {
  const [link, setLink] = useState<string | null>(null);
  const [access, setAccess] = useState<"all" | "restricted">(user && !user.all_branches ? "restricted" : "all");
  const title = user ? "Upravit uživatele" : role === "client" ? "Nový uživatel klienta" : role === "agent" ? "Nový agent" : "Nový správce";

  return (
    <Dialog
      title={title}
      trigger={(open) => (
        <Button variant={user ? "ghost" : "primary"} size={user ? "sm" : "md"} onClick={() => { setLink(null); open(); }}>
          {triggerLabel}
        </Button>
      )}
      content={(close) =>
        link ? (
          <div className="space-y-4">
            <p className="text-sm">
              E-maily nejsou nastavené. Pošlete uživateli tento odkaz, přes který si nastaví heslo:
            </p>
            <CopyField value={link} />
            <div className="flex justify-end">
              <Button onClick={close}>Hotovo</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <ActionForm
              action={user ? updateUser : inviteUser}
              className="space-y-4"
              onSuccess={(r: ActionResult) => {
                if (r.link) setLink(r.link);
                else if (!user) close();
              }}
            >
              {user && <input type="hidden" name="id" value={user.id} />}
              <input type="hidden" name="role" value={role} />
              {companyId && <input type="hidden" name="company_id" value={companyId} />}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Jméno a příjmení">
                  <input name="full_name" required defaultValue={user?.full_name} className="input" />
                </Field>
                <Field label="Telefon">
                  <input name="phone" defaultValue={user?.phone ?? ""} className="input" />
                </Field>
              </div>
              {!user && (
                <Field label="E-mail" hint="Na tento e-mail přijde odkaz pro nastavení hesla.">
                  <input name="email" type="email" required className="input" />
                </Field>
              )}
              {role === "client" && (
                <fieldset className="space-y-2 rounded-lg bg-ink-50 p-4">
                  <legend className="sr-only">Přístup k provozovnám</legend>
                  <p className="label">Přístup k provozovnám</p>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" name="all_branches" value="all" checked={access === "all"} onChange={() => setAccess("all")} />
                    Všechny provozovny firmy (vedení)
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="all_branches"
                      value="restricted"
                      checked={access === "restricted"}
                      onChange={() => setAccess("restricted")}
                    />
                    Jen vybrané provozovny
                  </label>
                  {access === "restricted" && (
                    <div className="mt-2 grid max-h-48 gap-1.5 overflow-y-auto pl-6 sm:grid-cols-2">
                      {branches.map((b) => (
                        <label key={b.id} className="flex items-center gap-2 text-sm">
                          <input type="checkbox" name="branch_ids" value={b.id} defaultChecked={user?.branch_ids?.includes(b.id)} />
                          {b.name}
                        </label>
                      ))}
                      {branches.length === 0 && <p className="text-sm text-ink-500">Firma zatím nemá provozovny.</p>}
                    </div>
                  )}
                </fieldset>
              )}
              {user && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="active" defaultChecked={user.active} /> Aktivní účet (může se přihlásit)
                </label>
              )}
              <div className="flex justify-end">
                <SubmitButton>{user ? "Uložit" : "Vytvořit a poslat pozvánku"}</SubmitButton>
              </div>
            </ActionForm>
            {user && (
              <ActionForm
                action={resendAccess}
                className="border-t border-ink-100 pt-4"
                onSuccess={(r: ActionResult) => r.link && setLink(r.link)}
              >
                <input type="hidden" name="email" value={user.email} />
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-ink-600">Uživatel nemá heslo nebo ho zapomněl?</p>
                  <SubmitButton variant="secondary" size="sm" pendingText="Posílám…">
                    Poslat odkaz na nastavení hesla
                  </SubmitButton>
                </div>
              </ActionForm>
            )}
          </div>
        )
      }
    />
  );
}
