/**
 * Záloha neuložených odpovědí v zařízení (localStorage).
 * Každá změna se zapíše sem dřív, než se pošle na server. Po úspěšném uložení
 * na server se záznam odstraní. Když se uložení nepovede (výpadek sítě, vybitý
 * telefon, zavřený prohlížeč), záznam zůstane a odešle se při dalším připojení
 * nebo otevření kontroly.
 */

export type PendingAnswer = { value: unknown; comment: string; t: number };
export type Draft = { answers: Record<string, PendingAnswer>; visit?: { value: string | null; t: number } };

const key = (inspectionId: string) => `ms-draft:${inspectionId}`;

export function readDraft(inspectionId: string): Draft {
  try {
    const raw = window.localStorage.getItem(key(inspectionId));
    if (!raw) return { answers: {} };
    const d = JSON.parse(raw) as Draft;
    return { answers: d.answers ?? {}, visit: d.visit };
  } catch {
    return { answers: {} };
  }
}

export function writeDraft(inspectionId: string, d: Draft) {
  try {
    if (Object.keys(d.answers).length === 0 && !d.visit) window.localStorage.removeItem(key(inspectionId));
    else window.localStorage.setItem(key(inspectionId), JSON.stringify(d));
  } catch {
    // úložiště není k dispozici (anonymní režim apod.) – formulář funguje dál, jen bez zálohy
  }
}

export function clearDraft(inspectionId: string) {
  try {
    window.localStorage.removeItem(key(inspectionId));
  } catch {
    /* nic */
  }
}
