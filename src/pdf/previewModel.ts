/**
 * Modelo PURO de previsualización en vivo. Dado un conjunto de opciones de una
 * herramienta (marca de agua #12, números de página #11) y las dimensiones de
 * una página real, calcula el/los `PreviewOverlay` (posición/parámetros) y su
 * conversión a píxeles. DERIVA de las funciones de dominio ya existentes
 * (`computeWatermarkPosition`, `computeImageWatermarkSize`,
 * `buildWatermarkDrawOptions`, `formatPageNumber`, `computeTextPosition`) sin
 * reimplementar los cálculos ni cambiar sus firmas.
 *
 * Sin React, sin `pdfjs-dist`, sin DOM (`document`/`window`/`<canvas>`): es el
 * núcleo testeable del panel `LivePreview`. (R1–R12)
 */

import type { PageSelection } from "@/pdf/rotateOptions";
import { resolvePages } from "@/pdf/pageSelection";
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

/** Dimensiones de la página en puntos PDF. */
export interface PreviewPageSize {
  width: number;
  height: number;
}

/** Tamaño del contenido a colocar, en puntos PDF (texto medido / imagen intrínseca). */
export interface ContentSize {
  width: number;
  height: number;
}

/** Contenido de un overlay: texto (con su cadena y tamaño) o imagen. */
export type PreviewContent =
  | { kind: "text"; text: string; fontSize: number }
  | { kind: "image" };

/**
 * Overlay de aproximación sobre la página. `(x, y)` es el ancla
 * inferior-izquierda en puntos PDF (mismo origen que pdf-lib).
 */
export interface PreviewOverlay {
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  rotationDegrees: number;
  content: PreviewContent;
}

/** Rectángulo en píxeles con origen superior-izquierdo (para posicionar por CSS). */
export interface PreviewPixelRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Construye el overlay de una marca de agua a partir de sus opciones de dominio,
 * derivando la posición de `computeWatermarkPosition`, la opacidad de
 * `buildWatermarkDrawOptions` y, en modo imagen, el tamaño de
 * `computeImageWatermarkSize`. (R1–R5)
 *
 * - En modo texto, `content` es el tamaño ya medido del texto (lo mide el
 *   componente con el DOM); el modelo solo coloca. El tamaño del overlay es el
 *   propio `content` (R1).
 * - En modo imagen, el tamaño del overlay se calcula con
 *   `computeImageWatermarkSize(content.width, content.height, ...)` (R5).
 */
export function buildWatermarkOverlay(
  options: WatermarkOptions,
  page: PreviewPageSize,
  content: ContentSize,
): PreviewOverlay {
  // Opacidad exactamente como el ensamblado real. (R2)
  const draw = buildWatermarkDrawOptions(options.opacity, options.angle);

  if (options.mode === "image") {
    // Tamaño derivado de la misma función de dominio que usa addWatermark. (R5)
    const { drawWidth, drawHeight } = computeImageWatermarkSize(
      content.width,
      content.height,
      page.width,
      page.height,
      WATERMARK_MARGIN,
    );
    // Ancla derivada de computeWatermarkPosition con el tamaño dibujado.
    const { x, y } = computeWatermarkPosition(
      options.position,
      page.width,
      page.height,
      drawWidth,
      drawHeight,
      WATERMARK_MARGIN,
    );
    return {
      x,
      y,
      width: drawWidth,
      height: drawHeight,
      opacity: draw.opacity,
      rotationDegrees: options.angle, // (R3)
      content: { kind: "image" },
    };
  }

  // Modo texto: el tamaño es el contenido medido; la posición deriva de dominio. (R1)
  const { x, y } = computeWatermarkPosition(
    options.position,
    page.width,
    page.height,
    content.width,
    content.height,
    WATERMARK_MARGIN,
  );
  return {
    x,
    y,
    width: content.width,
    height: content.height,
    opacity: draw.opacity, // (R2)
    rotationDegrees: options.angle, // (R3)
    // Texto/tamaño tal cual las opciones. (R4)
    content: { kind: "text", text: options.text, fontSize: options.fontSize },
  };
}

/**
 * Construye el overlay del número de una página, derivando la cadena de
 * `formatPageNumber` y la posición de `computeTextPosition`. El `total` para el
 * formato `n-of-total` se calcula igual que en `addPageNumbers`
 * (`startNumber + totalPages - 1`). `pageIndex` es 0-indexado. (R6, R7)
 */
export function buildPageNumbersOverlay(
  options: PageNumbersOptions,
  page: PreviewPageSize,
  content: ContentSize,
  pageIndex: number,
  totalPages: number,
): PreviewOverlay {
  const current = options.startNumber + pageIndex;
  const total = options.startNumber + totalPages - 1;
  // Cadena idéntica a la que dibuja addPageNumbers. (R6)
  const text = formatPageNumber(options.format, current, total);
  // Línea base derivada de la misma función de dominio. (R7)
  const { x, y } = computeTextPosition(
    options.position,
    page.width,
    page.height,
    content.width,
    options.fontSize,
    PAGE_NUMBER_MARGIN,
  );
  return {
    x,
    y,
    width: content.width,
    height: options.fontSize,
    opacity: 1,
    rotationDegrees: 0,
    content: { kind: "text", text, fontSize: options.fontSize },
  };
}

/**
 * Convierte un overlay (origen inferior-izquierdo, puntos PDF) a un rectángulo en
 * píxeles con origen superior-izquierdo, aplicando `scale`. (R8, R9)
 */
export function toPreviewPixels(
  overlay: PreviewOverlay,
  page: PreviewPageSize,
  scale: number,
): PreviewPixelRect {
  return {
    left: overlay.x * scale, // (R8)
    top: (page.height - overlay.y - overlay.height) * scale, // (R8)
    width: overlay.width * scale, // (R9)
    height: overlay.height * scale, // (R9)
  };
}

/**
 * Índice 0-indexado de la página a previsualizar para una selección:
 * - selección vacía (`""`) → `0` (R11),
 * - en otro caso, el menor índice resuelto por `resolvePages` (R10); si el
 *   arreglo resultara vacío, `0`.
 */
export function resolvePreviewPageIndex(
  selection: PageSelection,
  pageCount: number,
): number {
  if (selection === "") {
    return 0; // (R11)
  }
  const indices = resolvePages(selection, pageCount);
  if (indices.length === 0) {
    return 0;
  }
  return Math.min(...indices); // (R10)
}
