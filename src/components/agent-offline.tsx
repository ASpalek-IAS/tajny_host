"use client";

import { useEffect, useState } from "react";
import { precachePages } from "@/components/service-worker";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const DISMISS_KEY = "ms-install-dismissed";

/**
 * Na přehledu agenta: stáhne přiřazené kontroly do zařízení (offline režim)
 * a nabídne instalaci aplikace na plochu.
 */
export function AgentOffline({ inspectionIds }: { inspectionIds: string[] }) {
  const [state, setState] = useState<"idle" | "saving" | "done" | "offline" | "unsupported">("idle");
  const [count, setCount] = useState(0);
  const key = inspectionIds.join(",");

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("caches" in window)) {
      setState("unsupported"); // eslint-disable-line react-hooks/set-state-in-effect
      return;
    }
    let cancelled = false;
    const run = async () => {
      if (!navigator.onLine) {
        setState("offline");
        return;
      }
      setState("saving");
      const ids = key ? key.split(",") : [];
      const ok = await precachePages(["/agent", ...ids.map((id) => `/agent/kontroly/${id}`)]);
      if (cancelled) return;
      if (ok === null) setState("unsupported");
      else {
        setCount(Math.max(0, ok - 1));
        setState("done");
      }
    };
    run();
    window.addEventListener("online", run);
    return () => {
      cancelled = true;
      window.removeEventListener("online", run);
    };
  }, [key]);

  const total = key ? key.split(",").length : 0;

  return (
    <div className="mb-6 space-y-3">
      <InstallCard />
      {state !== "unsupported" && state !== "idle" && total > 0 && (
        <p className="flex items-center gap-2 text-xs text-ink-500">
          <span
            className={
              "h-1.5 w-1.5 rounded-full " + (state === "done" ? "bg-good" : state === "offline" ? "bg-mid" : "animate-pulse bg-ink-300")
            }
          />
          {state === "saving" && "Ukládám kontroly do zařízení pro práci bez signálu…"}
          {state === "done" &&
            (count >= total
              ? `${total === 1 ? "Kontrola je uložená" : `Všechny kontroly (${total}) jsou uložené`} v zařízení – můžete je vyplnit i bez signálu.`
              : `Uloženo ${count} z ${total} kontrol pro práci bez signálu.`)}
          {state === "offline" && "Jste offline – otevřít jde jen kontroly, které jste si dřív uložili s připojením."}
        </p>
      )}
    </div>
  );
}

function InstallCard() {
  const [mode, setMode] = useState<"hidden" | "prompt" | "ios">("hidden");
  const [evt, setEvt] = useState<BIPEvent | null>(null);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
    if (standalone) return;
    try {
      const d = Number(localStorage.getItem(DISMISS_KEY) || 0);
      if (Date.now() - d < 14 * 24 * 3600 * 1000) return;
    } catch {
      /* bez úložiště nevadí */
    }
    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
    if (ios) setMode("ios"); // eslint-disable-line react-hooks/set-state-in-effect
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as BIPEvent);
      setMode("prompt");
    };
    const onInstalled = () => setMode("hidden");
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* nic */
    }
    setMode("hidden");
  };

  if (mode === "hidden") return null;
  return (
    <div className="flex items-start gap-3 rounded-xl border border-brand-500/30 bg-brand-50 p-4 text-sm">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon-192.png" alt="" className="h-10 w-10 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink-900">Nainstalujte si aplikaci do telefonu</p>
        {mode === "prompt" ? (
          <p className="mt-0.5 text-ink-700">Otevřete ji jednou ikonou z plochy a kontroly vyplníte i bez signálu.</p>
        ) : (
          <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-ink-700">
            <li>
              Otevřete tuto stránku v <strong>Safari</strong>.
            </li>
            <li>
              Klepněte na <strong>Sdílet</strong> (čtvereček se šipkou nahoru).
            </li>
            <li>
              Zvolte <strong>Přidat na plochu</strong> a potvrďte <strong>Přidat</strong>.
            </li>
          </ol>
        )}
        <div className="mt-3 flex gap-2">
          {mode === "prompt" && evt && (
            <button
              type="button"
              onClick={async () => {
                await evt.prompt();
                const r = await evt.userChoice;
                if (r.outcome === "accepted") setMode("hidden");
              }}
              className="rounded-lg bg-brand-600 px-3 py-1.5 font-medium text-white"
            >
              Nainstalovat
            </button>
          )}
          <button type="button" onClick={dismiss} className="rounded-lg px-3 py-1.5 text-ink-600 hover:bg-white">
            Teď ne
          </button>
        </div>
      </div>
    </div>
  );
}
