/**
 * Dominio PURO de la redacción PERMANENTE (pdf-lib + geometría). Sin React/DOM.
 *
 * SEGURIDAD (invariante no negociable): las páginas con cajas de redacción se
 * sustituyen en la salida por una página NUEVA que contiene ÚNICAMENTE la imagen
 * rasterizada (con las cajas ya pintadas opacas sobre el bitmap por el adaptador
 * `@/lib/redactionRasterizer`). El content stream original NO se copia para esas
 * páginas → no queda texto/vectorial extraíble bajo la caja. Las páginas SIN
 * cajas se copian vectoriales con `copyPages` (no se rasterizan). (R3–R7)
 */

import { PDFDocument } from "pdf-lib";

import { detectImageType } from "@/pdf/imagesToPdf";
import {
  InvalidImageError,
  InvalidPdfError,
  RedactFailedError,
  type ProgressCallback,
} from "@/pdf/types";

/**
 * Caja de redacción en coordenadas NORMALIZADAS `[0,1]` con origen
 * superior-izquierdo, independientes de la escala de render. (Ver design
 * §Geometría para por qué NO se usan puntos PDF.)
 */
export interface NormalizedBox {
  pageIndex: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Rectángulo en píxeles del bitmap rasterizado (origen superior-izquierdo). */
export interface PixelRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Punto del lienzo (px, origen superior-izquierdo). */
export interface CanvasPoint {
  x: number;
  y: number;
}

/** Imagen ya redactada (bitmap con cajas opacas) de una página. */
export interface RedactedPageImage {
  pageIndex: number;
  bytes: Uint8Array;
  /** `"image/png"` | `"image/jpeg"`. */
  mimeType: string;
}

/** Acota `value` al intervalo `[min, max]`. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Deriva una caja normalizada `[0,1]` a partir de dos esquinas del lienzo, en
 * cualquier orden de arrastre, escalando por el tamaño del lienzo y acotando al
 * mismo. Función PURA (sin DOM). (R14)
 */
export function normalizedBoxFromCanvas(
  a: CanvasPoint,
  b: CanvasPoint,
  canvasWidth: number,
  canvasHeight: number,
  pageIndex: number,
): NormalizedBox {
  // Acota cada punto al lienzo antes de normalizar (arrastre fuera de límites).
  const ax = clamp(a.x, 0, canvasWidth);
  const ay = clamp(a.y, 0, canvasHeight);
  const bx = clamp(b.x, 0, canvasWidth);
  const by = clamp(b.y, 0, canvasHeight);
  const left = Math.min(ax, bx) / canvasWidth;
  const top = Math.min(ay, by) / canvasHeight;
  const right = Math.max(ax, bx) / canvasWidth;
  const bottom = Math.max(ay, by) / canvasHeight;
  return {
    pageIndex,
    left: clamp(left, 0, 1),
    top: clamp(top, 0, 1),
    width: clamp(right - left, 0, 1),
    height: clamp(bottom - top, 0, 1),
  };
}

/**
 * Convierte una caja normalizada a un rectángulo en píxeles del bitmap,
 * escalando por sus dimensiones. Función PURA (sin DOM). (R15)
 */
export function normalizedBoxToPixels(
  box: NormalizedBox,
  bitmapWidth: number,
  bitmapHeight: number,
): PixelRect {
  return {
    left: box.left * bitmapWidth,
    top: box.top * bitmapHeight,
    width: box.width * bitmapWidth,
    height: box.height * bitmapHeight,
  };
}

/**
 * Conjunto ORDENADO y SIN DUPLICADOS de índices de página con al menos una caja.
 * Función PURA. Determina qué páginas se rasterizan (solo estas). (R16, R7)
 */
export function pagesWithRedactions(boxes: readonly NormalizedBox[]): number[] {
  const set = new Set<number>();
  for (const box of boxes) {
    set.add(box.pageIndex);
  }
  return [...set].sort((x, y) => x - y);
}

/**
 * Ensambla el PDF redactado: cada página con imagen redactada se sustituye por
 * una página NUEVA que contiene solo esa imagen (mismo tamaño que la original);
 * las páginas intactas se copian vectoriales. Emite progreso en `[0,1]`
 * terminando en `1`. (R3–R7, R11–R13, R17, R18)
 */
export async function redactPdf(
  input: Uint8Array,
  redactedPages: readonly RedactedPageImage[],
  onProgress?: ProgressCallback,
): Promise<Uint8Array> {
  onProgress?.(0);

  // Sin páginas redactadas: no hay nada que redactar. (R12)
  if (redactedPages.length === 0) {
    throw new RedactFailedError("No se proporcionó ninguna página redactada.");
  }

  let doc;
  try {
    doc = await PDFDocument.load(input); // (R11)
  } catch {
    throw new InvalidPdfError("El archivo no es un PDF válido.");
  }

  const n = doc.getPageCount();
  const src = doc.getPages();

  // Valida cada página redactada: índice entero, en rango y único. (R13)
  const byPage = new Map<number, RedactedPageImage>();
  for (const rp of redactedPages) {
    if (
      !Number.isInteger(rp.pageIndex) ||
      rp.pageIndex < 0 ||
      rp.pageIndex >= n
    ) {
      throw new RedactFailedError(
        `La página redactada ${String(rp.pageIndex)} está fuera de rango.`,
      );
    }
    if (byPage.has(rp.pageIndex)) {
      throw new RedactFailedError(
        `La página ${String(rp.pageIndex)} está redactada más de una vez.`,
      );
    }
    byPage.set(rp.pageIndex, rp);
  }

  const out = await PDFDocument.create();

  for (let i = 0; i < n; i++) {
    const redacted = byPage.get(i);
    if (redacted) {
      // Página redactada: página NUEVA que contiene SOLO la imagen. El content
      // stream original NUNCA se copia → sin capa de texto extraíble. (R3, R4)
      const type = detectImageType(redacted.bytes);
      if (type === null) {
        throw new InvalidImageError(
          `La imagen de la página ${String(i + 1)} no es un PNG o JPG válido.`,
        );
      }
      let embedded;
      try {
        embedded =
          type === "png"
            ? await out.embedPng(redacted.bytes)
            : await out.embedJpg(redacted.bytes);
      } catch {
        throw new InvalidImageError(
          `La imagen de la página ${String(i + 1)} no se puede incrustar.`,
        );
      }
      // Mismo tamaño que la página original; la imagen la cubre por completo.
      const { width, height } = src[i].getSize(); // (R18)
      const page = out.addPage([width, height]);
      page.drawImage(embedded, { x: 0, y: 0, width, height }); // (R4, R18)
    } else {
      // Página intacta: se copia VECTORIAL (conserva texto/calidad). (R6, R7)
      const [copied] = await out.copyPages(doc, [i]);
      out.addPage(copied);
    }
    onProgress?.((i + 1) / n);
  }

  onProgress?.(1); // (R17)
  return out.save();
}
