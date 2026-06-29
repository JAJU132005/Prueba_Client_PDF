import * as pdfjs from "pdfjs-dist";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import {
  WATERMARK_MODES,
  WATERMARK_POSITIONS,
  addWatermark,
  buildWatermarkDrawOptions,
  computeImageWatermarkSize,
  computeWatermarkPosition,
  resolveWatermarkPages,
  type WatermarkOptions,
} from "@/pdf/watermark";
import {
  InvalidImageError,
  InvalidPdfError,
  InvalidRangeError,
  WatermarkFailedError,
} from "@/pdf/types";

const MARGIN = 36;

/** Decodifica una constante base64 a `Uint8Array` (`atob` existe en jsdom). */
function fromBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

// PNG 2×3 (ancho 2, alto 3).
const PNG_2x3 = fromBase64(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAADklEQVR4nGP4DwYMKBQAvFgR71PJ/rgAAAAASUVORK5CYII=",
);
// JPEG 5×7 (ancho 5, alto 7).
const JPEG_5x7 = fromBase64("/9j/wAARCAAHAAUDAREAAhEAAxEA/9k=");
// Imagen inválida: "hi", sin firma.
const GARBAGE = new Uint8Array([0x68, 0x69]);
// Firma JPEG pero cuerpo corrupto.
const JPEG_CORRUPT = new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x01, 0x02]);

/** Opciones base reutilizadas por los casos de la operación. */
function opts(overrides: Partial<WatermarkOptions> = {}): WatermarkOptions {
  return {
    mode: "text",
    text: "CONFIDENCIAL",
    image: null,
    position: "center",
    opacity: 0.3,
    angle: 45,
    fontSize: 24,
    pages: "all",
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
 * lo carga con `getPageCount() === 0`. Sirve para el caso de 0 páginas. (R27)
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
 * Opera sobre bytes en memoria, sin red. (R13)
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

describe("constantes (R1, R2)", () => {
  it("WATERMARK_MODES contiene exactamente 'text' e 'image' (R1)", () => {
    expect([...WATERMARK_MODES]).toEqual(["text", "image"]);
  });

  it("WATERMARK_POSITIONS contiene exactamente las nueve posiciones en orden (R2)", () => {
    expect([...WATERMARK_POSITIONS]).toEqual([
      "top-left",
      "top-center",
      "top-right",
      "middle-left",
      "center",
      "middle-right",
      "bottom-left",
      "bottom-center",
      "bottom-right",
    ]);
  });
});

describe("computeWatermarkPosition (R3, R4, R5, R6, R7, R8)", () => {
  it("*-left fija x al margen (R3)", () => {
    expect(
      computeWatermarkPosition("middle-left", 200, 300, 40, 20, MARGIN).x,
    ).toBe(36);
  });

  it("*-right fija x en pageWidth − margin − contentWidth (R4)", () => {
    expect(
      computeWatermarkPosition("middle-right", 200, 300, 40, 20, MARGIN).x,
    ).toBe(200 - 36 - 40);
  });

  it("centrado horizontal fija x en (pageWidth − contentWidth) / 2 (R5)", () => {
    expect(computeWatermarkPosition("center", 200, 300, 40, 20, MARGIN).x).toBe(
      (200 - 40) / 2,
    );
  });

  it("bottom-* fija y al margen (R6)", () => {
    expect(
      computeWatermarkPosition("bottom-left", 200, 300, 40, 20, MARGIN).y,
    ).toBe(36);
  });

  it("top-* fija y en pageHeight − margin − contentHeight (R7)", () => {
    expect(
      computeWatermarkPosition("top-left", 200, 300, 40, 20, MARGIN).y,
    ).toBe(300 - 36 - 20);
  });

  it("centrado vertical fija y en (pageHeight − contentHeight) / 2 (R8)", () => {
    expect(computeWatermarkPosition("center", 200, 300, 40, 20, MARGIN).y).toBe(
      (300 - 20) / 2,
    );
  });
});

describe("computeImageWatermarkSize (R9, R10)", () => {
  it("preserva la relación de aspecto (R9)", () => {
    const { drawWidth, drawHeight } = computeImageWatermarkSize(
      200,
      100,
      595,
      842,
      MARGIN,
    );
    expect(drawWidth / drawHeight).toBeCloseTo(2, 5);
  });

  it("no excede el ancho ni el alto disponibles (R10)", () => {
    const wide = computeImageWatermarkSize(4000, 200, 595, 842, MARGIN);
    expect(wide.drawWidth).toBeLessThanOrEqual(595 - 72);
    expect(wide.drawHeight).toBeLessThanOrEqual(842 - 72);

    const tall = computeImageWatermarkSize(2000, 4000, 595, 842, MARGIN);
    expect(tall.drawWidth).toBeLessThanOrEqual(595 - 72);
    expect(tall.drawHeight).toBeLessThanOrEqual(842 - 72);
  });
});

describe("buildWatermarkDrawOptions (R11, R12)", () => {
  it("registra la opacidad sin alterarla (R11)", () => {
    expect(buildWatermarkDrawOptions(0.3, 45).opacity).toBe(0.3);
  });

  it("registra la rotación como degrees(angle) (R12)", () => {
    const draw = buildWatermarkDrawOptions(0.3, 45);
    expect(draw.rotate.type).toBe("degrees");
    expect(draw.rotate.angle).toBe(45);
  });
});

describe("resolveWatermarkPages (R15, R34)", () => {
  it("'all' devuelve todos los índices (R15)", () => {
    expect(resolveWatermarkPages("all", 3)).toEqual([0, 1, 2]);
  });

  it("una cadena de rangos devuelve los índices 0-indexados", () => {
    expect(resolveWatermarkPages("2", 3)).toEqual([1]);
  });

  it("rango fuera de límites lanza InvalidRangeError (R34)", () => {
    expect(() => resolveWatermarkPages("9", 3)).toThrow(InvalidRangeError);
  });
});

describe("addWatermark — texto, acceptance #3 (R13, R14, R15, R16, R17, R23, R24)", () => {
  it("la marca de texto es recuperable en cada página marcada con 'all' (R13, R15)", async () => {
    const input = await makePdf(3);
    const out = await addWatermark(
      input,
      opts({ text: "CONFIDENCIAL", pages: "all" }),
    );
    const texts = await extractPageTexts(out);
    expect(texts[0]).toContain("CONFIDENCIAL");
    expect(texts[1]).toContain("CONFIDENCIAL");
    expect(texts[2]).toContain("CONFIDENCIAL");
  });

  it("con pages:'2' solo la página 2 contiene la marca (R14)", async () => {
    const input = await makePdf(3);
    const out = await addWatermark(
      input,
      opts({ text: "CONFIDENCIAL", pages: "2" }),
    );
    const texts = await extractPageTexts(out);
    expect(texts[0]).not.toContain("CONFIDENCIAL");
    expect(texts[1]).toContain("CONFIDENCIAL");
    expect(texts[2]).not.toContain("CONFIDENCIAL");
  });

  it("conserva el número de páginas de la entrada (R16)", async () => {
    const input = await makePdf(3);
    const out = await addWatermark(input, opts());
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(3);
  });

  it("devuelve un PDF cargable por pdf-lib (R17)", async () => {
    const input = await makePdf(2);
    const out = await addWatermark(input, opts());
    await expect(PDFDocument.load(out)).resolves.toBeDefined();
  });

  it("emite progreso en [0,1] terminando en 1 (R23, R24)", async () => {
    const input = await makePdf(3);
    const values: number[] = [];
    await addWatermark(input, opts(), (p) => values.push(p));
    expect(values.length).toBeGreaterThan(0);
    for (const p of values) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
    expect(values[values.length - 1]).toBe(1);
  });
});

describe("addWatermark — imagen (R20, R22)", () => {
  it("marcar con imagen aumenta el byteLength frente a la entrada (R20)", async () => {
    const input = await makePdf(1);
    const out = await addWatermark(
      input,
      opts({ mode: "image", image: PNG_2x3 }),
    );
    expect(out.byteLength).toBeGreaterThan(input.byteLength);
  });

  it("marca con imagen sobre 2 páginas: salida cargable con conteo preservado (R22)", async () => {
    const input = await makePdf(2);
    const out = await addWatermark(
      input,
      opts({ mode: "image", image: JPEG_5x7 }),
    );
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(2);
  });
});

describe("addWatermark — bordes (R25–R34)", () => {
  it("rechaza con InvalidPdfError y sin bytes si la entrada no es un PDF (R25, R26)", async () => {
    await expect(
      addWatermark(new Uint8Array([0x68, 0x69]), opts()),
    ).rejects.toBeInstanceOf(InvalidPdfError);

    let resolved: Uint8Array | undefined;
    try {
      resolved = await addWatermark(new Uint8Array([0x68, 0x69]), opts());
    } catch {
      resolved = undefined;
    }
    expect(resolved).toBeUndefined();
  });

  it("rechaza con WatermarkFailedError si el PDF tiene 0 páginas (R27)", async () => {
    await expect(addWatermark(ZERO_PAGE_PDF, opts())).rejects.toBeInstanceOf(
      WatermarkFailedError,
    );
  });

  it("rechaza con WatermarkFailedError si opacity ∉ (0,1] (R28)", async () => {
    const input = await makePdf(1);
    await expect(
      addWatermark(input, opts({ opacity: 0 })),
    ).rejects.toBeInstanceOf(WatermarkFailedError);
    await expect(
      addWatermark(input, opts({ opacity: 1.5 })),
    ).rejects.toBeInstanceOf(WatermarkFailedError);
    await expect(
      addWatermark(input, opts({ opacity: Number.NaN })),
    ).rejects.toBeInstanceOf(WatermarkFailedError);
  });

  it("rechaza con WatermarkFailedError si angle no es finito (R29)", async () => {
    const input = await makePdf(1);
    await expect(
      addWatermark(input, opts({ angle: Number.NaN })),
    ).rejects.toBeInstanceOf(WatermarkFailedError);
    await expect(
      addWatermark(input, opts({ angle: Number.POSITIVE_INFINITY })),
    ).rejects.toBeInstanceOf(WatermarkFailedError);
  });

  it("rechaza con WatermarkFailedError si el texto está vacío (R30)", async () => {
    const input = await makePdf(1);
    await expect(
      addWatermark(input, opts({ mode: "text", text: "   " })),
    ).rejects.toBeInstanceOf(WatermarkFailedError);
  });

  it("rechaza con WatermarkFailedError si fontSize no es finito > 0 (R31)", async () => {
    const input = await makePdf(1);
    await expect(
      addWatermark(input, opts({ mode: "text", fontSize: 0 })),
    ).rejects.toBeInstanceOf(WatermarkFailedError);
    await expect(
      addWatermark(input, opts({ mode: "text", fontSize: Number.NaN })),
    ).rejects.toBeInstanceOf(WatermarkFailedError);
  });

  it("rechaza con InvalidImageError si la imagen falta o no es JPG/PNG (R32)", async () => {
    const input = await makePdf(1);
    await expect(
      addWatermark(input, opts({ mode: "image", image: null })),
    ).rejects.toBeInstanceOf(InvalidImageError);
    await expect(
      addWatermark(input, opts({ mode: "image", image: GARBAGE })),
    ).rejects.toBeInstanceOf(InvalidImageError);
  });

  it("rechaza con InvalidImageError si la imagen tiene firma válida pero cuerpo corrupto (R33)", async () => {
    const input = await makePdf(1);
    await expect(
      addWatermark(input, opts({ mode: "image", image: JPEG_CORRUPT })),
    ).rejects.toBeInstanceOf(InvalidImageError);
  });

  it("rechaza con InvalidRangeError y sin bytes ante un rango inválido (R34)", async () => {
    const input = await makePdf(3);
    await expect(
      addWatermark(input, opts({ pages: "9" })),
    ).rejects.toBeInstanceOf(InvalidRangeError);

    let resolved: Uint8Array | undefined;
    try {
      resolved = await addWatermark(input, opts({ pages: "9" }));
    } catch {
      resolved = undefined;
    }
    expect(resolved).toBeUndefined();
  });
});
