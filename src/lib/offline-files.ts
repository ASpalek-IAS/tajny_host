/**
 * Fronta příloh (fotek) v zařízení – IndexedDB.
 * Každá fotka se nejdřív uloží sem a teprve pak nahrává. Když chybí signál,
 * zůstane ve frontě a nahraje se po připojení (nebo při dalším otevření kontroly).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type QueuedFile = {
  id: string;
  inspectionId: string;
  questionId: string;
  path: string; // cílová cesta v úložišti – pevná, aby opakovaný pokus nevytvořil duplikát
  fileName: string;
  mime: string;
  blob: Blob;
  createdAt: number;
};

const DB = "ms-offline";
const STORE = "files";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: "id" });
      store.createIndex("inspection", "inspectionId");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => {
      db.close();
      resolve(r.result);
    };
    t.onerror = () => {
      db.close();
      reject(t.error);
    };
  });
}

export const offlineFilesSupported = () => typeof indexedDB !== "undefined";

export async function queueFile(f: QueuedFile) {
  await tx("readwrite", (s) => s.put(f));
}

export async function unqueueFile(id: string) {
  await tx("readwrite", (s) => s.delete(id));
}

export async function queuedFiles(inspectionId: string): Promise<QueuedFile[]> {
  try {
    const all = await tx<QueuedFile[]>("readonly", (s) => s.index("inspection").getAll(inspectionId));
    return all.sort((a, b) => a.createdAt - b.createdAt);
  } catch {
    return [];
  }
}

/** Chyba kvůli výpadku sítě (má smysl zkusit znovu), ne zamítnutí serverem. */
export function isNetworkError(e: unknown) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const msg = e instanceof Error ? e.message : typeof e === "object" && e ? String((e as { message?: unknown }).message ?? "") : String(e);
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|internet connection/i.test(msg);
}

/**
 * Nahraje přílohu ze fronty. Je bezpečné volat opakovaně – soubor ani záznam
 * se nezdvojí. Vrací id záznamu přílohy.
 */
export async function uploadQueued(supabase: SupabaseClient, f: QueuedFile): Promise<string> {
  const { error: upErr } = await supabase.storage.from("attachments").upload(f.path, f.blob, { contentType: f.mime });
  // soubor už mohl být nahrán při minulém pokusu, jen nedorazila odpověď
  if (upErr && !/exists|duplicate/i.test(upErr.message)) throw upErr;

  const { data: existing, error: selErr } = await supabase
    .from("attachments")
    .select("id")
    .eq("storage_path", f.path)
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing) return existing.id as string;

  const { data, error } = await supabase
    .from("attachments")
    .insert({
      inspection_id: f.inspectionId,
      question_id: f.questionId,
      storage_path: f.path,
      file_name: f.fileName,
      mime_type: f.mime,
      size_bytes: f.blob.size,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}
