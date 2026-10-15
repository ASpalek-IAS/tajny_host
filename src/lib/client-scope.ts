import "server-only";
import { createClient } from "@/lib/supabase/server";
import { addDays, todayISO } from "@/lib/format";
import type { FilterValues } from "@/components/report-blocks";
import type { ReportFilters } from "@/lib/reports";

/** Provozovny a dotazníky, které klient vidí, + výchozí období 12 měsíců. */
export async function clientScope(sp: FilterValues) {
  const db = await createClient();
  const [{ data: branches }, { data: templates }] = await Promise.all([
    db.from("branches").select("id,name").order("name"),
    db.from("templates").select("id,name"),
  ]);
  const values: FilterValues = { ...sp, od: sp.od ?? addDays(todayISO(), -365) };
  const filters: ReportFilters = { branch: values.provozovna, template: values.dotaznik, from: values.od, to: values.do };
  return {
    db,
    branches: branches ?? [],
    templateNames: new Map((templates ?? []).map((t) => [t.id as string, t.name as string])),
    values,
    filters,
  };
}
