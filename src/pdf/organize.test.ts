import { PDFDocument } from "pdf-lib";
import { afterEach, describe, expect, it, vi } from "vitest";

import { organizePdf } from "@/pdf/organize";
import {
  InvalidPageOrderError,
  InvalidPdfError,
  OrganizeFailedError,
} from "@/pdf/types";

/**
 * Crea un PDF de `n` páginas con tamaños distinguibles: la página `i` mide
 * `[100 + i, 200 + i]`, de modo que su tamaño identifica su índice original.
 */
async function makePdf(n: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < n; i++) {
    doc.addPage([100 + i, 200 + i]);
  }
  return doc.save();
}

/** Devuelve el `originalIndex` inferido de cada página por su ancho. */
async function inferredOrder(bytes: Uint8Array): Promise<number[]> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((p) => Math.round(p.getWidth()) - 100);
}

describe("organizePdf (camino feliz)", () => {
  it("copia las páginas en el orden exacto de pageOrder, eliminando las omitidas (R11, R12)", async () => {
    const pdf3 = await makePdf(3);
    const out = await organizePdf(pdf3, [2, 0]);
    expect(await inferredOrder(out)).toEqual([2, 0]);
  });

  it("el resultado tiene tantas páginas como pageOrder.length (R13)", async () => {
    const pdf3 = await makePdf(3);
    const out = await organizePdf(pdf3, [2, 0]);
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(2);
  });

  it("devuelve un Uint8Array de un PDF cargable (R11)", async () => {
    const pdf3 = await makePdf(3);
    const out = await organizePdf(pdf3, [0, 1, 2]);
    expect(out).toBeInstanceOf(Uint8Array);
    await expect(PDFDocument.load(out)).resolves.toBeDefined();
  });

  it("emite progreso en [0,1] terminando en 1 (R19, R20, R21)", async () => {
    const pdf3 = await makePdf(3);
    const progress: number[] = [];
    await organizePdf(pdf3, [2, 0], (p) => progress.push(p));
    expect(progress.length).toBeGreaterThan(0);
    for (const p of progress) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
    expect(progress[progress.length - 1]).toBe(1);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("organizePdf (bordes/errores controlados, sin salida)", () => {
  it("lanza InvalidPdfError ante bytes no-PDF (R14, R18)", async () => {
    const notPdf = new Uint8Array([0x68, 0x69]);
    let out: Uint8Array | undefined;
    try {
      out = await organizePdf(notPdf, [0]);
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidPdfError);
    }
    expect(out).toBeUndefined();
  });

  it("lanza OrganizeFailedError si el PDF tiene 0 páginas (R15, R18)", async () => {
    // pdf-lib infiere 1 página al recargar un documento vacío. Forzamos un
    // documento con `getPageCount() === 0` para ejercitar la guarda real.
    const zeroPageDoc = { getPageCount: () => 0 } as unknown as PDFDocument;
    vi.spyOn(PDFDocument, "load").mockResolvedValueOnce(zeroPageDoc);
    const input = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    let out: Uint8Array | undefined;
    try {
      out = await organizePdf(input, [0]);
    } catch (error) {
      expect(error).toBeInstanceOf(OrganizeFailedError);
    }
    expect(out).toBeUndefined();
  });

  it("lanza OrganizeFailedError si pageOrder está vacío (R16, R18)", async () => {
    const pdf3 = await makePdf(3);
    let out: Uint8Array | undefined;
    try {
      out = await organizePdf(pdf3, []);
    } catch (error) {
      expect(error).toBeInstanceOf(OrganizeFailedError);
    }
    expect(out).toBeUndefined();
  });

  it("lanza InvalidPageOrderError si un índice está fuera de rango (R17, R18)", async () => {
    const pdf3 = await makePdf(3);
    let out: Uint8Array | undefined;
    try {
      out = await organizePdf(pdf3, [5]);
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidPageOrderError);
    }
    expect(out).toBeUndefined();
  });
});
