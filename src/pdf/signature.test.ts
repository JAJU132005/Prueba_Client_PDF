import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import {
  buildSignatureAnnotations,
  computeSignatureBox,
  computeSignaturePlacement,
  computeSignatureSize,
  formatSignatureDate,
  moveSignatureBox,
  resizeSignatureBox,
  signPdf,
  type FreePlacement,
  type SignatureExtra,
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

// ---------------------------------------------------------------------------
// Colocación libre (#30). Bloques ADITIVOS: no se editan los tests de #24.
// ---------------------------------------------------------------------------

describe("computeSignatureBox (R1)", () => {
  it("ancla exacta + aspecto preservado a un ancho objetivo", () => {
    const box = computeSignatureBox(200, 100, { x: 30, y: 40 }, 50);
    expect(box).toEqual({ x: 30, y: 40, width: 50, height: 25 });
  });

  it("mantiene el ancla `at` sin ajuste a rejilla", () => {
    const box = computeSignatureBox(640, 480, { x: 12.5, y: 99 }, 120);
    expect(box.x).toBe(12.5);
    expect(box.y).toBe(99);
    expect(box.width).toBe(120);
    expect(box.height).toBeCloseTo(480 * (120 / 640));
  });
});

describe("moveSignatureBox (R2)", () => {
  it("traslada (dx,dy) sin cambiar el tamaño y sin mutar la entrada", () => {
    const box: FreePlacement = { x: 10, y: 20, width: 50, height: 25 };
    const moved = moveSignatureBox(box, 5, -8);
    expect(moved).toEqual({ x: 15, y: 12, width: 50, height: 25 });
    // La entrada no se muta.
    expect(box).toEqual({ x: 10, y: 20, width: 50, height: 25 });
    expect(moved).not.toBe(box);
  });
});

describe("resizeSignatureBox — aspecto preservado (R3)", () => {
  const box: FreePlacement = { x: 100, y: 100, width: 60, height: 30 };
  const aspectRatio = 2; // width / height

  for (const handle of ["nw", "ne", "sw", "se"] as const) {
    it(`el tirador ${handle} devuelve width/height === aspectRatio`, () => {
      const resized = resizeSignatureBox(
        box,
        handle,
        { x: 300, y: 260 },
        aspectRatio,
        8,
      );
      expect(resized.width / resized.height).toBeCloseTo(aspectRatio);
    });
  }
});

describe("resizeSignatureBox — esquina opuesta fija (R4)", () => {
  it("arrastrar `nw` mantiene fija la esquina `se`", () => {
    const box: FreePlacement = { x: 100, y: 100, width: 60, height: 30 };
    // se = (x+width, y) = (160, 100).
    const resized = resizeSignatureBox(
      box,
      "nw",
      { x: 40, y: 220 },
      2,
      8,
    );
    // La esquina se del resultado debe seguir en (160, 100).
    expect(resized.x + resized.width).toBeCloseTo(160);
    expect(resized.y).toBeCloseTo(100);
  });

  it("arrastrar `se` mantiene fija la esquina `nw`", () => {
    const box: FreePlacement = { x: 100, y: 100, width: 60, height: 30 };
    // nw = (x, y+height) = (100, 130).
    const resized = resizeSignatureBox(
      box,
      "se",
      { x: 300, y: 20 },
      2,
      8,
    );
    expect(resized.x).toBeCloseTo(100);
    expect(resized.y + resized.height).toBeCloseTo(130);
  });
});

describe("resizeSignatureBox — clamp a minSize (R5)", () => {
  it("con `to` sobre la esquina fija, width y height quedan en minSize", () => {
    const box: FreePlacement = { x: 100, y: 100, width: 60, height: 60 };
    // se fija = (160, 100); arrastramos nw casi encima de la esquina fija.
    const resized = resizeSignatureBox(
      box,
      "nw",
      { x: 160, y: 100 },
      1, // aspecto 1 → ambos lados = minSize
      8,
    );
    expect(resized.width).toBe(8);
    expect(resized.height).toBe(8);
  });
});

describe("buildSignatureAnnotations — sin extras (R6, R7, R9)", () => {
  it("pageIndices=[0,2,4] → 3 anotaciones image, una por página", () => {
    const placement: FreePlacement = { x: 12, y: 34, width: 50, height: 25 };
    const image = new Uint8Array([1, 2, 3]);
    const anns = buildSignatureAnnotations(
      placement,
      image,
      [0, 2, 4],
      [],
      (p, part) => `id-${String(p)}-${part}`,
    );
    expect(anns).toHaveLength(3);
    expect(anns.every((a) => a.kind === "image")).toBe(true);
    expect(anns.map((a) => a.pageIndex)).toEqual([0, 2, 4]);
    for (const a of anns) {
      expect(a.kind).toBe("image");
      if (a.kind === "image") {
        expect(a.at).toEqual({ x: 12, y: 34 });
        expect(a.width).toBe(50);
        expect(a.height).toBe(25);
        expect(a.data).toBe(image);
      }
    }
  });
});

describe("buildSignatureAnnotations — con extras (R8)", () => {
  it("pageIndices=[1,3] + 2 extras → 2 image + 4 text con datos de cada extra", () => {
    const placement: FreePlacement = { x: 0, y: 0, width: 40, height: 20 };
    const extras: SignatureExtra[] = [
      {
        id: "date",
        kind: "date",
        text: "2026-07-07",
        at: { x: 5, y: 6 },
        fontSize: 12,
        color: { r: 0, g: 0, b: 0 },
      },
      {
        id: "name",
        kind: "text",
        text: "J. Panda",
        at: { x: 7, y: 8 },
        fontSize: 14,
        color: { r: 0.1, g: 0.2, b: 0.3 },
      },
    ];
    const anns = buildSignatureAnnotations(
      placement,
      new Uint8Array([9]),
      [1, 3],
      extras,
      (p, part) => `id-${String(p)}-${part}`,
    );
    const images = anns.filter((a) => a.kind === "image");
    const texts = anns.filter((a) => a.kind === "text");
    expect(images).toHaveLength(2);
    expect(texts).toHaveLength(4);
    // Cada extra aparece por cada página con su text/at/fontSize.
    for (const pageIndex of [1, 3]) {
      const dateAnn = texts.find(
        (a) => a.pageIndex === pageIndex && a.kind === "text" && a.text === "2026-07-07",
      );
      const nameAnn = texts.find(
        (a) => a.pageIndex === pageIndex && a.kind === "text" && a.text === "J. Panda",
      );
      expect(dateAnn).toBeDefined();
      expect(nameAnn).toBeDefined();
      if (dateAnn?.kind === "text") {
        expect(dateAnn.at).toEqual({ x: 5, y: 6 });
        expect(dateAnn.fontSize).toBe(12);
      }
      if (nameAnn?.kind === "text") {
        expect(nameAnn.at).toEqual({ x: 7, y: 8 });
        expect(nameAnn.fontSize).toBe(14);
      }
    }
  });
});

describe("formatSignatureDate (R10)", () => {
  it("formatea AAAA-MM-DD de forma determinista (UTC)", () => {
    expect(formatSignatureDate(new Date("2026-07-07T10:00:00Z"))).toBe(
      "2026-07-07",
    );
  });

  it("rellena con ceros los meses y días de un dígito", () => {
    expect(formatSignatureDate(new Date("2026-01-05T00:00:00Z"))).toBe(
      "2026-01-05",
    );
  });
});
