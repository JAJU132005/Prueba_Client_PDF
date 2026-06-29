import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { mergePdfs } from "@/pdf/merge";
import { InvalidPdfError, MergeFailedError } from "@/pdf/types";

/** Crea un PDF mínimo con `n` páginas de tamaño `width`x`height`. */
async function makePdf(
  n: number,
  width: number,
  height: number,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < n; i++) {
    doc.addPage([width, height]);
  }
  return doc.save();
}

describe("mergePdfs (camino feliz)", () => {
  it("produce un PDF cuyo número de páginas es la suma de las entradas (R2)", async () => {
    const a = await makePdf(2, 100, 100);
    const b = await makePdf(3, 100, 100);

    const result = await mergePdfs([a, b]);

    const out = await PDFDocument.load(result);
    expect(out.getPageCount()).toBe(5);
  });

  it("respeta el orden de la lista de entrada (R3)", async () => {
    // Tamaños distintos por documento para observar el orden en el resultado.
    const a = await makePdf(2, 100, 100); // dos páginas 100x100
    const b = await makePdf(3, 200, 300); // tres páginas 200x300

    const result = await mergePdfs([a, b]);
    const out = await PDFDocument.load(result);
    const sizes = out
      .getPages()
      .map((p) => `${Math.round(p.getWidth())}x${Math.round(p.getHeight())}`);

    expect(sizes).toEqual([
      "100x100",
      "100x100",
      "200x300",
      "200x300",
      "200x300",
    ]);

    // Orden inverso debe producir la secuencia inversa.
    const reversed = await mergePdfs([b, a]);
    const outReversed = await PDFDocument.load(reversed);
    const sizesReversed = outReversed
      .getPages()
      .map((p) => `${Math.round(p.getWidth())}x${Math.round(p.getHeight())}`);
    expect(sizesReversed).toEqual([
      "200x300",
      "200x300",
      "200x300",
      "100x100",
      "100x100",
    ]);
  });

  it("emite progreso: todos en [0,1] y el último es 1 (R11, R12, R13)", async () => {
    const a = await makePdf(1, 100, 100);
    const b = await makePdf(1, 100, 100);
    const c = await makePdf(1, 100, 100);

    const values: number[] = [];
    await mergePdfs([a, b, c], (p) => values.push(p));

    expect(values.length).toBeGreaterThan(0);
    for (const p of values) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
    expect(values[values.length - 1]).toBe(1);
  });
});

describe("mergePdfs (bordes)", () => {
  it("rechaza con InvalidPdfError si un input no es un PDF y no resuelve a bytes (R6, R7)", async () => {
    const valid = await makePdf(1, 100, 100);
    const invalid = new Uint8Array([0x68, 0x69]); // "hi": no es un PDF

    const promise = mergePdfs([valid, invalid]);
    await expect(promise).rejects.toBeInstanceOf(InvalidPdfError);

    // Confirmamos que NO se resuelve a bytes de salida (R7).
    let resolved: Uint8Array | undefined;
    try {
      resolved = await mergePdfs([valid, invalid]);
    } catch {
      resolved = undefined;
    }
    expect(resolved).toBeUndefined();
  });

  it("rechaza con MergeFailedError si recibe menos de 2 PDFs (R8)", async () => {
    const only = await makePdf(1, 100, 100);
    await expect(mergePdfs([only])).rejects.toBeInstanceOf(MergeFailedError);
    await expect(mergePdfs([])).rejects.toBeInstanceOf(MergeFailedError);
  });
});
