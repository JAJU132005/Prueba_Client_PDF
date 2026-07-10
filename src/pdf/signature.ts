import { PDFDocument } from "pdf-lib";

import type { Annotation, AnnotationColor, PdfPoint } from "@/pdf/annotate";
import { detectImageType } from "@/pdf/imagesToPdf";
import {
  InvalidImageError,
  InvalidPdfError,
  SignFailedError,
  type ProgressCallback,
} from "@/pdf/types";
import {
  computeWatermarkPosition,
  WATERMARK_MARGIN,
  type WatermarkPosition,
} from "@/pdf/watermark";

/**
 * Opciones de la operación de firma VISUAL (no criptográfica): colocar una
 * imagen de firma (JPG/PNG) en una página y posición concretas.
 */
export interface SignOptions {
  /** Índice 0-indexado de la página donde se coloca la firma. */
  pageIndex: number;
  /** Posición de la rejilla 3×3 reutilizada de la marca de agua (#12). */
  position: WatermarkPosition;
  /** Ancho objetivo de la firma en puntos PDF (escala explícita). */
  widthPts: number;
  /** Bytes de la imagen de firma (JPG o PNG). */
  image: Uint8Array;
}

/** Tamaño de dibujo de la firma en puntos PDF. */
export interface SignatureSize {
  width: number;
  height: number;
}

/** Colocación final de la firma: ancla inferior-izquierda + tamaño de dibujo. */
export interface SignaturePlacement {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Escala la imagen de firma a `targetWidthPts` preservando la relación de
 * aspecto: `width === targetWidthPts` y `height === imageHeight *
 * (targetWidthPts / imageWidth)`. Función pura: sin React, sin DOM. (R1)
 */
export function computeSignatureSize(
  imageWidth: number,
  imageHeight: number,
  targetWidthPts: number,
): SignatureSize {
  return {
    width: targetWidthPts,
    height: imageHeight * (targetWidthPts / imageWidth),
  };
}

/**
 * Deriva el ancla inferior-izquierda de la firma para una posición de la rejilla
 * 3×3, reutilizando `computeSignatureSize` (aspecto a un ancho dado) y
 * `computeWatermarkPosition` (ancla genérica de rejilla). Función pura. (R2)
 */
export function computeSignaturePlacement(
  imageWidth: number,
  imageHeight: number,
  pageWidth: number,
  pageHeight: number,
  targetWidthPts: number,
  position: WatermarkPosition,
  margin: number,
): SignaturePlacement {
  const { width, height } = computeSignatureSize(
    imageWidth,
    imageHeight,
    targetWidthPts,
  );
  const { x, y } = computeWatermarkPosition(
    position,
    pageWidth,
    pageHeight,
    width,
    height,
    margin,
  );
  return { x, y, width, height };
}

/**
 * Coloca (incrusta y dibuja) la imagen de firma en la página y posición elegidas
 * de `input` y devuelve los bytes del PDF resultante. Firma VISUAL, no
 * criptográfica. (R3–R9)
 * - Lanza `SignFailedError` si `widthPts` no es finito o `<= 0` (R8) o si
 *   `pageIndex` no es un entero dentro de `0..pageCount-1` (R5) → sin salida.
 * - Lanza `InvalidImageError` si la firma no tiene firma JPG/PNG o pdf-lib no
 *   puede incrustarla (R6) → sin salida.
 * - Lanza `InvalidPdfError` si `input` no es un PDF cargable (R7) → sin salida.
 * - Conserva el número de páginas (R4) y emite progreso en [0,1] terminando en
 *   1 (R9).
 * Función pura respecto a React/DOM (usa pdf-lib, que es JS puro).
 */
export async function signPdf(
  input: Uint8Array,
  options: SignOptions,
  onProgress?: ProgressCallback,
): Promise<Uint8Array> {
  onProgress?.(0);

  if (!Number.isFinite(options.widthPts) || options.widthPts <= 0) {
    throw new SignFailedError("El ancho de la firma no es válido."); // (R8)
  }

  const type = detectImageType(options.image);
  if (type === null) {
    throw new InvalidImageError("La firma no es un JPG o PNG válido."); // (R6)
  }

  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(input);
  } catch {
    throw new InvalidPdfError("El archivo no es un PDF válido."); // (R7)
  }

  const pageCount = doc.getPageCount();
  if (
    !Number.isInteger(options.pageIndex) ||
    options.pageIndex < 0 ||
    options.pageIndex >= pageCount
  ) {
    throw new SignFailedError("La página indicada no existe."); // (R5)
  }

  let embedded;
  try {
    embedded =
      type === "jpeg"
        ? await doc.embedJpg(options.image)
        : await doc.embedPng(options.image);
  } catch {
    throw new InvalidImageError("La firma no se puede incrustar."); // (R6)
  }

  onProgress?.(0.5); // (R9)

  const page = doc.getPage(options.pageIndex);
  const { width: pageWidth, height: pageHeight } = page.getSize();
  const placement = computeSignaturePlacement(
    embedded.width,
    embedded.height,
    pageWidth,
    pageHeight,
    options.widthPts,
    options.position,
    WATERMARK_MARGIN,
  );
  page.drawImage(embedded, {
    x: placement.x,
    y: placement.y,
    width: placement.width,
    height: placement.height,
  }); // (R3)

  onProgress?.(1); // (R9)
  return doc.save(); // (R4)
}

// ---------------------------------------------------------------------------
// Colocación libre (#30). Añadido ADITIVO: geometría pura de arrastrar/
// redimensionar la firma y puente firma → anotaciones de imagen/texto que se
// aplanan con `flattenAnnotations` (vía `pdfClient.annotate`). Sin React/DOM.
// ---------------------------------------------------------------------------

/** Caja de firma en puntos PDF, origen inferior-izquierdo (mismo que pdf-lib). */
export interface FreePlacement {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Elemento opcional colocable junto a la firma (fecha o texto libre). */
export interface SignatureExtra {
  id: string;
  kind: "date" | "text";
  /** Texto ya resuelto (la fecha llega formateada por `formatSignatureDate`). */
  text: string;
  /** Ancla inferior-izquierda en puntos PDF. */
  at: PdfPoint;
  fontSize: number;
  color: AnnotationColor;
}

/** Tirador de redimensionado: una de las cuatro esquinas de la caja. */
export type SignatureHandle = "nw" | "ne" | "sw" | "se";

/** Esquina opuesta a cada tirador (queda FIJA al redimensionar). (R4) */
const OPPOSITE_HANDLE: Record<SignatureHandle, SignatureHandle> = {
  nw: "se",
  ne: "sw",
  sw: "ne",
  se: "nw",
};

/** Coordenadas PDF (y-arriba) de las 4 esquinas de una `FreePlacement`. */
function boxCorners(box: FreePlacement): Record<SignatureHandle, PdfPoint> {
  return {
    sw: { x: box.x, y: box.y },
    se: { x: box.x + box.width, y: box.y },
    nw: { x: box.x, y: box.y + box.height },
    ne: { x: box.x + box.width, y: box.y + box.height },
  };
}

/**
 * Ancla exacta `at` + aspecto preservado a un ancho objetivo: `width ===
 * targetWidthPts` y `height === imageHeight * (targetWidthPts / imageWidth)`.
 * Sin ajuste a rejilla. Función pura. (R1)
 */
export function computeSignatureBox(
  imageWidth: number,
  imageHeight: number,
  at: PdfPoint,
  targetWidthPts: number,
): FreePlacement {
  return {
    x: at.x,
    y: at.y,
    width: targetWidthPts,
    height: imageHeight * (targetWidthPts / imageWidth),
  };
}

/**
 * Traslado INMUTABLE de la caja por `(dx, dy)`: `x`/`y` desplazados,
 * `width`/`height` intactos. No muta la entrada. (R2)
 */
export function moveSignatureBox(
  box: FreePlacement,
  dx: number,
  dy: number,
): FreePlacement {
  return {
    x: box.x + dx,
    y: box.y + dy,
    width: box.width,
    height: box.height,
  };
}

/**
 * Redimensiona arrastrando `handle` hasta `to`, con la esquina opuesta FIJA
 * (R4), relación de aspecto `width / height === aspectRatio` preservada (R3) y
 * clamps que garantizan `width >= minSize` y `height >= minSize` (R5). Inmutable.
 */
export function resizeSignatureBox(
  box: FreePlacement,
  handle: SignatureHandle,
  to: PdfPoint,
  aspectRatio: number,
  minSize: number,
): FreePlacement {
  const fixed = boxCorners(box)[OPPOSITE_HANDLE[handle]];

  // Ancho/alto brutos según el puntero; se expanden para CUBRIR y luego se
  // fuerzan al aspecto (height = width / aspectRatio).
  const rawWidth = Math.abs(to.x - fixed.x);
  const rawHeight = Math.abs(to.y - fixed.y);
  let width = Math.max(rawWidth, rawHeight * aspectRatio);

  // Clamp preservando el aspecto: garantiza ambos lados >= minSize. (R5)
  const minWidth = Math.max(minSize, minSize * aspectRatio);
  width = Math.max(width, minWidth);
  const height = width / aspectRatio;

  // La caja crece desde la esquina fija hacia la dirección del tirador.
  const dirX = to.x >= fixed.x ? 1 : -1;
  const dirY = to.y >= fixed.y ? 1 : -1;
  const cornerX = fixed.x + dirX * width;
  const cornerY = fixed.y + dirY * height;

  return {
    x: Math.min(fixed.x, cornerX),
    y: Math.min(fixed.y, cornerY),
    width,
    height,
  };
}

/**
 * Puente firma → anotaciones: por cada índice de `pageIndices`, una anotación
 * `image` con la geometría de `placement` y `data === image` (R6, R7) y, por
 * cada extra, una anotación `text` con su `text`/`at`/`fontSize`/`color` (R8).
 * Con `extras` vacío, solo devuelve imágenes (R9). Sin React/DOM. Puro.
 */
export function buildSignatureAnnotations(
  placement: FreePlacement,
  image: Uint8Array,
  pageIndices: readonly number[],
  extras: readonly SignatureExtra[],
  makeId: (pageIndex: number, part: string) => string,
): Annotation[] {
  const annotations: Annotation[] = [];
  for (const pageIndex of pageIndices) {
    annotations.push({
      id: makeId(pageIndex, "image"),
      pageIndex,
      kind: "image",
      at: { x: placement.x, y: placement.y },
      width: placement.width,
      height: placement.height,
      data: image,
    });
    for (const extra of extras) {
      annotations.push({
        id: makeId(pageIndex, extra.id),
        pageIndex,
        kind: "text",
        at: { x: extra.at.x, y: extra.at.y },
        text: extra.text,
        fontSize: extra.fontSize,
        color: extra.color,
      });
    }
  }
  return annotations;
}

/** Fecha determinista `AAAA-MM-DD` (UTC, independiente de la zona horaria). (R10) */
export function formatSignatureDate(date: Date): string {
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
