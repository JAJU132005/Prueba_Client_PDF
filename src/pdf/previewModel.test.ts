import { describe, expect, it } from "vitest";

// El fuente del módulo se lee como texto vía `?raw` de Vite para verificar
// estáticamente que es puro (sin React/pdf.js/DOM). (R12, T5)
import previewModelSource from "@/pdf/previewModel.ts?raw";
import {
  buildPageNumbersOverlay,
  buildWatermarkOverlay,
  resolvePreviewPageIndex,
  toPreviewPixels,
  type PreviewOverlay,
} from "@/pdf/previewModel";
import {
  computeTextPosition,
  formatPageNumber,
  PAGE_NUMBER_MARGIN,
  type PageNumbersOptions,
} from "@/pdf/pageNumbers";
import {
  buildWatermarkDrawOptions,
  computeImageWatermarkSize,
  computeWatermarkPosition,
  WATERMARK_MARGIN,
  type WatermarkOptions,
} from "@/pdf/watermark";

const PAGE = { width: 612, height: 792 };

function textWatermarkOptions(
  overrides: Partial<WatermarkOptions> = {},
): WatermarkOptions {
  return {
    mode: "text",
    text: "CONFIDENCIAL",
    image: null,
    position: "center",
    opacity: 0.3,
    angle: 45,
    fontSize: 48,
    pages: "all",
    ...overrides,
  };
}

describe("buildWatermarkOverlay — texto (R1, R2, R3, R4)", () => {
  it("coloca el overlay en computeWatermarkPosition (R1)", () => {
    const options = textWatermarkOptions({ position: "top-right" });
    const content = { width: 200, height: 48 };
    const overlay = buildWatermarkOverlay(options, PAGE, content);
    const expected = computeWatermarkPosition(
      options.position,
      PAGE.width,
      PAGE.height,
      content.width,
      content.height,
      WATERMARK_MARGIN,
    );
    expect(overlay.x).toBe(expected.x);
    expect(overlay.y).toBe(expected.y);
  });

  it("usa la opacidad de buildWatermarkDrawOptions (R2)", () => {
    const options = textWatermarkOptions({ opacity: 0.42 });
    const overlay = buildWatermarkOverlay(options, PAGE, {
      width: 200,
      height: 48,
    });
    expect(overlay.opacity).toBe(
      buildWatermarkDrawOptions(options.opacity, options.angle).opacity,
    );
  });

  it("expone rotationDegrees igual a options.angle (R3)", () => {
    const options = textWatermarkOptions({ angle: 30 });
    const overlay = buildWatermarkOverlay(options, PAGE, {
      width: 100,
      height: 48,
    });
    expect(overlay.rotationDegrees).toBe(30);
  });

  it("expone content de texto con text y fontSize (R4)", () => {
    const options = textWatermarkOptions({ text: "BORRADOR", fontSize: 36 });
    const overlay = buildWatermarkOverlay(options, PAGE, {
      width: 100,
      height: 36,
    });
    expect(overlay.content).toEqual({
      kind: "text",
      text: "BORRADOR",
      fontSize: 36,
    });
  });
});

describe("buildWatermarkOverlay — imagen (R5)", () => {
  it("dimensiona el overlay con computeImageWatermarkSize (R5)", () => {
    const options = textWatermarkOptions({ mode: "image", position: "center" });
    const content = { width: 400, height: 300 };
    const overlay = buildWatermarkOverlay(options, PAGE, content);
    const expected = computeImageWatermarkSize(
      content.width,
      content.height,
      PAGE.width,
      PAGE.height,
      WATERMARK_MARGIN,
    );
    expect(overlay.width).toBe(expected.drawWidth);
    expect(overlay.height).toBe(expected.drawHeight);
    expect(overlay.content).toEqual({ kind: "image" });
  });
});

describe("buildWatermarkOverlay — opciones sin `image` (#42 R4b, R5)", () => {
  it("produce un PreviewOverlay válido cuando las opciones NO llevan `image` (#42 R4b)", () => {
    // Objeto de opciones sin la propiedad `image` (como el memo de la vista
    // previa tras eliminar el dato muerto `image: null`).
    const options: Omit<WatermarkOptions, "image"> = {
      mode: "text",
      text: "CONFIDENCIAL",
      position: "center",
      opacity: 0.3,
      angle: 45,
      fontSize: 48,
      pages: "all",
    };
    const overlay = buildWatermarkOverlay(options, PAGE, {
      width: 200,
      height: 48,
    });
    expect(Number.isFinite(overlay.x)).toBe(true);
    expect(Number.isFinite(overlay.y)).toBe(true);
    expect(overlay.width).toBe(200);
    expect(overlay.height).toBe(48);
    expect(overlay.opacity).toBe(0.3);
    expect(overlay.rotationDegrees).toBe(45);
    expect(overlay.content).toEqual({
      kind: "text",
      text: "CONFIDENCIAL",
      fontSize: 48,
    });
  });

  it("el overlay es idéntico con y sin la propiedad `image` (#42 R5)", () => {
    const withImage = textWatermarkOptions({ position: "top-right" });
    // Misma opción sin `image` (el resto de campos idénticos).
    const withoutImage: Omit<WatermarkOptions, "image"> = {
      mode: withImage.mode,
      text: withImage.text,
      position: withImage.position,
      opacity: withImage.opacity,
      angle: withImage.angle,
      fontSize: withImage.fontSize,
      pages: withImage.pages,
    };
    const content = { width: 200, height: 48 };
    const overlayWith = buildWatermarkOverlay(withImage, PAGE, content);
    const overlayWithout = buildWatermarkOverlay(withoutImage, PAGE, content);
    expect(overlayWithout).toEqual(overlayWith);
  });
});

describe("buildPageNumbersOverlay (R6, R7)", () => {
  const options: PageNumbersOptions = {
    position: "bottom-right",
    format: "n-of-total",
    startNumber: 1,
    fontSize: 12,
  };

  it("usa la cadena de formatPageNumber con el total como addPageNumbers (R6)", () => {
    const content = { width: 40, height: 12 };
    const overlay = buildPageNumbersOverlay(options, PAGE, content, 2, 10);
    const expectedText = formatPageNumber(
      options.format,
      options.startNumber + 2,
      options.startNumber + 10 - 1,
    );
    expect(
      overlay.content.kind === "text" ? overlay.content.text : null,
    ).toBe(expectedText);
  });

  it("coloca el overlay en computeTextPosition (R7)", () => {
    const content = { width: 40, height: 12 };
    const overlay = buildPageNumbersOverlay(options, PAGE, content, 0, 10);
    const expected = computeTextPosition(
      options.position,
      PAGE.width,
      PAGE.height,
      content.width,
      options.fontSize,
      PAGE_NUMBER_MARGIN,
    );
    expect(overlay.x).toBe(expected.x);
    expect(overlay.y).toBe(expected.y);
  });
});

describe("toPreviewPixels (R8, R9)", () => {
  const overlay: PreviewOverlay = {
    x: 50,
    y: 100,
    width: 80,
    height: 20,
    opacity: 1,
    rotationDegrees: 0,
    content: { kind: "text", text: "x", fontSize: 12 },
  };

  it("convierte left/top del origen inferior-izquierdo al superior-izquierdo (R8)", () => {
    const rect = toPreviewPixels(overlay, PAGE, 2);
    expect(rect.left).toBe(overlay.x * 2);
    expect(rect.top).toBe((PAGE.height - overlay.y - overlay.height) * 2);
  });

  it("escala width/height por scale (R9)", () => {
    const rect = toPreviewPixels(overlay, PAGE, 1.5);
    expect(rect.width).toBe(overlay.width * 1.5);
    expect(rect.height).toBe(overlay.height * 1.5);
  });
});

describe("resolvePreviewPageIndex (R10, R11)", () => {
  it("devuelve el menor índice de la selección resuelta (R10)", () => {
    // "3,1" resuelve a [2, 0]; el menor índice 0-indexado es 0.
    expect(resolvePreviewPageIndex("3,1", 5)).toBe(0);
    expect(resolvePreviewPageIndex("2-4", 5)).toBe(1);
    expect(resolvePreviewPageIndex("all", 5)).toBe(0);
  });

  it("devuelve 0 para la selección vacía (R11)", () => {
    expect(resolvePreviewPageIndex("", 5)).toBe(0);
  });
});

describe("previewModel — módulo puro (R12)", () => {
  it("no importa React ni pdfjs-dist (R12)", () => {
    expect(previewModelSource).not.toMatch(/from ["']react["']/);
    expect(previewModelSource).not.toMatch(/from ["']pdfjs-dist/);
  });

  it("no accede al DOM (document/window/canvas) (R12)", () => {
    // Uso real de API del DOM (no menciones en comentarios): acceso a miembros.
    expect(previewModelSource).not.toMatch(/document\./);
    expect(previewModelSource).not.toMatch(/window\./);
    expect(previewModelSource).not.toMatch(/getContext|createElement/);
  });
});
