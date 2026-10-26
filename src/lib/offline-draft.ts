/**
 * Záloha neuložených odpovědí v zařízení (localStorage).
 * Každá změna se zapíše sem dřív, než se pošle na server. Po úspěšném uložení
 * na server se záznam odstraní. Když se uložení nepovede (výpadek sítě, vybitý
 * telefon, zavřený prohlížeč), záznam zůstane a odešle se při dalším připojení
 * nebo otevření kontroly.
 */

export type PendingAnswer = { value: unknown; comment: string; t: number };
export type Draft = {
  answers: Record<string, PendingAnswer>;
  visit?: { value: string | null; t: number };
  expense?: { value: number | null; t: number };
};

/** Počet neodeslaných změn v záloze. */
export const draftSize = (d: Draft) => Object.keys(d.answers).length + (d.visit ? 1 : 0) + (d.expense ? 1 : 0);

const key = (inspectionId: string) => `ms-draft:${inspectionId}`;

export function readDraft(inspectionId: string): Draft {
  try {
    const raw = window.localStorage.getItem(key(inspectionId));
    if (!raw) return { answers: {} };
    const d = JSON.parse(raw) as Draft;
    return { answers: d.answers ?? {}, visit: d.visit, expense: d.expense };
  } catch {
    return { answers: {} };
  }
}

export function writeDraft(inspectionId: string, d: Draft) {
  try {
    if (draftSize(d) === 0) window.localStorage.removeItem(key(inspectionId));
    else window.localStorage.setItem(key(inspectionId), JSON.stringify(d));
  } catch {
    // úložiště není k dispozici (anonymní režim apod.) – formulář funguje dál, jen bez zálohy
  }
}

export function clearDraft(inspectionId: string) {
  try {
    window.localStorage.removeItem(key(inspectionId));
    window.localStorage.removeItem(snapKey(inspectionId));
  } catch {
    /* nic */
  }
}

/**
 * Poslední známý stav celého formuláře (i už uložených odpovědí).
 * Stránka otevřená offline pochází z dřívější doby – odpovědi uložené na server
 * až po jejím stažení by v ní chyběly. Snímek je doplní.
 */
export type Snapshot = {
  values: Record<string, unknown>;
  comments: Record<string, string>;
  visit: string;
  spent: string;
  savedAt: number;
};

const snapKey = (inspectionId: string) => `ms-snap:${inspectionId}`;

export function readSnapshot(inspectionId: string): Snapshot | null {
  try {
    const raw = window.localStorage.getItem(snapKey(inspectionId));
    return raw ? (JSON.parse(raw) as Snapshot) : null;
  } catch {
    return null;
  }
}

export function writeSnapshot(inspectionId: string, s: Snapshot) {
  try {
    window.localStorage.setItem(snapKey(inspectionId), JSON.stringify(s));
  } catch {
    /* plné nebo nedostupné úložiště – snímek je jen pojistka */
  }
}

/** Smaže snímky formulářů (např. při odhlášení). Neodeslané změny (ms-draft) zůstávají. */
export function clearSnapshots() {
  try {
    for (const k of Object.keys(window.localStorage)) if (k.startsWith("ms-snap:")) window.localStorage.removeItem(k);
  } catch {
    /* nic */
  }
}

/** Jsou v zařízení nějaké neodeslané změny? */
export function hasPendingDrafts() {
  try {
    return Object.keys(window.localStorage).some((k) => k.startsWith("ms-draft:"));
  } catch {
    return false;
  }
}
