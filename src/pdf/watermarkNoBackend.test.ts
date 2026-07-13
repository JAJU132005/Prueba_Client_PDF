import { PDFDocument } from "pdf-lib";
import { afterEach, describe, expect, it, vi } from "vitest";

import watermarkSource from "@/pdf/watermark.ts?raw";
import watermarkRouteSource from "@/routes/Watermark.tsx?raw";
import pdfClientSource from "@/workers/pdfClient.ts?raw";
import pdfWorkerApiSource from "@/workers/pdfWorkerApi.ts?raw";
import { addWatermark, type WatermarkOptions } from "@/pdf/watermark";

/**
 * Invariante cero-backend (#42 R8): el flujo de marca de agua (dominio
 * `addWatermark` y ruta `Watermark`) no realiza peticiones de red con datos del
 * usuario. Se verifica de dos formas: (1) estáticamente, escaneando el fuente de
 * los módulos del flujo (leído vía `?raw` de Vite, sin `node:fs`, corre en
 * jsdom) en busca de APIs de red; (2) en runtime, ejecutando `addWatermark`
 * sobre bytes en memoria con `fetch`/red espiados y afirmando que no se invocan y
 * que la salida es determinista offline.
 */
const MODULES: { label: string; source: string }[] = [
  { label: "watermark.ts", source: watermarkSource },
  { label: "Watermark.tsx", source: watermarkRouteSource },
  { label: "pdfClient.ts", source: pdfClientSource },
  { label: "pdfWorkerApi.ts", source: pdfWorkerApiSource },
];

const FORBIDDEN: RegExp[] = [
  /fetch\(/,
  /XMLHttpRequest/,
  /WebSocket/,
  /sendBeacon/,
  /EventSource/,
];

/** Crea un PDF de `pageCount` páginas de 200×300 pt con pdf-lib. */
async function makePdf(pageCount: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    doc.addPage([200, 300]);
  }
  return doc.save();
}

// PNG 2×3, en memoria (misma constante usada en watermark.test.ts).
const PNG_2x3 = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAADklEQVR4nGP4DwYMKBQAvFgR71PJ/rgAAAAASUVORK5CYII=",
  ),
  (c) => c.charCodeAt(0),
);

function imageOpts(overrides: Partial<WatermarkOptions> = {}): WatermarkOptions {
  return {
    mode: "image",
    text: "CONFIDENCIAL",
    image: PNG_2x3,
    position: "center",
    opacity: 0.3,
    angle: 45,
    fontSize: 24,
    pages: "all",
    ...overrides,
  };
}

describe("watermark — invariante cero-backend (#42 R8)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  for (const { label, source } of MODULES) {
    it(`${label} no contiene llamadas de red sospechosas (#42 R8)`, () => {
      for (const pattern of FORBIDDEN) {
        expect(source).not.toMatch(pattern);
      }
    });
  }

  it("Watermark.tsx delega el trabajo en client.addWatermark (worker) y descarga con downloadBlob (#42 R8, R9)", () => {
    expect(watermarkRouteSource).toContain(".addWatermark(");
    expect(watermarkRouteSource).toContain("downloadBlob");
  });

  it("addWatermark opera sobre bytes en memoria sin invocar fetch/red (#42 R8)", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const input = await makePdf(2);
    const out = await addWatermark(input, imageOpts());
    expect(out.byteLength).toBeGreaterThan(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("produce una salida determinista offline (dos ejecuciones, mismo tamaño) (#42 R8)", async () => {
    const input = await makePdf(2);
    const a = await addWatermark(input, imageOpts());
    const b = await addWatermark(input, imageOpts());
    expect(a.byteLength).toBe(b.byteLength);
  });
});
