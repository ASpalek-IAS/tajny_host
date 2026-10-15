import Link from "next/link";
import { AuthCard } from "@/components/auth-card";
import { ActionForm, SubmitButton } from "@/components/client-ui";
import { Field } from "@/components/ui";
import { requestReset } from "@/app/auth/actions";

export default function ForgotPage() {
  return (
    <AuthCard title="Zapomenuté heslo" sub="Pošleme vám odkaz, přes který si nastavíte nové heslo.">
      <ActionForm action={requestReset} className="space-y-4">
        <Field label="E-mail">
          <input name="email" type="email" autoComplete="email" required className="input" />
        </Field>
        <SubmitButton className="w-full" pendingText="Odesílám…">
          Poslat odkaz
        </SubmitButton>
      </ActionForm>
      <p className="mt-6 text-sm">
        <Link href="/login" className="text-brand-700 hover:underline">
          ← Zpět na přihlášení
        </Link>
      </p>
    </AuthCard>
  );
}
