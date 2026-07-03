import { PDFDocument } from "pdf-lib";

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
