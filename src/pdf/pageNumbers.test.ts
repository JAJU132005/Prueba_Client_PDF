import * as pdfjs from "pdfjs-dist";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import {
  PAGE_NUMBER_FORMATS,
  PAGE_NUMBER_POSITIONS,
  addPageNumbers,
  computeTextPosition,
  formatPageNumber,
  type PageNumbersOptions,
} from "@/pdf/pageNumbers";
import { InvalidPdfError, PageNumbersFailedError } from "@/pdf/types";

const MARGIN = 36;

/** Opciones base reutilizadas por los casos de la operación. */
function opts(overrides: Partial<PageNumbersOptions> = {}): PageNumbersOptions {
  return {
    position: "bottom-center",
    format: "n",
    startNumber: 1,
    fontSize: 12,
    ...overrides,
  };
}

/** Crea un PDF de `pageCount` páginas de 200×300 pt con pdf-lib. */
async function makePdf(pageCount: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    doc.addPage([200, 300]);
  }
  return doc.save();
}

/**
 * PDF cargable con un árbol de páginas vacío (`/Count 0`, `/Kids []`). pdf-lib
 * lo carga con `getPageCount() === 0` (a diferencia de un doc creado y guardado
 * vacío con pdf-lib, que al recargarse reporta 1 por un detalle del parser). La
 * tabla `xref` se construye con entradas de 20 bytes y offsets calculados desde
 * las longitudes reales (todo ASCII, byte == carácter), para que cargue de forma
 * estable en cualquier entorno. Sirve para el caso de 0 páginas. (R21)
 */
function makeZeroPagePdf(): Uint8Array {
  const header = "%PDF-1.7\n";
  const obj1 = "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n";
  const obj2 = "2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n";
  const off1 = header.length;
  const off2 = header.length + obj1.length;
  const xrefOffset = header.length + obj1.length + obj2.length;
  const pad = (n: number) => n.toString().padStart(10, "0");
  const xref =
    "xref\n0 3\n" +
    "0000000000 65535 f \n" +
    `${pad(off1)} 00000 n \n` +
    `${pad(off2)} 00000 n \n`;
  const trailer = `trailer\n<< /Size 3 /Root 1 0 R >>\nstartxref\n${String(
    xrefOffset,
  )}\n%%EOF`;
  const pdf = header + obj1 + obj2 + xref + trailer;
  return Uint8Array.from(pdf, (c) => c.charCodeAt(0));
}

const ZERO_PAGE_PDF = makeZeroPagePdf();

/**
 * Extrae el texto de cada página de `bytes` con pdfjs-dist. Sin `workerSrc`
 * real, pdf.js usa su worker simulado en el hilo principal (funciona en jsdom).
 * Opera sobre bytes en memoria, sin red. (R25)
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
    texts.push(
      tc.items.map((it) => ("str" in it ? it.str : "")).join(""),
    );
  }
  return texts;
}

describe("constantes (R1, R5)", () => {
  it("PAGE_NUMBER_FORMATS contiene exactamente 'n', 'n-of-total' y 'page-n' (R1)", () => {
    expect([...PAGE_NUMBER_FORMATS]).toEqual(["n", "n-of-total", "page-n"]);
  });

  it("PAGE_NUMBER_POSITIONS contiene exactamente las seis posiciones (R5)", () => {
    expect([...PAGE_NUMBER_POSITIONS]).toEqual([
      "bottom-left",
      "bottom-center",
      "bottom-right",
      "top-left",
      "top-center",
      "top-right",
    ]);
  });
});

describe("formatPageNumber (R2, R3, R4)", () => {
  it("formato 'n' devuelve solo el número (R2)", () => {
    expect(formatPageNumber("n", 3, 7)).toBe("3");
  });

  it("formato 'n-of-total' devuelve 'current / total' (R3)", () => {
    expect(formatPageNumber("n-of-total", 3, 7)).toBe("3 / 7");
  });

  it("formato 'page-n' devuelve 'Página current' (R4)", () => {
    expect(formatPageNumber("page-n", 3, 7)).toBe("Página 3");
  });
});

describe("computeTextPosition (R6, R7, R8, R9, R10)", () => {
  it("bottom-* fija y al margen (R6)", () => {
    expect(
      computeTextPosition("bottom-left", 200, 300, 20, 12, MARGIN).y,
    ).toBe(36);
  });

  it("top-* fija y en pageHeight − margin − fontSize (R7)", () => {
    expect(
      computeTextPosition("top-left", 200, 300, 20, 12, MARGIN).y,
    ).toBe(300 - 36 - 12);
  });

  it("*-left fija x al margen (R8)", () => {
    expect(
      computeTextPosition("bottom-left", 200, 300, 20, 12, MARGIN).x,
    ).toBe(36);
  });

  it("*-center centra el texto horizontalmente (R9)", () => {
    expect(
      computeTextPosition("bottom-center", 200, 300, 20, 12, MARGIN).x,
    ).toBe((200 - 20) / 2);
  });

  it("*-right alinea al borde derecho menos el margen (R10)", () => {
    expect(
      computeTextPosition("bottom-right", 200, 300, 20, 12, MARGIN).x,
    ).toBe(200 - 36 - 20);
  });
});

describe("addPageNumbers — camino feliz (R11, R12, R13, R16, R17, R18)", () => {
  it("dibuja exactamente una cadena por página con startNumber 1 (R11)", async () => {
    const input = await makePdf(3);
    const out = await addPageNumbers(input, opts({ format: "n" }));
    const texts = await extractPageTexts(out);
    expect(texts).toEqual(["1", "2", "3"]);
  });

  it("usa startNumber + i como número mostrado (R12)", async () => {
    const input = await makePdf(3);
    const out = await addPageNumbers(input, opts({ format: "n", startNumber: 5 }));
    const texts = await extractPageTexts(out);
    expect(texts[0]).toBe("5");
    expect(texts[1]).toBe("6");
  });

  it("conserva el número de páginas de la entrada (R13)", async () => {
    const input = await makePdf(3);
    const out = await addPageNumbers(input, opts());
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(3);
  });

  it("emite progreso en [0,1] terminando en 1 (R16, R17)", async () => {
    const input = await makePdf(3);
    const values: number[] = [];
    await addPageNumbers(input, opts(), (p) => values.push(p));
    expect(values.length).toBeGreaterThan(0);
    for (const p of values) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
    expect(values[values.length - 1]).toBe(1);
  });

  it("devuelve un PDF cargable por pdf-lib (R18)", async () => {
    const input = await makePdf(2);
    const out = await addPageNumbers(input, opts());
    await expect(PDFDocument.load(out)).resolves.toBeDefined();
  });
});

describe("addPageNumbers — acceptance #3 (R25)", () => {
  it("formato 'n-of-total' produce texto recuperable '1 / 3', '2 / 3', '3 / 3'", async () => {
    const input = await makePdf(3);
    const out = await addPageNumbers(
      input,
      opts({ format: "n-of-total", startNumber: 1 }),
    );
    const texts = await extractPageTexts(out);
    expect(texts[0]).toContain("1 / 3");
    expect(texts[1]).toContain("2 / 3");
    expect(texts[2]).toContain("3 / 3");
  });
});

describe("addPageNumbers — bordes (R19, R20, R21, R22, R23)", () => {
  it("rechaza con InvalidPdfError y sin bytes si la entrada no es un PDF (R19, R20)", async () => {
    await expect(
      addPageNumbers(new Uint8Array([0x68, 0x69]), opts()),
    ).rejects.toBeInstanceOf(InvalidPdfError);

    let resolved: Uint8Array | undefined;
    try {
      resolved = await addPageNumbers(new Uint8Array([0x68, 0x69]), opts());
    } catch {
      resolved = undefined;
    }
    expect(resolved).toBeUndefined();
  });

  it("rechaza con PageNumbersFailedError si el PDF tiene 0 páginas (R21)", async () => {
    await expect(addPageNumbers(ZERO_PAGE_PDF, opts())).rejects.toBeInstanceOf(
      PageNumbersFailedError,
    );
  });

  it("rechaza con PageNumbersFailedError si startNumber no es entero >= 0 (R22)", async () => {
    const input = await makePdf(1);
    await expect(
      addPageNumbers(input, opts({ startNumber: 1.5 })),
    ).rejects.toBeInstanceOf(PageNumbersFailedError);
    await expect(
      addPageNumbers(input, opts({ startNumber: -1 })),
    ).rejects.toBeInstanceOf(PageNumbersFailedError);
  });

  it("rechaza con PageNumbersFailedError si fontSize no es finito > 0 (R23)", async () => {
    const input = await makePdf(1);
    await expect(
      addPageNumbers(input, opts({ fontSize: 0 })),
    ).rejects.toBeInstanceOf(PageNumbersFailedError);
    await expect(
      addPageNumbers(input, opts({ fontSize: Number.NaN })),
    ).rejects.toBeInstanceOf(PageNumbersFailedError);
  });
});
