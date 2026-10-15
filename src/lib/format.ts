const TZ = "Europe/Prague";

export function fmtDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + "T12:00:00") : new Date(d);
  return date.toLocaleDateString("cs-CZ", { timeZone: TZ, day: "numeric", month: "numeric", year: "numeric" });
}

export function fmtDateTime(d: string | Date | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("cs-CZ", {
    timeZone: TZ,
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtWindow(start: string, end: string) {
  if (start === end) return fmtDate(start);
  return `${fmtDate(start)} – ${fmtDate(end)}`;
}

export function fmtScore(s: number | null | undefined) {
  if (s === null || s === undefined) return "—";
  return `${Number(s).toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} %`;
}

export function fmtMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("cs-CZ", { month: "short", year: "numeric" });
}

/** Dnešní datum v Praze jako YYYY-MM-DD */
export function todayISO() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: TZ });
}

export function addDays(iso: string, days: number) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Hodnota pro <input type="datetime-local"> v pražském čase */
export function toLocalInput(d: string | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleString("sv-SE", { timeZone: TZ }).replace(" ", "T").slice(0, 16);
}

export function scoreTone(s: number | null | undefined): "good" | "mid" | "bad" | "none" {
  if (s === null || s === undefined) return "none";
  if (s >= 85) return "good";
  if (s >= 65) return "mid";
  return "bad";
}
