import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import {
  buildDrawOps,
  canvasPointToPdf,
  flattenAnnotations,
  pdfPointToCanvas,
  type Annotation,
  type AnnotationColor,
} from "@/pdf/annotate";
import {
  AnnotateFailedError,
  InvalidImageError,
  InvalidPdfError,
} from "@/pdf/types";

const BLACK: AnnotationColor = { r: 0, g: 0, b: 0 };

async function makePdf(pages: number, width = 200, height = 300): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) {
    doc.addPage([width, height]);
  }
  return doc.save();
}

/** Decodifica una constante base64 a `Uint8Array` (`atob` existe en jsdom). */
function fromBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** PNG 1×1 válido e incrustable por pdf-lib (mismo fixture que imagesToPdf.test). */
const PNG_1x1 = fromBase64(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC",
);

describe("canvasPointToPdf / pdfPointToCanvas (R5, R14, R15)", () => {
  it("convierte px top-left a punto PDF bottom-left: pxY=0 → y=pageHeight (R14, R5)", () => {
    const p = canvasPointToPdf(30, 0, 300, 1);
    expect(p).toEqual({ x: 30, y: 300 });
  });

  it("un pxY pequeño (borde superior del lienzo) da un y PDF cercano a pageHeight (R5)", () => {
    const top = canvasPointToPdf(0, 10, 300, 1);
    const lower = canvasPointToPdf(0, 200, 300, 1);
    // Cerca del borde superior del lienzo → y PDF alto (cercano a pageHeight);
    // más abajo en el lienzo → y PDF menor. Modelo con origen inferior-izquierdo.
    expect(top.y).toBe(290);
    expect(lower.y).toBe(100);
    expect(top.y).toBeGreaterThan(lower.y);
  });

  it("aplica la escala: px = pts · s (R14)", () => {
    const p = canvasPointToPdf(60, 40, 300, 2);
    expect(p).toEqual({ x: 30, y: 300 - 20 });
  });

  it("round-trip identidad para varias escalas (R15)", () => {
    const cases: Array<[number, number, number, number]> = [
      [30, 40, 300, 1],
      [10, 250, 300, 2],
      [123.5, 7.25, 841.89, 1.5],
      [0, 0, 500, 3],
    ];
    for (const [pxX, pxY, height, scale] of cases) {
      const pdf = canvasPointToPdf(pxX, pxY, height, scale);
      const back = pdfPointToCanvas(pdf, height, scale);
      expect(back.left).toBeCloseTo(pxX, 10);
      expect(back.top).toBeCloseTo(pxY, 10);
    }
  });
});

describe("buildDrawOps (R16, R17, R18, R19, R20, R21)", () => {
  it("texto → op text anclada en el punto con tamaño y color (R16)", () => {
    const a: Annotation = {
      id: "t",
      pageIndex: 0,
      kind: "text",
      at: { x: 12, y: 34 },
      text: "hola",
      fontSize: 18,
      color: { r: 0.1, g: 0.2, b: 0.3 },
    };
    expect(buildDrawOps(a)).toEqual([
      {
        op: "text",
        x: 12,
        y: 34,
        size: 18,
        text: "hola",
        color: { r: 0.1, g: 0.2, b: 0.3 },
      },
    ]);
  });

  it("resaltado → rect relleno con opacidad y borde 0 (R17)", () => {
    const a: Annotation = {
      id: "h",
      pageIndex: 0,
      kind: "highlight",
      at: { x: 5, y: 6 },
      width: 100,
      height: 12,
      color: BLACK,
      opacity: 0.4,
    };
    expect(buildDrawOps(a)).toEqual([
      {
        op: "rect",
        x: 5,
        y: 6,
        width: 100,
        height: 12,
        color: BLACK,
        opacity: 0.4,
        borderWidth: 0,
      },
    ]);
  });

  it("línea → op line entre los dos extremos con grosor y color (R18)", () => {
    const a: Annotation = {
      id: "l",
      pageIndex: 0,
      kind: "line",
      start: { x: 1, y: 2 },
      end: { x: 3, y: 4 },
      color: BLACK,
      thickness: 2,
    };
    expect(buildDrawOps(a)).toEqual([
      { op: "line", x1: 1, y1: 2, x2: 3, y2: 4, thickness: 2, color: BLACK },
    ]);
  });

  it("rectángulo → rect de contorno con borderWidth = grosor (R19)", () => {
    const a: Annotation = {
      id: "r",
      pageIndex: 0,
      kind: "rect",
      at: { x: 10, y: 20 },
      width: 40,
      height: 50,
      color: BLACK,
      thickness: 3,
    };
    expect(buildDrawOps(a)).toEqual([
      {
        op: "rect",
        x: 10,
        y: 20,
        width: 40,
        height: 50,
        color: BLACK,
        opacity: 1,
        borderWidth: 3,
      },
    ]);
  });

  it("dibujo libre → secuencia de segmentos que unen los puntos en orden (R20)", () => {
    const a: Annotation = {
      id: "f",
      pageIndex: 0,
      kind: "freehand",
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 4 },
      ],
      color: BLACK,
      thickness: 1,
    };
    expect(buildDrawOps(a)).toEqual([
      { op: "line", x1: 0, y1: 0, x2: 1, y2: 1, thickness: 1, color: BLACK },
      { op: "line", x1: 1, y1: 1, x2: 2, y2: 4, thickness: 1, color: BLACK },
    ]);
  });

  it("imagen → op image en el punto y tamaño, con el ref indicado (R21)", () => {
    const a: Annotation = {
      id: "i",
      pageIndex: 0,
      kind: "image",
      at: { x: 7, y: 8 },
      width: 30,
      height: 40,
      data: PNG_1x1,
    };
    expect(buildDrawOps(a, 2)).toEqual([
      { op: "image", x: 7, y: 8, width: 30, height: 40, ref: 2 },
    ]);
  });
});

describe("flattenAnnotations — éxito (R1, R2, R22, R25)", () => {
  it("produce un PDF cargable conservando las páginas del original (R1, R22)", async () => {
    const input = await makePdf(2);
    const out = await flattenAnnotations(input, [
      {
        id: "t",
        pageIndex: 1,
        kind: "text",
        at: { x: 20, y: 20 },
        text: "Nota",
        fontSize: 14,
        color: BLACK,
      },
      {
        id: "r",
        pageIndex: 0,
        kind: "rect",
        at: { x: 10, y: 10 },
        width: 50,
        height: 30,
        color: BLACK,
        thickness: 2,
      },
    ]);
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(2);
  });

  it("no cambia el número de páginas (capa encima, sin reescribir) (R2)", async () => {
    const input = await makePdf(3);
    const before = await PDFDocument.load(input);
    const out = await flattenAnnotations(input, [
      {
        id: "h",
        pageIndex: 2,
        kind: "highlight",
        at: { x: 5, y: 5 },
        width: 40,
        height: 10,
        color: BLACK,
        opacity: 0.5,
      },
    ]);
    const after = await PDFDocument.load(out);
    expect(after.getPageCount()).toBe(before.getPageCount());
  });

  it("emite progreso en [0,1] terminando en 1 (R25)", async () => {
    const input = await makePdf(1);
    const progress: number[] = [];
    await flattenAnnotations(
      input,
      [
        {
          id: "l",
          pageIndex: 0,
          kind: "line",
          start: { x: 0, y: 0 },
          end: { x: 10, y: 10 },
          color: BLACK,
          thickness: 1,
        },
      ],
      (p) => progress.push(p),
    );
    expect(progress.length).toBeGreaterThan(0);
    for (const p of progress) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
    expect(progress[progress.length - 1]).toBe(1);
  });

  it("incrusta y dibuja una imagen de anotación válida (R21)", async () => {
    const input = await makePdf(1);
    const out = await flattenAnnotations(input, [
      {
        id: "i",
        pageIndex: 0,
        kind: "image",
        at: { x: 10, y: 10 },
        width: 20,
        height: 20,
        data: PNG_1x1,
      },
    ]);
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(1);
  });
});

describe("flattenAnnotations — errores sin salida (R28, R29, R30, R31)", () => {
  it("lista vacía → AnnotateFailedError (R31)", async () => {
    const input = await makePdf(1);
    await expect(flattenAnnotations(input, [])).rejects.toBeInstanceOf(
      AnnotateFailedError,
    );
  });

  it("bytes no-PDF → InvalidPdfError (R28)", async () => {
    const invalid = new Uint8Array([0x68, 0x69]);
    await expect(
      flattenAnnotations(invalid, [
        {
          id: "t",
          pageIndex: 0,
          kind: "text",
          at: { x: 1, y: 1 },
          text: "x",
          fontSize: 12,
          color: BLACK,
        },
      ]),
    ).rejects.toBeInstanceOf(InvalidPdfError);
  });

  it("índice de página fuera de rango → AnnotateFailedError (R30)", async () => {
    const input = await makePdf(1);
    await expect(
      flattenAnnotations(input, [
        {
          id: "r",
          pageIndex: 5,
          kind: "rect",
          at: { x: 1, y: 1 },
          width: 10,
          height: 10,
          color: BLACK,
          thickness: 1,
        },
      ]),
    ).rejects.toBeInstanceOf(AnnotateFailedError);
  });

  it("imagen no incrustable → InvalidImageError (R29)", async () => {
    const input = await makePdf(1);
    await expect(
      flattenAnnotations(input, [
        {
          id: "i",
          pageIndex: 0,
          kind: "image",
          at: { x: 1, y: 1 },
          width: 10,
          height: 10,
          data: new Uint8Array([1, 2, 3, 4]),
        },
      ]),
    ).rejects.toBeInstanceOf(InvalidImageError);
  });
});
