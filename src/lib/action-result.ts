export type ActionResult = {
  ok?: boolean;
  error?: string;
  message?: string;
  link?: string;
};

export function errorMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string") {
    const m = (e as { message: string }).message;
    if (m.includes("duplicate key")) return "Záznam už existuje.";
    if (m.includes("row-level security") || m.includes("permission denied")) return "K této akci nemáte oprávnění.";
    return m;
  }
  return "Něco se nepovedlo. Zkuste to prosím znovu.";
}
