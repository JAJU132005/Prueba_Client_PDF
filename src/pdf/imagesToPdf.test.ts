import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import {
  A4_MARGIN,
  A4_PORTRAIT,
  IMAGE_TYPES,
  PAGE_SIZE_MODES,
  computePageLayout,
  detectImageType,
  imagesToPdf,
} from "@/pdf/imagesToPdf";
import { ImagesToPdfFailedError, InvalidImageError } from "@/pdf/types";

/** Decodifica una constante base64 a `Uint8Array` (`atob` existe en jsdom). */
function fromBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

// PNG 2×3 (ancho 2, alto 3): página "fit" = 2×3 pt.
const PNG_2x3 = fromBase64(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAADklEQVR4nGP4DwYMKBQAvFgR71PJ/rgAAAAASUVORK5CYII=",
);
// JPEG 5×7 (ancho 5, alto 7): página "fit" = 5×7 pt.
const JPEG_5x7 = fromBase64("/9j/wAARCAAHAAUDAREAAhEAAxEA/9k=");
// PNG 1×1, para casos donde el tamaño es irrelevante.
const PNG_1x1 = fromBase64(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC",
);

// Imagen inválida: "hi", sin firma. (R3, R18)
const GARBAGE = new Uint8Array([0x68, 0x69]);
// Firma JPEG pero cuerpo corrupto. (R20)
const JPEG_CORRUPT = new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x01, 0x02]);

describe("detectImageType (R1–R3)", () => {
  it("reconoce la firma JPEG FF D8 FF como 'jpeg' (R1)", () => {
    expect(detectImageType(new Uint8Array([0xff, 0xd8, 0xff, 0x00]))).toBe(
      "jpeg",
    );
    expect(detectImageType(JPEG_5x7)).toBe("jpeg");
  });

  it("reconoce la firma PNG de 8 bytes como 'png' (R2)", () => {
    expect(
      detectImageType(
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toBe("png");
    expect(detectImageType(PNG_2x3)).toBe("png");
  });

  it("devuelve null si no es JPEG ni PNG (R3)", () => {
    expect(detectImageType(GARBAGE)).toBeNull();
    expect(detectImageType(new Uint8Array([]))).toBeNull();
  });
});

describe("constantes (R4, R5)", () => {
  it("IMAGE_TYPES contiene exactamente 'jpeg' y 'png' (R4)", () => {
    expect([...IMAGE_TYPES]).toEqual(["jpeg", "png"]);
  });

  it("PAGE_SIZE_MODES contiene exactamente 'fit' y 'a4' (R5)", () => {
    expect([...PAGE_SIZE_MODES]).toEqual(["fit", "a4"]);
  });
});

describe("computePageLayout — fit (R6, R7)", () => {
  it("fija la página al tamaño de la imagen (R6)", () => {
    const layout = computePageLayout(120, 80, "fit");
    expect(layout.pageWidth).toBe(120);
    expect(layout.pageHeight).toBe(80);
  });

  it("dibuja la imagen a página completa desde el origen (R7)", () => {
    const layout = computePageLayout(120, 80, "fit");
    expect(layout.x).toBe(0);
    expect(layout.y).toBe(0);
    expect(layout.drawWidth).toBe(120);
    expect(layout.drawHeight).toBe(80);
  });
});

describe("computePageLayout — a4 (R8–R13)", () => {
  it("fija la página al tamaño A4 vertical (R8)", () => {
    const layout = computePageLayout(200, 100, "a4");
    expect(layout.pageWidth).toBe(A4_PORTRAIT.width);
    expect(layout.pageHeight).toBe(A4_PORTRAIT.height);
  });

  it("preserva la relación de aspecto de la imagen (R9)", () => {
    const layout = computePageLayout(200, 100, "a4");
    expect(layout.drawWidth / layout.drawHeight).toBeCloseTo(2, 6);
  });

  it("no excede el ancho ni el alto disponibles (R10, R11)", () => {
    const availWidth = A4_PORTRAIT.width - 2 * A4_MARGIN;
    const availHeight = A4_PORTRAIT.height - 2 * A4_MARGIN;
    // Imagen más ancha y más alta que la página.
    const wide = computePageLayout(4000, 200, "a4");
    expect(wide.drawWidth).toBeLessThanOrEqual(availWidth + 1e-6);
    expect(wide.drawHeight).toBeLessThanOrEqual(availHeight + 1e-6);
    const tall = computePageLayout(200, 4000, "a4");
    expect(tall.drawWidth).toBeLessThanOrEqual(availWidth + 1e-6);
    expect(tall.drawHeight).toBeLessThanOrEqual(availHeight + 1e-6);
  });

  it("centra la imagen horizontal y verticalmente (R12, R13)", () => {
    const layout = computePageLayout(200, 100, "a4");
    expect(layout.x).toBeCloseTo(
      (A4_PORTRAIT.width - layout.drawWidth) / 2,
      6,
    );
    expect(layout.y).toBeCloseTo(
      (A4_PORTRAIT.height - layout.drawHeight) / 2,
      6,
    );
  });
});

describe("imagesToPdf — camino feliz (R14, R15, R23, R24, R25)", () => {
  it("produce un PDF con una página por imagen (R14, acceptance A4)", async () => {
    const result = await imagesToPdf([JPEG_5x7, PNG_2x3], { pageSize: "fit" });
    const out = await PDFDocument.load(result);
    expect(out.getPageCount()).toBe(2);
  });

  it("añade las páginas en el orden de entrada en modo 'fit' (R15)", async () => {
    const result = await imagesToPdf([PNG_2x3, JPEG_5x7], { pageSize: "fit" });
    const out = await PDFDocument.load(result);
    const sizes = out
      .getPages()
      .map((p) => `${Math.round(p.getWidth())}x${Math.round(p.getHeight())}`);
    expect(sizes).toEqual(["2x3", "5x7"]);

    // Orden inverso → secuencia inversa.
    const reversed = await imagesToPdf([JPEG_5x7, PNG_2x3], {
      pageSize: "fit",
    });
    const outReversed = await PDFDocument.load(reversed);
    const sizesReversed = outReversed
      .getPages()
      .map((p) => `${Math.round(p.getWidth())}x${Math.round(p.getHeight())}`);
    expect(sizesReversed).toEqual(["5x7", "2x3"]);
  });

  it("emite progreso en [0,1] terminando en 1 (R23, R24)", async () => {
    const values: number[] = [];
    await imagesToPdf([PNG_1x1, JPEG_5x7, PNG_2x3], { pageSize: "fit" }, (p) =>
      values.push(p),
    );
    expect(values.length).toBeGreaterThan(0);
    for (const p of values) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
    expect(values[values.length - 1]).toBe(1);
  });

  it("devuelve un PDF cargable por pdf-lib (R25)", async () => {
    const result = await imagesToPdf([PNG_2x3], { pageSize: "a4" });
    await expect(PDFDocument.load(result)).resolves.toBeDefined();
  });
});

describe("imagesToPdf — bordes (R18, R19, R20, R21, R22)", () => {
  it("rechaza con InvalidImageError si una imagen no tiene firma válida y no resuelve a bytes (R18, R19)", async () => {
    await expect(
      imagesToPdf([GARBAGE], { pageSize: "fit" }),
    ).rejects.toBeInstanceOf(InvalidImageError);

    let resolved: Uint8Array | undefined;
    try {
      resolved = await imagesToPdf([GARBAGE], { pageSize: "fit" });
    } catch {
      resolved = undefined;
    }
    expect(resolved).toBeUndefined();
  });

  it("rechaza con InvalidImageError si la firma es JPEG pero el cuerpo está corrupto (R20)", async () => {
    await expect(
      imagesToPdf([JPEG_CORRUPT], { pageSize: "fit" }),
    ).rejects.toBeInstanceOf(InvalidImageError);
  });

  it("no produce un PDF parcial si una de varias imágenes es inválida (R22)", async () => {
    await expect(
      imagesToPdf([JPEG_5x7, GARBAGE], { pageSize: "fit" }),
    ).rejects.toBeInstanceOf(InvalidImageError);

    let resolved: Uint8Array | undefined;
    try {
      resolved = await imagesToPdf([JPEG_5x7, GARBAGE], { pageSize: "fit" });
    } catch {
      resolved = undefined;
    }
    expect(resolved).toBeUndefined();
  });

  it("rechaza con ImagesToPdfFailedError si la lista está vacía (R21)", async () => {
    await expect(
      imagesToPdf([], { pageSize: "fit" }),
    ).rejects.toBeInstanceOf(ImagesToPdfFailedError);
  });
});
