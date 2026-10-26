import { Card, PageHeader } from "@/components/ui";
import { CompanyForm } from "../company-form";
import { createCompany } from "@/app/admin/actions/companies";
import { requireAdmin } from "@/lib/auth";

export default async function NewCompanyPage() {
  await requireAdmin();
  return (
    <>
      <PageHeader title="Nová firma" back={{ href: "/admin/firmy", label: "Firmy" }} />
      <Card className="max-w-3xl p-6">
        <CompanyForm action={createCompany} />
      </Card>
    </>
  );
}
