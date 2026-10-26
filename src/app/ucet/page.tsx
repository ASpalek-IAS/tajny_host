import { AppShell } from "@/components/app-shell";
import { ActionForm, SubmitButton } from "@/components/client-ui";
import { Card, CardHeader, Field, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { navFor } from "@/lib/nav";
import { changePassword, updateAccount } from "./actions";

export default async function AccountPage() {
  const profile = await requireRole("admin", "controller", "client", "agent");
  return (
    <AppShell profile={profile} nav={navFor(profile.role)}>
      <PageHeader title="Můj účet" sub={profile.email} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Údaje" />
          <ActionForm action={updateAccount} className="space-y-4 p-5">
            <Field label="Jméno a příjmení">
              <input name="full_name" defaultValue={profile.full_name} className="input" required />
            </Field>
            <Field label="Telefon">
              <input name="phone" defaultValue={profile.phone ?? ""} className="input" />
            </Field>
            {profile.role === "client" ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="notify_digest" defaultChecked={profile.notify_digest} />
                Posílat měsíční souhrn výsledků e-mailem
              </label>
            ) : (
              <input type="hidden" name="notify_digest" value={profile.notify_digest ? "on" : ""} />
            )}
            <SubmitButton>Uložit</SubmitButton>
          </ActionForm>
        </Card>
        <Card>
          <CardHeader title="Změna hesla" />
          <ActionForm action={changePassword} resetOnSuccess className="space-y-4 p-5">
            <Field label="Nové heslo" hint="Alespoň 8 znaků">
              <input name="password" type="password" minLength={8} required className="input" autoComplete="new-password" />
            </Field>
            <Field label="Heslo znovu">
              <input name="confirm" type="password" minLength={8} required className="input" autoComplete="new-password" />
            </Field>
            <SubmitButton>Změnit heslo</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </AppShell>
  );
}
