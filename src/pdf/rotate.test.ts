import { PDFDocument, degrees } from "pdf-lib";
import { afterEach, describe, expect, it, vi } from "vitest";

import { rotatePdf } from "@/pdf/rotate";
import {
  InvalidPdfError,
  InvalidRangeError,
  InvalidRotationError,
  RotateFailedError,
} from "@/pdf/types";

/** Crea un PDF de `n` páginas, todas sin rotación inicial (0°). */
async function makePdf(n: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < n; i++) {
    doc.addPage([100 + i, 200 + i]);
  }
  return doc.save();
}

/** Devuelve los ángulos de rotación de cada página del PDF `bytes`. */
async function anglesOf(bytes: Uint8Array): Promise<number[]> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((p) => p.getRotation().angle);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("rotatePdf (reflejo en salida y selección)", () => {
  it("rota exactamente la página indicada y deja el resto intactas (R13, R14, R15)", async () => {
    const pdf3 = await makePdf(3);
    const result = await rotatePdf(pdf3, { angle: 90, pages: "2" });
    expect(await anglesOf(result)).toEqual([0, 90, 0]);
  });

  it("rota todas las páginas con pages 'all' (R6, R14)", async () => {
    const pdf3 = await makePdf(3);
    const result = await rotatePdf(pdf3, { angle: 180, pages: "all" });
    expect(await anglesOf(result)).toEqual([180, 180, 180]);
  });

  it("preserva el conteo de páginas del documento (R17)", async () => {
    const pdf3 = await makePdf(3);
    const result = await rotatePdf(pdf3, { angle: 90, pages: "all" });
    const out = await PDFDocument.load(result);
    expect(out.getPageCount()).toBe(3);
  });

  it("emite progreso: todos en [0,1] y el último es 1 (R24, R25, R26)", async () => {
    const pdf3 = await makePdf(3);
    const values: number[] = [];
    await rotatePdf(pdf3, { angle: 90, pages: "all" }, (p) => values.push(p));

    expect(values.length).toBeGreaterThan(0);
    for (const p of values) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
    expect(values[values.length - 1]).toBe(1);
  });
});

describe("rotatePdf (acumulación sobre rotación previa)", () => {
  it("suma el ángulo sobre la rotación previa de la página (R16)", async () => {
    // Página 0 ya viene con 90° de rotación.
    const doc = await PDFDocument.create();
    const page = doc.addPage([100, 200]);
    page.setRotation(degrees(90));
    doc.addPage([100, 200]);
    const input = await doc.save();

    const result = await rotatePdf(input, { angle: 90, pages: "1" });
    expect(await anglesOf(result)).toEqual([180, 0]);
  });
});

describe("rotatePdf (bordes / errores controlados)", () => {
  it("rechaza con InvalidPdfError ante bytes no-PDF y no resuelve a bytes (R18, R22)", async () => {
    const invalid = new Uint8Array([0x68, 0x69]); // "hi": no es un PDF
    await expect(
      rotatePdf(invalid, { angle: 90, pages: "all" }),
    ).rejects.toBeInstanceOf(InvalidPdfError);

    let resolved: Uint8Array | undefined;
    try {
      resolved = await rotatePdf(invalid, { angle: 90, pages: "all" });
    } catch {
      resolved = undefined;
    }
    expect(resolved).toBeUndefined();
  });

  it("rechaza con RotateFailedError si el PDF tiene 0 páginas (R19, R22)", async () => {
    // pdf-lib infiere 1 página al recargar un documento vacío. Forzamos un
    // documento con `getPageCount() === 0` para ejercitar la guarda real.
    const zeroPageDoc = { getPageCount: () => 0 } as unknown as PDFDocument;
    vi.spyOn(PDFDocument, "load").mockResolvedValueOnce(zeroPageDoc);

    const input = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    await expect(
      rotatePdf(input, { angle: 90, pages: "all" }),
    ).rejects.toBeInstanceOf(RotateFailedError);
  });

  it("rechaza con InvalidRotationError ante ángulo no múltiplo de 90 sin salida (R20, R22)", async () => {
    const pdf3 = await makePdf(3);
    await expect(
      rotatePdf(pdf3, { angle: 45, pages: "all" }),
    ).rejects.toBeInstanceOf(InvalidRotationError);

    let resolved: Uint8Array | undefined;
    try {
      resolved = await rotatePdf(pdf3, { angle: 45, pages: "all" });
    } catch {
      resolved = undefined;
    }
    expect(resolved).toBeUndefined();
  });

  it("rechaza con InvalidRangeError ante rango inválido sin salida (R21, R22)", async () => {
    const pdf3 = await makePdf(3);
    await expect(
      rotatePdf(pdf3, { angle: 90, pages: "9" }),
    ).rejects.toBeInstanceOf(InvalidRangeError);

    let resolved: Uint8Array | undefined;
    try {
      resolved = await rotatePdf(pdf3, { angle: 90, pages: "9" });
    } catch {
      resolved = undefined;
    }
    expect(resolved).toBeUndefined();
  });
});
