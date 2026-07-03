import { describe, expect, it } from "vitest";

import manifestSource from "@/pwa/manifest.ts?raw";
import pwaConfigSource from "@/pwa/pwaConfig.ts?raw";
import registerSource from "@/pwa/registerServiceWorker.ts?raw";
import swRegistrationSource from "@/pwa/swRegistration.ts?raw";
import indexHtmlSource from "../../index.html?raw";
import viteConfigSource from "../../vite.config.ts?raw";
import mainSource from "../main.tsx?raw";

/**
 * Invariante cero-backend de la PWA (R22, R23, R28) + integración (R29, R30,
 * R31). El fuente se lee vía `?raw` de Vite (sin `node:fs`), por lo que el test
 * corre en jsdom. Refuerza que los módulos PWA no hacen red ni envían datos del
 * usuario y que la integración con build/arranque está cableada.
 */
const NETWORK_PATTERNS: RegExp[] = [
  /fetch\(/,
  /XMLHttpRequest/,
  /WebSocket/,
  /sendBeacon/,
];

const PWA_MODULES: { label: string; source: string }[] = [
  { label: "manifest.ts", source: manifestSource },
  { label: "pwaConfig.ts", source: pwaConfigSource },
  { label: "registerServiceWorker.ts", source: registerSource },
  { label: "swRegistration.ts", source: swRegistrationSource },
];

describe("pwa — invariante cero-backend (R22, R23, R28)", () => {
  for (const { label, source } of PWA_MODULES) {
    it(`${label} no contiene llamadas de red sospechosas (R22)`, () => {
      for (const pattern of NETWORK_PATTERNS) {
        expect(source).not.toMatch(pattern);
      }
    });
  }

  it("pwaConfig.ts no referencia push ni background sync (R23)", () => {
    for (const pattern of [
      /PushManager/,
      /pushManager/,
      /backgroundSync/,
      /BackgroundSync/,
      /sync/,
    ]) {
      expect(pwaConfigSource).not.toMatch(pattern);
    }
  });

  it("registerServiceWorker.ts es puro: sin DOM/navigator/React/módulo virtual (R28)", () => {
    for (const pattern of [
      /document/,
      /window/,
      /navigator/,
      /react/,
      /virtual:pwa-register/,
    ]) {
      expect(registerSource).not.toMatch(pattern);
    }
  });
});

describe("pwa — integración con build y arranque (R29, R30, R31)", () => {
  it("vite.config.ts registra VitePWA con PWA_OPTIONS (R29)", () => {
    expect(viteConfigSource).toContain("VitePWA");
    expect(viteConfigSource).toContain("PWA_OPTIONS");
  });

  it("index.html incluye <meta name=\"theme-color\"> (R30)", () => {
    expect(indexHtmlSource).toContain('name="theme-color"');
  });

  it("main.tsx invoca initPwa en el arranque (R31)", () => {
    expect(mainSource).toContain("initPwa");
  });
});
