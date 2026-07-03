import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import {
  computeSignaturePlacement,
  computeSignatureSize,
  signPdf,
  type SignOptions,
} from "@/pdf/signature";
import {
  InvalidImageError,
  InvalidPdfError,
  SignFailedError,
} from "@/pdf/types";
import {
  computeWatermarkPosition,
  WATERMARK_MARGIN,
} from "@/pdf/watermark";

/** PDF mínimo con `n` páginas de 200×300 puntos. */
async function makePdf(n: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < n; i++) {
    doc.addPage([200, 300]);
  }
  return doc.save();
}

/** PNG 1×1 válido e incrustable por pdf-lib (transparente). */
function makePng1x1(): Uint8Array {
  const base64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAen63NgAAAAASUVORK5CYII=";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function baseOptions(overrides: Partial<SignOptions> = {}): SignOptions {
  return {
    pageIndex: 0,
    position: "center",
    widthPts: 50,
    image: makePng1x1(),
    ...overrides,
  };
}

describe("computeSignatureSize (R1)", () => {
  it("escala al ancho objetivo preservando la relación de aspecto", () => {
    expect(computeSignatureSize(200, 100, 50)).toEqual({ width: 50, height: 25 });
  });

  it("mantiene width === targetWidthPts exacto", () => {
    const size = computeSignatureSize(640, 480, 123.5);
    expect(size.width).toBe(123.5);
    expect(size.height).toBeCloseTo(480 * (123.5 / 640));
  });
});

describe("computeSignaturePlacement (R2)", () => {
  it("deriva el ancla bottom-right igual que computeWatermarkPosition", () => {
    const placement = computeSignaturePlacement(
      200,
      100,
      500,
      700,
      50,
      "bottom-right",
      WATERMARK_MARGIN,
    );
    const size = computeSignatureSize(200, 100, 50);
    const expected = computeWatermarkPosition(
      "bottom-right",
      500,
      700,
      size.width,
      size.height,
      WATERMARK_MARGIN,
    );
    expect(placement).toEqual({
      x: expected.x,
      y: expected.y,
      width: size.width,
      height: size.height,
    });
  });

  it("deriva el ancla center igual que computeWatermarkPosition", () => {
    const placement = computeSignaturePlacement(
      200,
      100,
      500,
      700,
      80,
      "center",
      WATERMARK_MARGIN,
    );
    const size = computeSignatureSize(200, 100, 80);
    const expected = computeWatermarkPosition(
      "center",
      500,
      700,
      size.width,
      size.height,
      WATERMARK_MARGIN,
    );
    expect(placement.x).toBe(expected.x);
    expect(placement.y).toBe(expected.y);
  });
});

describe("signPdf — camino feliz (R3)", () => {
  it("devuelve bytes cargables por PDFDocument.load y distintos de la entrada", async () => {
    const input = await makePdf(1);
    const output = await signPdf(input, baseOptions());
    const reloaded = await PDFDocument.load(output);
    expect(reloaded.getPageCount()).toBe(1);
    // La imagen se incrustó: la salida difiere de la entrada.
    expect(Array.from(output)).not.toEqual(Array.from(input));
  });
});

describe("signPdf — conserva el número de páginas (R4)", () => {
  it("un PDF de 3 páginas produce un PDF de 3 páginas", async () => {
    const input = await makePdf(3);
    const output = await signPdf(input, baseOptions({ pageIndex: 2 }));
    const reloaded = await PDFDocument.load(output);
    expect(reloaded.getPageCount()).toBe(3);
  });
});

describe("signPdf — validación de pageIndex (R5)", () => {
  it("pageIndex fuera de rango rechaza con SignFailedError sin salida", async () => {
    const input = await makePdf(2);
    await expect(
      signPdf(input, baseOptions({ pageIndex: 5 })),
    ).rejects.toBeInstanceOf(SignFailedError);
  });

  it("pageIndex negativo rechaza con SignFailedError", async () => {
    const input = await makePdf(2);
    await expect(
      signPdf(input, baseOptions({ pageIndex: -1 })),
    ).rejects.toBeInstanceOf(SignFailedError);
  });
});

describe("signPdf — imagen inválida (R6)", () => {
  it("bytes que no son JPG ni PNG rechazan con InvalidImageError", async () => {
    const input = await makePdf(1);
    await expect(
      signPdf(input, baseOptions({ image: new Uint8Array([1, 2, 3, 4]) })),
    ).rejects.toBeInstanceOf(InvalidImageError);
  });
});

describe("signPdf — PDF inválido (R7)", () => {
  it("bytes de entrada no-PDF rechazan con InvalidPdfError", async () => {
    const notPdf = new Uint8Array([0x68, 0x69]);
    await expect(signPdf(notPdf, baseOptions())).rejects.toBeInstanceOf(
      InvalidPdfError,
    );
  });
});

describe("signPdf — validación de widthPts (R8)", () => {
  it("widthPts <= 0 rechaza con SignFailedError", async () => {
    const input = await makePdf(1);
    await expect(
      signPdf(input, baseOptions({ widthPts: 0 })),
    ).rejects.toBeInstanceOf(SignFailedError);
  });

  it("widthPts no finito rechaza con SignFailedError", async () => {
    const input = await makePdf(1);
    await expect(
      signPdf(input, baseOptions({ widthPts: Number.NaN })),
    ).rejects.toBeInstanceOf(SignFailedError);
  });
});

describe("signPdf — progreso (R9)", () => {
  it("emite valores en [0,1] terminando exactamente en 1", async () => {
    const input = await makePdf(1);
    const progress: number[] = [];
    await signPdf(input, baseOptions(), (p) => progress.push(p));
    expect(progress.length).toBeGreaterThan(0);
    for (const p of progress) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
    expect(progress[progress.length - 1]).toBe(1);
  });
});
