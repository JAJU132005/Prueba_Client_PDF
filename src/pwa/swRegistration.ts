import { registerSW } from "virtual:pwa-register";

import { registerServiceWorker } from "@/pwa/registerServiceWorker";

/**
 * Inicializa la PWA en el arranque real. Único módulo que toca el módulo virtual
 * `virtual:pwa-register` y `navigator` (efecto no testeable en jsdom; cubierto
 * por el scan cero-backend). (R31)
 */
export function initPwa(): boolean {
  return registerServiceWorker(() => registerSW({ immediate: true }), {
    isProduction: import.meta.env.PROD,
    hasServiceWorker:
      typeof navigator !== "undefined" && "serviceWorker" in navigator,
  });
}
