import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Aplikace je celá za přihlášením, stránky se renderují na každý požadavek.
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  experimental: {
    // loga firem až 2 MB (+ režie formuláře)
    serverActions: { bodySizeLimit: "3mb" },
  },
  serverExternalPackages: ["@react-pdf/renderer", "exceljs"],
  outputFileTracingIncludes: {
    "/api/inspections/[id]/pdf": ["./src/lib/pdf/fonts/**"],
  },
  async headers() {
    return [
      {
        // service worker se nesmí cachovat, jinak by se nová verze k uživatelům nedostala
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co" }],
  },
};

export default nextConfig;
