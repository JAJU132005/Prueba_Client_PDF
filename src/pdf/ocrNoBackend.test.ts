import { describe, expect, it } from "vitest";

import ocrPdfSource from "@/pdf/ocrPdf.ts?raw";
import tesseractEngineSource from "@/lib/tesseractOcrEngine.ts?raw";
import ocrWorkerCacheSource from "@/lib/ocrWorkerCache.ts?raw";
import pdfWorkerApiSource from "@/workers/pdfWorkerApi.ts?raw";
import pdfClientSource from "@/workers/pdfClient.ts?raw";
import ocrRouteSource from "@/routes/Ocr.tsx?raw";

/**
 * Invariante cero-red (R20, R26, R27): los módulos de la feature de OCR no
 * realizan peticiones de red con los datos del usuario; el motor de Tesseract.js
 * se configura con rutas LOCALES (`/tesseract/…`) sin CDN; y la descarga usa
 * `downloadBlob` (URL de objeto en memoria). El fuente se lee vía `?raw` de Vite
 * (sin `node:fs`), por lo que el test corre en jsdom.
 */
const MODULES: { label: string; source: string }[] = [
  { label: "ocrPdf.ts", source: ocrPdfSource },
  { label: "tesseractOcrEngine.ts", source: tesseractEngineSource },
  { label: "ocrWorkerCache.ts", source: ocrWorkerCacheSource },
  { label: "pdfWorkerApi.ts", source: pdfWorkerApiSource },
  { label: "pdfClient.ts", source: pdfClientSource },
  { label: "Ocr.tsx", source: ocrRouteSource },
];

const FORBIDDEN: RegExp[] = [
  /fetch\(/,
  /XMLHttpRequest/,
  /WebSocket/,
  /sendBeacon/,
];

describe("ocr — invariante cero-red (R20, R26, R27)", () => {
  for (const { label, source } of MODULES) {
    it(`${label} no contiene llamadas de red sospechosas (R26)`, () => {
      for (const pattern of FORBIDDEN) {
        expect(source).not.toMatch(pattern);
      }
    });
  }

  it("tesseractOcrEngine.ts usa rutas locales /tesseract/ y ningún CDN (R20)", () => {
    expect(tesseractEngineSource).toContain("/tesseract/");
    expect(tesseractEngineSource).not.toMatch(/unpkg/i);
    expect(tesseractEngineSource).not.toMatch(/jsdelivr/i);
    expect(tesseractEngineSource).not.toMatch(/cdn/i);
    expect(tesseractEngineSource).not.toMatch(/https?:\/\//i);
  });

  it("Ocr.tsx usa downloadBlob para la descarga local (R27)", () => {
    expect(ocrRouteSource).toContain("downloadBlob");
  });

  it("Ocr.tsx no importa tesseract.js ni pdf-lib (R26, R27)", () => {
    expect(ocrRouteSource).not.toMatch(/from ["']tesseract\.js["']/);
    expect(ocrRouteSource).not.toMatch(/from ["']pdf-lib["']/);
  });
});

describe("ocr_expanded #32 — invariantes cero-red (R4, R22, R23)", () => {
  it("ocrPdf.ts, tesseractOcrEngine.ts y Ocr.tsx sin red con datos del usuario (#32 R22)", () => {
    for (const source of [
      ocrPdfSource,
      tesseractEngineSource,
      ocrRouteSource,
    ]) {
      for (const pattern of FORBIDDEN) {
        expect(source).not.toMatch(pattern);
      }
    }
  });

  it("tesseractOcrEngine.ts referencia /tesseract/lang y ningún CDN (#32 R4)", () => {
    expect(tesseractEngineSource).toContain("/tesseract/lang");
    expect(tesseractEngineSource).not.toMatch(/unpkg/i);
    expect(tesseractEngineSource).not.toMatch(/jsdelivr/i);
    expect(tesseractEngineSource).not.toMatch(/cdn/i);
    expect(tesseractEngineSource).not.toMatch(/https?:\/\//i);
  });

  it("Ocr.tsx no importa pdf-lib ni tesseract.js e invoca client.ocr (#32 R23)", () => {
    expect(ocrRouteSource).not.toMatch(/from ["']pdf-lib["']/);
    expect(ocrRouteSource).not.toMatch(/from ["']tesseract\.js["']/);
    expect(ocrRouteSource).toMatch(/pdfClient\.ocr\(/);
    expect(ocrRouteSource).not.toMatch(/ocrImages\(/);
  });
});

describe("fix_ocr_recognition #34 — cero-red, rutas locales y formato (R3a, R3b, R4)", () => {
  it("ocrWorkerCache.ts no contiene llamadas de red sospechosas (#34 R3a)", () => {
    for (const pattern of FORBIDDEN) {
      expect(ocrWorkerCacheSource).not.toMatch(pattern);
    }
  });

  it("ocrWorkerCache.ts no referencia CDN ni URLs http(s):// (#34 R3a, R3b)", () => {
    expect(ocrWorkerCacheSource).not.toMatch(/unpkg/i);
    expect(ocrWorkerCacheSource).not.toMatch(/jsdelivr/i);
    expect(ocrWorkerCacheSource).not.toMatch(/cdn/i);
    expect(ocrWorkerCacheSource).not.toMatch(/https?:\/\//i);
  });

  it("tesseractOcrEngine.ts define todas las rutas de asset bajo /tesseract/ (#34 R3b)", () => {
    // Cada literal de ruta de asset de Tesseract es del propio origen.
    const assetPaths = ["/tesseract/worker.min.js", "/tesseract/", "/tesseract/lang"];
    for (const path of assetPaths) {
      expect(tesseractEngineSource).toContain(path);
    }
    expect(tesseractEngineSource).not.toMatch(/https?:\/\//i);
  });

  it("tesseractOcrEngine.ts pasa gzip: false a createWorker (#34 R4)", () => {
    expect(tesseractEngineSource).toMatch(/gzip:\s*false/);
  });
});
