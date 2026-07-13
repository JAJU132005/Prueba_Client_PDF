import type { VitePWAOptions } from "vite-plugin-pwa";

// Import relativo (no alias `@`): `vite.config.ts` carga este módulo y su loader
// no resuelve el alias `@` (igual que importa `./src/pwa/pwaConfig` de forma
// relativa). Ver design.md ("vite.config no resuelve el alias @").
import { PWA_MANIFEST } from "./manifest";

/**
 * Opciones del plugin PWA. Estrategia: `generateSW` con **precache puro** del
 * build (shell + assets/WASM) y `navigateFallback` al shell para rutas SPA
 * offline. **Sin `runtimeCaching`**: el SW no intercepta ni cachea peticiones en
 * runtime hacia ningún origen → invariante cero-backend. Sin notificaciones
 * push ni replicación en segundo plano. (R13–R21, R23)
 */
export const PWA_OPTIONS = {
  registerType: "autoUpdate",
  injectRegister: false,
  // Copia mutable del manifest `as const` (el plugin tipa `icons` como mutable);
  // deep-equal a `PWA_MANIFEST` (R13).
  manifest: {
    ...PWA_MANIFEST,
    icons: PWA_MANIFEST.icons.map((icon) => ({ ...icon })),
  },
  devOptions: { enabled: false },
  workbox: {
    globPatterns: ["**/*.{html,css,js,mjs,wasm,woff2,png,svg,ico,json}"],
    navigateFallback: "index.html",
    // Cache-busting: al activarse un SW nuevo, workbox elimina los precachés de
    // builds anteriores en vez de servir assets obsoletos. Combinado con
    // `registerType: "autoUpdate"` (skipWaiting + clientsClaim), un build nuevo
    // toma el control y limpia lo viejo sin esperar al cierre de pestañas. (#42 R7)
    cleanupOutdatedCaches: true,
    // El core WASM de Tesseract.js (`/tesseract/…`, feature #26) supera el
    // límite por defecto de workbox (2 MiB). Se eleva para precachear esos
    // assets locales y mantener el OCR disponible offline, coherente con la
    // estrategia de precache puro. (#15, #26)
    maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
  },
} satisfies Partial<VitePWAOptions>;
