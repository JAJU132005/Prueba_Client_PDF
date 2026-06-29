import { PDFDocument, StandardFonts, degrees, type Rotation } from "pdf-lib";

import { detectImageType } from "@/pdf/imagesToPdf";
import type { PageSelection } from "@/pdf/rotateOptions";
import { parsePageRanges } from "@/pdf/splitRanges";
import {
  InvalidImageError,
  InvalidPdfError,
  WatermarkFailedError,
  type ProgressCallback,
} from "@/pdf/types";

/** Modos de marca: texto o imagen. (R1) */
export type WatermarkMode = "text" | "image";

/** Lista canónica de modos. (R1) */
export const WATERMARK_MODES: readonly WatermarkMode[] = ["text", "image"];

/** Posiciones de la marca (vertical-horizontal, rejilla 3×3). (R2) */
export type WatermarkPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "middle-left"
  | "center"
  | "middle-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

/** Lista canónica de posiciones, en orden. (R2) */
export const WATERMARK_POSITIONS: readonly WatermarkPosition[] = [
  "top-left",
  "top-center",
  "top-right",
  "middle-left",
  "center",
  "middle-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];

/** Margen fijo desde el borde, en puntos. (R3–R8) */
export const WATERMARK_MARGIN = 36;

/** Tamaño de fuente por defecto, en puntos. */
export const DEFAULT_WATERMARK_FONT_SIZE = 48;

/** Opacidad por defecto, en (0, 1]. */
export const DEFAULT_WATERMARK_OPACITY = 0.3;

/** Ángulo de rotación por defecto, en grados. */
export const DEFAULT_WATERMARK_ANGLE = 45;

/** Coordenadas del ancla inferior-izquierda del contenido de la marca. */
export interface WatermarkPosition2D {
  x: number;
  y: number;
}

/**
 * Calcula el ancla `(x, y)` de la marca según la posición, las dimensiones de la
 * página, el tamaño del contenido (texto o imagen) y el margen. (R3–R8)
 *
 * - `x`: `*-left` → margen (R3); `*-right` → `pageWidth − margin − contentWidth`
 *   (R4); centrado → `(pageWidth − contentWidth) / 2` (R5).
 * - `y`: `bottom-*` → margen (R6); `top-*` → `pageHeight − margin − contentHeight`
 *   (R7); medio → `(pageHeight − contentHeight) / 2` (R8).
 *
 * Función pura: sin React, sin DOM.
 */
export function computeWatermarkPosition(
  position: WatermarkPosition,
  pageWidth: number,
  pageHeight: number,
  contentWidth: number,
  contentHeight: number,
  margin: number,
): WatermarkPosition2D {
  const x = position.endsWith("left")
    ? margin // (R3)
    : position.endsWith("right")
      ? pageWidth - margin - contentWidth // (R4)
      : (pageWidth - contentWidth) / 2; // center (R5)
  const y = position.startsWith("bottom")
    ? margin // (R6)
    : position.startsWith("top")
      ? pageHeight - margin - contentHeight // (R7)
      : (pageHeight - contentHeight) / 2; // middle (R8)
  return { x, y };
}

/** Dimensiones de dibujo de la imagen de marca. */
export interface ImageWatermarkSize {
  drawWidth: number;
  drawHeight: number;
}

/**
 * Escala la imagen de marca para que quepa dentro de la página menos dos
 * márgenes, preservando la relación de aspecto. (R9, R10)
 *
 * Función pura: sin React, sin DOM.
 */
export function computeImageWatermarkSize(
  imageWidth: number,
  imageHeight: number,
  pageWidth: number,
  pageHeight: number,
  margin: number,
): ImageWatermarkSize {
  const availWidth = pageWidth - 2 * margin;
  const availHeight = pageHeight - 2 * margin;
  // Escala que preserva aspecto (R9) y no excede el área disponible (R10).
  const scale = Math.min(availWidth / imageWidth, availHeight / imageHeight);
  return {
    drawWidth: imageWidth * scale,
    drawHeight: imageHeight * scale,
  };
}

/** Opciones de dibujo registradas (opacidad + rotación). */
export interface WatermarkDrawOptions {
  opacity: number;
  rotate: Rotation;
}

/**
 * Registra la opacidad y la rotación pedidas como opciones de dibujo de pdf-lib.
 * Devuelve exactamente `{ opacity, rotate: degrees(angle) }`. (R11, R12)
 *
 * Función pura: usa `degrees` de pdf-lib (JS puro), sin React ni DOM.
 */
export function buildWatermarkDrawOptions(
  opacity: number,
  angle: number,
): WatermarkDrawOptions {
  return { opacity, rotate: degrees(angle) };
}

/**
 * Resuelve los índices 0-indexados de las páginas a marcar. (R15, R34)
 *
 * - `"all"` → todos los índices `[0..pageCount-1]` (R15).
 * - cadena de rangos → delega en `parsePageRanges` (#6), propagando
 *   `InvalidRangeError` sin capturar (R34).
 *
 * Función pura: sin pdf-lib, sin React, sin DOM.
 */
export function resolveWatermarkPages(
  pages: PageSelection,
  pageCount: number,
): number[] {
  if (pages === "all") {
    return Array.from({ length: pageCount }, (_, i) => i); // (R15)
  }
  return parsePageRanges(pages, pageCount); // (R34)
}

/** Opciones de la operación de marca de agua. */
export interface WatermarkOptions {
  mode: WatermarkMode;
  text: string;
  image: Uint8Array | null;
  position: WatermarkPosition;
  opacity: number;
  angle: number;
  fontSize: number;
  pages: PageSelection;
}

/**
 * Superpone una marca (texto o imagen) en las páginas elegidas de `input` y
 * devuelve los bytes. (R13–R33)
 * - Lanza `InvalidPdfError` si los bytes no son un PDF cargable (R25) → sin
 *   salida (R26).
 * - Lanza `WatermarkFailedError` si 0 páginas (R27), `opacity ∉ (0,1]` (R28),
 *   `angle` no finito (R29), texto vacío (R30) o `fontSize` no finito > 0 (R31).
 * - Lanza `InvalidImageError` si la imagen falta/no es JPG-PNG (R32) o no es
 *   incrustable (R33).
 * - Lanza `InvalidRangeError` si los rangos de `pages` son inválidos (R34) → sin
 *   salida.
 * - Emite progreso en [0,1], terminando en 1. (R23, R24)
 * Función pura respecto a React/DOM (usa pdf-lib, que es JS puro). (R35)
 */
export async function addWatermark(
  input: Uint8Array,
  options: WatermarkOptions,
  onProgress?: ProgressCallback,
): Promise<Uint8Array> {
  onProgress?.(0);

  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(input);
  } catch {
    throw new InvalidPdfError("El archivo no es un PDF válido."); // (R25, R26)
  }

  const pageCount = doc.getPageCount();
  if (pageCount === 0) {
    throw new WatermarkFailedError("El PDF no tiene páginas."); // (R27)
  }
  if (
    !Number.isFinite(options.opacity) ||
    options.opacity <= 0 ||
    options.opacity > 1
  ) {
    throw new WatermarkFailedError("La opacidad no es válida."); // (R28)
  }
  if (!Number.isFinite(options.angle)) {
    throw new WatermarkFailedError("El ángulo no es válido."); // (R29)
  }

  const indices = resolveWatermarkPages(options.pages, pageCount); // (R15, R34)
  const draw = buildWatermarkDrawOptions(options.opacity, options.angle); // (R11, R12)
  const pages = doc.getPages();

  if (options.mode === "text") {
    if (options.text.trim() === "") {
      throw new WatermarkFailedError("El texto de la marca está vacío."); // (R30)
    }
    if (!Number.isFinite(options.fontSize) || options.fontSize <= 0) {
      throw new WatermarkFailedError("El tamaño de fuente no es válido."); // (R31)
    }

    const font = await doc.embedFont(StandardFonts.Helvetica); // (R18)
    indices.forEach((i, k) => {
      const page = pages[i];
      const { width, height } = page.getSize();
      const textWidth = font.widthOfTextAtSize(options.text, options.fontSize);
      const { x, y } = computeWatermarkPosition(
        options.position,
        width,
        height,
        textWidth,
        options.fontSize,
        WATERMARK_MARGIN,
      );
      page.drawText(options.text, {
        x,
        y,
        size: options.fontSize,
        font,
        opacity: draw.opacity, // (R19)
        rotate: draw.rotate, // (R19)
      });
      onProgress?.((k + 1) / indices.length); // (R23, R24)
    });
  } else {
    if (options.image === null || detectImageType(options.image) === null) {
      throw new InvalidImageError(
        "La imagen de marca no es un JPG o PNG válido.",
      ); // (R32)
    }
    const imageBytes = options.image;
    let embedded;
    try {
      embedded =
        detectImageType(imageBytes) === "jpeg"
          ? await doc.embedJpg(imageBytes)
          : await doc.embedPng(imageBytes);
    } catch {
      throw new InvalidImageError(
        "La imagen de marca no se puede incrustar.",
      ); // (R33)
    }
    indices.forEach((i, k) => {
      const page = pages[i];
      const { width, height } = page.getSize();
      const { drawWidth, drawHeight } = computeImageWatermarkSize(
        embedded.width,
        embedded.height,
        width,
        height,
        WATERMARK_MARGIN,
      );
      const { x, y } = computeWatermarkPosition(
        options.position,
        width,
        height,
        drawWidth,
        drawHeight,
        WATERMARK_MARGIN,
      );
      page.drawImage(embedded, {
        x,
        y,
        width: drawWidth, // (R21)
        height: drawHeight, // (R21)
        opacity: draw.opacity, // (R21)
        rotate: draw.rotate, // (R21)
      });
      onProgress?.((k + 1) / indices.length); // (R23, R24)
    });
  }

  onProgress?.(1); // (R24)
  return doc.save(); // (R17, R22)
}
