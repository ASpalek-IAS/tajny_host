import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  const name = process.env.NEXT_PUBLIC_APP_NAME || "Mystery Shopping";
  return {
    name,
    short_name: name.length > 12 ? "Kontroly" : name,
    description: "Vyplňování a vyhodnocování mystery shoppingových kontrol",
    lang: "cs",
    // agent se po spuštění dostane rovnou ke svým kontrolám (ostatní role přesměruje aplikace)
    start_url: "/agent",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f5f7fa",
    theme_color: "#152b64",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
