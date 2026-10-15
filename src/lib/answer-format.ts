import type { Question } from "@/lib/types";
import { fmtDateTime } from "@/lib/format";

export function formatAnswer(q: Question, v: unknown): string {
  if (v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) return "—";
  switch (q.type) {
    case "yes_no":
    case "yes_no_na":
      return v === "yes" ? "Ano" : v === "no" ? "Ne" : v === "na" ? "Nelze posoudit" : String(v);
    case "scale":
      return `${v} z ${q.config?.max ?? 5}`;
    case "single_choice":
      return q.options.find((o) => o.id === v)?.label ?? String(v);
    case "multi_choice":
      return (Array.isArray(v) ? v : [])
        .map((id) => q.options.find((o) => o.id === id)?.label ?? id)
        .join(", ");
    case "number":
      return `${Number(v).toLocaleString("cs-CZ")}${q.config?.unit ? ` ${q.config.unit}` : ""}`;
    case "duration":
      return `${Number(v).toLocaleString("cs-CZ")} min`;
    case "datetime":
      return fmtDateTime(String(v));
    default:
      return String(v);
  }
}
