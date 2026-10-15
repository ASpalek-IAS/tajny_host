import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { ActionForm, SubmitButton } from "@/components/client-ui";
import { Field } from "@/components/ui";
import { setPassword } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/server";

export default async function SetPasswordPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login?chyba=odkaz");
  return (
    <AuthCard title="Nastavení hesla" sub={`Účet ${data.claims.email ?? ""}`}>
      <ActionForm action={setPassword} className="space-y-4">
        <Field label="Nové heslo" hint="Alespoň 8 znaků">
          <input name="password" type="password" autoComplete="new-password" minLength={8} required className="input" />
        </Field>
        <Field label="Heslo znovu">
          <input name="confirm" type="password" autoComplete="new-password" minLength={8} required className="input" />
        </Field>
        <SubmitButton className="w-full">Uložit heslo a pokračovat</SubmitButton>
      </ActionForm>
    </AuthCard>
  );
}
