import type { Metadata, Viewport } from "next";
import { ServiceWorker } from "@/components/service-worker";
import "@fontsource-variable/inter";
import "./globals.css";

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_APP_NAME || "Mystery Shopping",
  description: "Plánování a vyhodnocování mystery shoppingových kontrol",
  appleWebApp: { capable: true, title: process.env.NEXT_PUBLIC_APP_NAME || "Mystery Shopping", statusBarStyle: "default" },
  icons: { apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = { themeColor: "#152b64" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs">
      <body className="min-h-screen">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
