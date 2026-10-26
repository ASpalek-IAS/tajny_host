"use client";

import { logout } from "@/app/auth/actions";
import { clearOfflinePages } from "@/components/service-worker";
import { clearSnapshots, hasPendingDrafts } from "@/lib/offline-draft";

/**
 * Odhlášení. Smaže z kontroly uložené v zařízení (offline režim), aby je po
 * odhlášení nikdo neviděl. Neodeslané odpovědi a fotky zůstanou a odešlou se
 * po dalším přihlášení – na to uživatele upozorníme.
 */
export function LogoutButton({ className, label }: { className?: string; label: string }) {
  return (
    <form
      action={logout}
      onSubmit={(e) => {
        if (
          hasPendingDrafts() &&
          !confirm("V zařízení jsou neodeslané odpovědi. Odešlou se, až se znovu přihlásíte a kontrolu otevřete. Přesto se odhlásit?")
        ) {
          e.preventDefault();
          return;
        }
        clearSnapshots();
        clearOfflinePages();
      }}
    >
      <button className={className}>{label}</button>
    </form>
  );
}
