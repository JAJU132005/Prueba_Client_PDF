import { describe, expect, it } from "vitest";

import compressPdfSource from "@/pdf/compressPdf.ts?raw";
import offscreenRecompressorSource from "@/lib/offscreenImageRecompressor.ts?raw";
import pdfWorkerApiSource from "@/workers/pdfWorkerApi.ts?raw";
import pdfClientSource from "@/workers/pdfClient.ts?raw";
import compressRouteSource from "@/routes/CompressPdf.tsx?raw";

/**
 * Invariante cero-backend (R34, R35): ninguno de los módulos de la feature de
 * compresión realiza peticiones de red con los datos del usuario, y la descarga
 * usa `downloadBlob` (URL de objeto en memoria), no `fetch`. El fuente se lee
 * vía `?raw` de Vite (sin `node:fs`), por lo que el test corre en jsdom.
 */
const MODULES: { label: string; source: string }[] = [
  { label: "compressPdf.ts", source: compressPdfSource },
  {
    label: "offscreenImageRecompressor.ts",
    source: offscreenRecompressorSource,
  },
  { label: "pdfWorkerApi.ts", source: pdfWorkerApiSource },
  { label: "pdfClient.ts", source: pdfClientSource },
  { label: "CompressPdf.tsx", source: compressRouteSource },
];

const FORBIDDEN: RegExp[] = [
  /fetch\(/,
  /XMLHttpRequest/,
  /WebSocket/,
  /sendBeacon/,
];

describe("compress — invariante cero-backend (R34, R35)", () => {
  for (const { label, source } of MODULES) {
    it(`${label} no contiene llamadas de red sospechosas (R34)`, () => {
      for (const pattern of FORBIDDEN) {
        expect(source).not.toMatch(pattern);
      }
    });
  }

  it("CompressPdf.tsx usa downloadBlob para la descarga local (R34, R35)", () => {
    expect(compressRouteSource).toContain("downloadBlob");
  });
});
