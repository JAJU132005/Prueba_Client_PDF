/**
 * Manifest web de la PWA. Objeto plano y serializable (R12) para poder validarlo
 * en tests sin navegador y reutilizarlo en `PWA_OPTIONS`. Colores tomados de los
 * tokens de diseño (`--primary` y `--bg` de `@/design/tokens.css`). Rutas
 * relativas al mismo origen (R24). (R1–R11, R24)
 */
export const PWA_MANIFEST = {
  name: "clientpdf — Tus PDF, sin salir de tu navegador",
  short_name: "clientpdf",
  description:
    "Suite de herramientas PDF 100% local. Tus archivos nunca salen de tu navegador.",
  start_url: "/",
  scope: "/",
  display: "standalone",
  theme_color: "#4f46e5",
  background_color: "#f7f8fa",
  icons: [
    {
      src: "icons/icon-192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "icons/icon-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "icons/icon-maskable-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ],
} as const;
