import { Card, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { NewInspectionForm } from "./new-form";

export default async function NewInspectionPage({ searchParams }: { searchParams: Promise<{ firma?: string }> }) {
  const { firma } = await searchParams;
  const db = await createClient();
  const [{ data: companies }, { data: agents }] = await Promise.all([
    db
      .from("companies")
      .select("id,name,branches(id,name,active),templates(id,name,archived)")
      .eq("active", true)
      .order("name"),
    db.from("profiles").select("id,full_name").eq("role", "agent").eq("active", true).order("full_name"),
  ]);
  return (
    <>
      <PageHeader title="Naplánovat kontrolu" back={{ href: "/admin/kontroly", label: "Kontroly" }} />
      <Card className="max-w-3xl p-6">
        {(companies ?? []).length === 0 ? (
          <p className="text-sm text-ink-500">Nejdřív založte firmu.</p>
        ) : (
          <NewInspectionForm companies={companies as never} agents={agents ?? []} initialCompany={firma} />
        )}
      </Card>
    </>
  );
}
