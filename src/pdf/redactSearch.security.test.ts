/**
 * Round-trip de seguridad (#33, observación 2 del critic / R20): una caja
 * GENERADA POR BÚSQUEDA, proyectada al modelo `NormalizedBox` de #27 y pasada
 * por el pipeline seguro REAL (`pagesWithRedactions` + `redactPdf`), destruye la
 * capa de texto de su página. Verifica DIRECTAMENTE (no por proxy) que extraer
 * texto de la salida NO devuelve el término redactado.
 *
 * Complementa `redact.test.ts` (que prueba la destrucción a nivel de pipeline) y
 * los tests de UI de `RedactPdf.test.tsx` (que la cubren por proxy en jsdom,
 * donde canvas/worker son falsos y un round-trip real no es determinista).
 */

import * as pdfjs from "pdfjs-dist";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";

import {
  pagesWithRedactions,
  redactPdf,
  type NormalizedBox,
  type RedactedPageImage,
} from "@/pdf/redact";
import { findMatches, type PageTextGeometry } from "@/pdf/redactSearch";

/** PNG 1×1 válido e incrustable por pdf-lib (mismo que redact.test.ts). */
function makePng(): Uint8Array {
  const base64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAen63NgAAAAASUVORK5CYII=";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** PDF de 2 páginas 200×300; cada una con su texto en la baseline (20,150). */
async function makeTextPdf(texts: readonly string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const text of texts) {
    const page = doc.addPage([200, 300]);
    page.drawText(text, { x: 20, y: 150, size: 18, font });
  }
  return doc.save();
}

/** Extrae el texto por página con pdfjs (sin worker), como redact.test.ts. */
async function extractPageTexts(bytes: Uint8Array): Promise<string[]> {
  const pdf = await pdfjs.getDocument({
    data: bytes,
    useWorkerFetch: false,
    isEvalSupported: false,
  }).promise;
  const texts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    texts.push(tc.items.map((it) => ("str" in it ? it.str : "")).join(""));
  }
  return texts;
}

describe("redact_search — round-trip de seguridad (R20)", () => {
  it("una caja de BÚSQUEDA hace que su página pierda el texto redactado en la salida", async () => {
    const input = await makeTextPdf(["SECRETO-123", "INTACTO-456"]);

    // El término está presente antes de redactar (COPIA: pdfjs neutraliza el buffer).
    const before = await extractPageTexts(input.slice());
    expect(before[0]).toContain("SECRETO-123");

    // Geometría de la página 0 equivalente al texto real (baseline 20,150; 90×18).
    const geometry: PageTextGeometry[] = [
      {
        pageIndex: 0,
        pageWidthPts: 200,
        pageHeightPts: 300,
        items: [
          { str: "SECRETO-123", xPts: 20, yPts: 150, widthPts: 90, heightPts: 18 },
        ],
      },
    ];

    // La BÚSQUEDA genera la caja; se proyecta al modelo NormalizedBox de #27.
    const matches = findMatches(geometry, "SECRETO");
    expect(matches).toHaveLength(1);
    const boxes: NormalizedBox[] = matches.map((m) => ({
      pageIndex: m.box.pageIndex,
      left: m.box.left,
      top: m.box.top,
      width: m.box.width,
      height: m.box.height,
    }));

    // Solo la página 0 (la de la coincidencia) entra en el pipeline seguro.
    expect(pagesWithRedactions(boxes)).toEqual([0]);
    const redactedPages: RedactedPageImage[] = [
      { pageIndex: 0, bytes: makePng(), mimeType: "image/png" },
    ];
    const out = await redactPdf(input, redactedPages);

    const after = await extractPageTexts(out);
    // Página 0 rasterizada por la caja de búsqueda → su texto ya NO es extraíble.
    expect(after[0]).not.toContain("SECRETO-123");
    expect(after[0].trim()).toBe("");
    // Página 1 sin cajas → conserva su texto vectorial (no se rasteriza de más).
    expect(after[1]).toContain("INTACTO-456");
  });
});
