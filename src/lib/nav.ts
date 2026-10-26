import type { NavItem } from "@/components/nav-links";
import type { Role } from "@/lib/types";

export function navFor(role: Role, pendingApprovals = 0): NavItem[] {
  if (role === "admin")
    return [
      { href: "/admin", label: "Přehled", exact: true },
      { href: "/admin/kontroly", label: "Kontroly", badge: pendingApprovals },
      { href: "/admin/firmy", label: "Firmy" },
      { href: "/admin/uzivatele", label: "Agenti a správci" },
      { href: "/admin/reporty", label: "Reporty" },
      { href: "/admin/ucetnictvi", label: "Účetnictví" },
    ];
  if (role === "client")
    return [
      { href: "/klient", label: "Přehled", exact: true },
      { href: "/klient/kontroly", label: "Kontroly" },
      { href: "/klient/srovnani", label: "Srovnání provozoven" },
    ];
  return [{ href: "/agent", label: "Moje kontroly" }];
}
