import * as pdfjs from "pdfjs-dist";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";

import {
  extractPageTextGeometry,
  type PdfDocumentLoader,
} from "@/lib/pdfjsTextExtractor";
import { InvalidPdfError } from "@/pdf/types";

// El módulo fija `GlobalWorkerOptions.workerSrc` al asset `?url`, que en jsdom no
// puede lanzar un Worker real. Se apunta al especificador del módulo del worker
// para que pdf.js lo cargue como worker "falso" en el hilo principal (node),
// permitiendo parsear un PDF real de pdf-lib dentro del test.
beforeAll(() => {
  pdfjs.GlobalWorkerOptions.workerSrc = "pdfjs-dist/build/pdf.worker.min.mjs";
});

/**
 * Loader que usa pdf.js REAL en el hilo principal (sin worker) para poder
 * parsear en jsdom, igual que `redact.test.ts`/`pageNumbers.test.ts`. Así el
 * test ejercita el mapeo real de un PDF creado con pdf-lib.
 */
const realLoad: PdfDocumentLoader = (input) =>
  pdfjs.getDocument({
    data: input,
    useWorkerFetch: false,
    isEvalSupported: false,
  }) as unknown as ReturnType<PdfDocumentLoader>;

async function makeTextPdf(text: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([200, 300]);
  page.drawText(text, { x: 20, y: 150, size: 18, font });
  return doc.save();
}

describe("extractPageTextGeometry (R10, R11)", () => {
  it("mapea los ítems de un PDF mínimo (pdf-lib) a TextItemGeometry", async () => {
    const bytes = await makeTextPdf("SECRETO");
    const pages = await extractPageTextGeometry(bytes, realLoad);

    expect(pages).toHaveLength(1);
    const page = pages[0];
    expect(page.pageIndex).toBe(0);
    expect(page.pageWidthPts).toBeCloseTo(200, 1);
    expect(page.pageHeightPts).toBeCloseTo(300, 1);

    const joined = page.items.map((i) => i.str).join("");
    expect(joined).toContain("SECRETO");

    // La geometría del ítem que contiene el texto coincide con la posición de
    // dibujo (x=20, baseline y=150).
    const item = page.items.find((i) => i.str.includes("SECRETO"));
    expect(item).toBeDefined();
    if (item) {
      expect(item.xPts).toBeCloseTo(20, 0);
      expect(item.yPts).toBeCloseTo(150, 0);
      expect(item.widthPts).toBeGreaterThan(0);
      expect(item.heightPts).toBeGreaterThan(0);
    }
  });

  it("no detacha el buffer del llamante (clona los bytes)", async () => {
    const bytes = await makeTextPdf("HOLA");
    const copy = bytes.slice();
    await extractPageTextGeometry(bytes, realLoad);
    expect(bytes.byteLength).toBe(copy.byteLength);
    expect(Array.from(bytes.slice(0, 5))).toEqual(Array.from(copy.slice(0, 5)));
  });

  it("bytes basura → InvalidPdfError (R11)", async () => {
    const garbage = new Uint8Array([0x68, 0x69, 0x21]);
    await expect(
      extractPageTextGeometry(garbage, realLoad),
    ).rejects.toBeInstanceOf(InvalidPdfError);
  });
});
