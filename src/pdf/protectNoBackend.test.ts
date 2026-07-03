import { describe, expect, it } from "vitest";

import cantooEngineSource from "@/lib/cantooPdfCryptoEngine.ts?raw";
import protectPdfSource from "@/pdf/protectPdf.ts?raw";
import protectRouteSource from "@/routes/ProtectUnlock.tsx?raw";
import pdfClientSource from "@/workers/pdfClient.ts?raw";
import pdfWorkerApiSource from "@/workers/pdfWorkerApi.ts?raw";

/**
 * Invariante cero-backend (R32, R33, R33b): ninguno de los módulos de la feature
 * de proteger/desbloquear realiza peticiones de red con los datos del usuario ni
 * con la contraseña; la descarga usa `downloadBlob` (URL de objeto en memoria),
 * no `fetch`; y la UI no importa ninguna librería de cifrado. El fuente se lee
 * vía `?raw` de Vite (sin `node:fs`), por lo que el test corre en jsdom.
 */
const MODULES: { label: string; source: string }[] = [
  { label: "protectPdf.ts", source: protectPdfSource },
  { label: "cantooPdfCryptoEngine.ts", source: cantooEngineSource },
  { label: "pdfWorkerApi.ts", source: pdfWorkerApiSource },
  { label: "pdfClient.ts", source: pdfClientSource },
  { label: "ProtectUnlock.tsx", source: protectRouteSource },
];

const FORBIDDEN: RegExp[] = [
  /fetch\(/,
  /XMLHttpRequest/,
  /WebSocket/,
  /sendBeacon/,
];

describe("protect — invariante cero-backend (R32, R33, R33b)", () => {
  for (const { label, source } of MODULES) {
    it(`${label} no contiene llamadas de red sospechosas (R32)`, () => {
      for (const pattern of FORBIDDEN) {
        expect(source).not.toMatch(pattern);
      }
    });
  }

  it("ProtectUnlock.tsx usa downloadBlob para la descarga local (R32)", () => {
    expect(protectRouteSource).toContain("downloadBlob");
  });

  it("ProtectUnlock.tsx delega el trabajo en client.protect (R33)", () => {
    expect(protectRouteSource).toContain(".protect(");
  });

  it("ProtectUnlock.tsx no importa @cantoo/pdf-lib ni pdf-lib (R33b)", () => {
    expect(protectRouteSource).not.toMatch(/from ["']@cantoo\/pdf-lib["']/);
    expect(protectRouteSource).not.toMatch(/from ["']pdf-lib["']/);
  });
});
