import { PDFDocument } from "pdf-lib";
import { afterEach, describe, expect, it, vi } from "vitest";

import { splitPdf } from "@/pdf/split";
import { InvalidPdfError, InvalidRangeError, SplitFailedError } from "@/pdf/types";

/**
 * Crea un PDF de `n` páginas donde cada página tiene un tamaño distinto por
 * índice (ancho = 100 + i), de forma que el orden de las páginas del resultado
 * sea observable a partir de `getSize()`.
 */
async function makePdf(n: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < n; i++) {
    doc.addPage([100 + i, 200 + i]);
  }
  return doc.save();
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("splitPdf (camino feliz)", () => {
  it("produce un PDF con tantas páginas como índices resueltos (R14, R17)", async () => {
    const pdf5 = await makePdf(5);
    const result = await splitPdf(pdf5, "1-3,5");
    const out = await PDFDocument.load(result);
    expect(out.getPageCount()).toBe(4);
  });

  it("extrae exactamente las páginas resueltas en el orden indicado (R15, R16)", async () => {
    const pdf5 = await makePdf(5);
    // Desordenado: "5,1-3" → páginas 5,1,2,3 → anchos 104,100,101,102.
    const result = await splitPdf(pdf5, "5,1-3");
    const out = await PDFDocument.load(result);
    const widths = out.getPages().map((p) => Math.round(p.getWidth()));
    expect(widths).toEqual([104, 100, 101, 102]);
  });

  it("emite progreso: todos en [0,1] y el último es 1 (R22, R23, R24)", async () => {
    const pdf5 = await makePdf(5);
    const values: number[] = [];
    await splitPdf(pdf5, "1-3,5", (p) => values.push(p));

    expect(values.length).toBeGreaterThan(0);
    for (const p of values) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
    expect(values[values.length - 1]).toBe(1);
  });
});

describe("splitPdf (bordes / errores controlados)", () => {
  it("rechaza con InvalidPdfError ante bytes no-PDF y no resuelve a bytes (R18, R20)", async () => {
    const invalid = new Uint8Array([0x68, 0x69]); // "hi": no es un PDF
    await expect(splitPdf(invalid, "1")).rejects.toBeInstanceOf(InvalidPdfError);

    let resolved: Uint8Array | undefined;
    try {
      resolved = await splitPdf(invalid, "1");
    } catch {
      resolved = undefined;
    }
    expect(resolved).toBeUndefined();
  });

  it("rechaza con SplitFailedError si el PDF tiene 0 páginas (R19, R20)", async () => {
    // pdf-lib no produce de forma determinista un PDF cargable con 0 páginas
    // (al recargar un documento vacío infiere 1 página). Forzamos un documento
    // cargado con `getPageCount() === 0` para ejercitar la guarda real de
    // `splitPdf` sin depender del parser. El resto del test no se mockea.
    const zeroPageDoc = { getPageCount: () => 0 } as unknown as PDFDocument;
    vi.spyOn(PDFDocument, "load").mockResolvedValueOnce(zeroPageDoc);

    const input = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // bytes irrelevantes
    await expect(splitPdf(input, "1")).rejects.toBeInstanceOf(SplitFailedError);

    vi.spyOn(PDFDocument, "load").mockResolvedValueOnce(zeroPageDoc);
    let resolved: Uint8Array | undefined;
    try {
      resolved = await splitPdf(input, "1");
    } catch {
      resolved = undefined;
    }
    expect(resolved).toBeUndefined();
  });

  it("rechaza con InvalidRangeError ante un rango inválido y no resuelve a bytes (R20)", async () => {
    const pdf3 = await makePdf(3);
    await expect(splitPdf(pdf3, "9")).rejects.toBeInstanceOf(InvalidRangeError);

    let resolved: Uint8Array | undefined;
    try {
      resolved = await splitPdf(pdf3, "9");
    } catch {
      resolved = undefined;
    }
    expect(resolved).toBeUndefined();
  });
});
