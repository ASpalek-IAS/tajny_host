export type Role = "admin" | "controller" | "client" | "agent";

/** Správce nebo kontrolor – pracují v administraci. */
export const isStaff = (role: Role | undefined | null) => role === "admin" || role === "controller";

export type InspectionStatus =
  | "planned"
  | "assigned"
  | "in_progress"
  | "submitted"
  | "returned"
  | "approved"
  | "cancelled";

export type QuestionType =
  | "yes_no"
  | "yes_no_na"
  | "scale"
  | "single_choice"
  | "multi_choice"
  | "number"
  | "duration"
  | "datetime"
  | "short_text"
  | "long_text"
  | "file";

export type ScheduleInterval = "weekly" | "monthly" | "quarterly";

export type ChoiceOption = { id: string; label: string; points: number };

export type QuestionConfig = {
  min?: number;
  max?: number;
  minLabel?: string;
  maxLabel?: string;
  threshold?: number | null;
  mode?: "lte" | "gte";
  unit?: string;
};

export type Profile = {
  id: string;
  role: Role;
  full_name: string;
  email: string;
  phone: string | null;
  company_id: string | null;
  all_branches: boolean;
  active: boolean;
  notify_digest: boolean;
};

export type Company = {
  id: string;
  name: string;
  ico: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  logo_url: string | null;
  note: string | null;
  active: boolean;
};

export type Branch = {
  id: string;
  company_id: string;
  name: string;
  address: string | null;
  note_for_agent: string | null;
  active: boolean;
};

export type Topic = {
  id: string;
  title: string;
  position: number;
  weight: number;
  score?: number | null;
};

export type Question = {
  id: string;
  topic_id: string;
  text: string;
  help_text: string | null;
  type: QuestionType;
  required: boolean;
  weight: number;
  options: ChoiceOption[];
  config: QuestionConfig;
  comment_on_negative: boolean;
  position: number;
};

export type Answer = {
  id: string;
  question_id: string;
  value: unknown;
  comment: string | null;
  fraction: number | null;
};

export type Attachment = {
  id: string;
  inspection_id: string;
  question_id: string | null;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
};

export type TopicScore = { title: string; score: number | null; weight: number };

export const STATUS_LABEL: Record<InspectionStatus, string> = {
  planned: "Naplánovaná",
  assigned: "Přiřazená",
  in_progress: "Rozpracovaná",
  submitted: "Ke schválení",
  returned: "Vrácená k opravě",
  approved: "Schválená",
  cancelled: "Zrušená",
};

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Správce",
  controller: "Kontrolor",
  client: "Klient",
  agent: "Agent",
};

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  yes_no: "Ano / ne",
  yes_no_na: "Ano / ne / nelze posoudit",
  scale: "Škála",
  single_choice: "Výběr jedné možnosti",
  multi_choice: "Výběr více možností",
  number: "Číslo",
  duration: "Čas / délka (minuty)",
  datetime: "Datum a čas",
  short_text: "Krátký text",
  long_text: "Dlouhý text",
  file: "Fotka / soubor",
};

export const SCORED_TYPES: QuestionType[] = [
  "yes_no",
  "yes_no_na",
  "scale",
  "single_choice",
  "multi_choice",
  "number",
  "duration",
];

export const INTERVAL_LABEL: Record<ScheduleInterval, string> = {
  weekly: "Každý týden",
  monthly: "Každý měsíc",
  quarterly: "Každé čtvrtletí",
};

/** Je otázka započítaná do skóre? */
export function isScored(q: Pick<Question, "type" | "weight" | "config" | "options">) {
  if (q.weight <= 0 || !SCORED_TYPES.includes(q.type)) return false;
  if (q.type === "number" || q.type === "duration") {
    return q.config?.threshold !== undefined && q.config?.threshold !== null;
  }
  if (q.type === "single_choice" || q.type === "multi_choice") {
    return (q.options ?? []).some((o) => Number(o.points) > 0);
  }
  return true;
}

/** Stejná logika jako SQL funkce question_fraction – pro náhled v rozhraní. */
export function questionFraction(q: Question, v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const cfg = q.config ?? {};
  switch (q.type) {
    case "yes_no":
    case "yes_no_na":
      return v === "yes" ? 1 : v === "no" ? 0 : null;
    case "scale": {
      const min = cfg.min ?? 1;
      const max = cfg.max ?? 5;
      if (typeof v !== "number" || max <= min) return null;
      return Math.max(0, Math.min(1, (v - min) / (max - min)));
    }
    case "single_choice": {
      const maxPts = Math.max(0, ...q.options.map((o) => Number(o.points) || 0));
      const opt = q.options.find((o) => o.id === v);
      if (!opt || maxPts <= 0) return null;
      return Math.max(0, Math.min(1, (Number(opt.points) || 0) / maxPts));
    }
    case "multi_choice": {
      if (!Array.isArray(v)) return null;
      const maxPts = q.options.reduce((s, o) => s + Math.max(0, Number(o.points) || 0), 0);
      if (maxPts <= 0) return null;
      const pts = q.options
        .filter((o) => v.includes(o.id))
        .reduce((s, o) => s + (Number(o.points) || 0), 0);
      return Math.max(0, Math.min(1, pts / maxPts));
    }
    case "number":
    case "duration": {
      if (cfg.threshold === undefined || cfg.threshold === null || typeof v !== "number") return null;
      return (cfg.mode ?? "lte") === "gte" ? (v >= cfg.threshold ? 1 : 0) : v <= cfg.threshold ? 1 : 0;
    }
    default:
      return null;
  }
}
