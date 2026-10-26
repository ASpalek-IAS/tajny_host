import type { ReactNode } from "react";
import Image from "next/image";
// logo je součástí sestavení aplikace (nasadí se vždy s kódem a uloží i pro offline režim)
import logoFull from "@/assets/logo-full.png";
import logoMark from "@/assets/logo-mark.png";

export function AuthCard({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  const app = process.env.NEXT_PUBLIC_APP_NAME || "Mystery Shopping";
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <Image src={logoFull} alt={app} width={72} height={72} priority unoptimized className="h-[72px] w-[72px] rounded-2xl shadow-sm" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {sub && <p className="mt-1.5 text-sm text-ink-500">{sub}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}

/** Značka aplikace (oko z loga Tajný host). */
export function Logo({ className = "h-7 w-7" }: { className?: string }) {
  return <Image src={logoMark} alt="" aria-hidden width={28} height={28} unoptimized className={className + " rounded-lg"} />;
}
