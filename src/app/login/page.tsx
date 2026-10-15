import Link from "next/link";
import { AuthCard } from "@/components/auth-card";
import { ActionForm, SubmitButton } from "@/components/client-ui";
import { Field, Notice } from "@/components/ui";
import { login } from "@/app/auth/actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ chyba?: string }> }) {
  const { chyba } = await searchParams;
  return (
    <AuthCard title="Přihlášení">
      {chyba === "odkaz" && (
        <div className="mb-4">
          <Notice tone="warn">Odkaz je neplatný nebo vypršel. Požádejte o nový přes „Zapomenuté heslo“.</Notice>
        </div>
      )}
      <ActionForm action={login} className="space-y-4">
        <Field label="E-mail">
          <input name="email" type="email" autoComplete="email" required className="input" />
        </Field>
        <Field label="Heslo">
          <input name="password" type="password" autoComplete="current-password" required className="input" />
        </Field>
        <SubmitButton className="w-full" pendingText="Přihlašuji…">
          Přihlásit se
        </SubmitButton>
      </ActionForm>
      <p className="mt-6 text-sm">
        <Link href="/zapomenute-heslo" className="text-brand-700 hover:underline">
          Zapomenuté heslo
        </Link>
      </p>
    </AuthCard>
  );
}
