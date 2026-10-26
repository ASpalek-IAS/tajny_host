"use client";

import { useEffect } from "react";

/** Zaregistruje service worker (offline režim a instalace aplikace). */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      /* bez service workeru aplikace funguje dál, jen bez offline režimu */
    });
  }, []);
  return null;
}

/** Pošle zprávu aktivnímu service workeru a počká na odpověď. */
async function ask<T>(msg: unknown, timeoutMs = 60000): Promise<T | null> {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((r) => setTimeout(() => r(null), 5000)),
  ]);
  const sw = reg?.active;
  if (!sw) return null;
  return new Promise<T | null>((resolve) => {
    const ch = new MessageChannel();
    const t = setTimeout(() => resolve(null), timeoutMs);
    ch.port1.onmessage = (e) => {
      clearTimeout(t);
      resolve(e.data as T);
    };
    sw.postMessage(msg, [ch.port2]);
  });
}

/** Stáhne stránky do zařízení pro offline použití. Vrací počet uložených stránek. */
export async function precachePages(urls: string[]) {
  const r = await ask<{ ok: number }>({ type: "precache", urls });
  return r?.ok ?? null;
}

/** Smaže uložené stránky (při odhlášení). */
export async function clearOfflinePages() {
  await ask({ type: "clear" }, 3000);
}
