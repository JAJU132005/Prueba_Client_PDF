import * as pdfjs from "pdfjs-dist";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";

import {
  normalizedBoxFromCanvas,
  normalizedBoxToPixels,
  pagesWithRedactions,
  redactPdf,
  type NormalizedBox,
  type RedactedPageImage,
} from "@/pdf/redact";
import { InvalidPdfError, RedactFailedError } from "@/pdf/types";

/** PNG 1×1 válido e incrustable por pdf-lib. */
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

/** Crea un PDF con `texts.length` páginas 200×300, cada una con su texto. */
async function makeTextPdf(texts: readonly string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const text of texts) {
    const page = doc.addPage([200, 300]);
    page.drawText(text, { x: 20, y: 150, size: 18, font });
  }
  return doc.save();
}

/**
 * Extrae el texto de cada página con pdfjs-dist (sin `workerSrc`), como en
 * `pageNumbers.test.ts`. (patrón `extractPageTexts` de T7)
 */
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

describe("normalizedBoxFromCanvas (R14)", () => {
  it("normaliza esquinas en cualquier orden de arrastre a [0,1]", () => {
    const forward = normalizedBoxFromCanvas(
      { x: 25, y: 60 },
      { x: 75, y: 180 },
      100,
      300,
      2,
    );
    const reverse = normalizedBoxFromCanvas(
      { x: 75, y: 180 },
      { x: 25, y: 60 },
      100,
      300,
      2,
    );
    for (const box of [forward, reverse]) {
      expect(box.pageIndex).toBe(2);
      expect(box.left).toBeCloseTo(0.25, 10);
      expect(box.top).toBeCloseTo(0.2, 10);
      expect(box.width).toBeCloseTo(0.5, 10);
      expect(box.height).toBeCloseTo(0.4, 10);
    }
    // El orden del arrastre no altera la caja resultante.
    expect(reverse).toEqual(forward);
  });

  it("acota al lienzo cuando el arrastre se sale de los bordes", () => {
    const box = normalizedBoxFromCanvas(
      { x: -40, y: -40 },
      { x: 200, y: 600 },
      100,
      300,
      0,
    );
    expect(box).toEqual({ pageIndex: 0, left: 0, top: 0, width: 1, height: 1 });
  });
});

describe("normalizedBoxToPixels (R15)", () => {
  it("escala la caja por las dimensiones del bitmap", () => {
    const box: NormalizedBox = {
      pageIndex: 0,
      left: 0.25,
      top: 0.5,
      width: 0.25,
      height: 0.25,
    };
    expect(normalizedBoxToPixels(box, 400, 800)).toEqual({
      left: 100,
      top: 400,
      width: 100,
      height: 200,
    });
  });
});

describe("pagesWithRedactions (R16, R7)", () => {
  it("devuelve índices ordenados y sin duplicados", () => {
    const boxes: NormalizedBox[] = [
      { pageIndex: 3, left: 0, top: 0, width: 0.1, height: 0.1 },
      { pageIndex: 1, left: 0, top: 0, width: 0.1, height: 0.1 },
      { pageIndex: 3, left: 0.2, top: 0.2, width: 0.1, height: 0.1 },
      { pageIndex: 0, left: 0, top: 0, width: 0.1, height: 0.1 },
    ];
    expect(pagesWithRedactions(boxes)).toEqual([0, 1, 3]);
  });

  it("devuelve lista vacía sin cajas", () => {
    expect(pagesWithRedactions([])).toEqual([]);
  });
});

describe("redactPdf — SEGURIDAD + PRESERVACIÓN (R3, R4, R6)", () => {
  it("elimina el texto de la página redactada y conserva el de la intacta", async () => {
    const input = await makeTextPdf(["SECRETO-123", "INTACTO-456"]);
    // Confirma que el texto conocido está presente antes de redactar. Se extrae
    // sobre una COPIA porque pdfjs transfiere/neutraliza el buffer de entrada.
    const before = await extractPageTexts(input.slice());
    expect(before[0]).toContain("SECRETO-123");
    expect(before[1]).toContain("INTACTO-456");

    const redactedPages: RedactedPageImage[] = [
      { pageIndex: 0, bytes: makePng(), mimeType: "image/png" },
    ];
    const out = await redactPdf(input, redactedPages);

    const after = await extractPageTexts(out);
    // Página 0 redactada → su capa de texto desapareció. (R3, R4)
    expect(after[0]).not.toContain("SECRETO-123");
    expect(after[0].trim()).toBe("");
    // Página 1 intacta → conserva su texto vectorial. (R6)
    expect(after[1]).toContain("INTACTO-456");
  });
});

describe("redactPdf — tamaño de página (R18)", () => {
  it("la página redactada conserva el tamaño de la original", async () => {
    const input = await makeTextPdf(["A", "B"]);
    const out = await redactPdf(input, [
      { pageIndex: 1, bytes: makePng(), mimeType: "image/png" },
    ]);
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(2);
    const size = doc.getPage(1).getSize();
    expect(size.width).toBeCloseTo(200);
    expect(size.height).toBeCloseTo(300);
  });
});

describe("redactPdf — errores (R11, R12, R13)", () => {
  it("bytes no-PDF → InvalidPdfError", async () => {
    await expect(
      redactPdf(new Uint8Array([0x68, 0x69]), [
        { pageIndex: 0, bytes: makePng(), mimeType: "image/png" },
      ]),
    ).rejects.toBeInstanceOf(InvalidPdfError);
  });

  it("redactedPages vacío → RedactFailedError", async () => {
    const input = await makeTextPdf(["A"]);
    await expect(redactPdf(input, [])).rejects.toBeInstanceOf(
      RedactFailedError,
    );
  });

  it("pageIndex fuera de rango → RedactFailedError", async () => {
    const input = await makeTextPdf(["A", "B"]);
    await expect(
      redactPdf(input, [
        { pageIndex: 9, bytes: makePng(), mimeType: "image/png" },
      ]),
    ).rejects.toBeInstanceOf(RedactFailedError);
  });

  it("pageIndex duplicado → RedactFailedError", async () => {
    const input = await makeTextPdf(["A", "B"]);
    await expect(
      redactPdf(input, [
        { pageIndex: 0, bytes: makePng(), mimeType: "image/png" },
        { pageIndex: 0, bytes: makePng(), mimeType: "image/png" },
      ]),
    ).rejects.toBeInstanceOf(RedactFailedError);
  });
});

describe("redactPdf — progreso (R17)", () => {
  it("emite progreso monótono terminando exactamente en 1", async () => {
    const input = await makeTextPdf(["A", "B", "C"]);
    const progress: number[] = [];
    await redactPdf(
      input,
      [{ pageIndex: 1, bytes: makePng(), mimeType: "image/png" }],
      (p) => progress.push(p),
    );
    expect(progress.length).toBeGreaterThan(0);
    expect(progress[0]).toBe(0);
    expect(progress[progress.length - 1]).toBe(1);
    for (let i = 1; i < progress.length; i++) {
      expect(progress[i]).toBeGreaterThanOrEqual(progress[i - 1]);
    }
  });
});
