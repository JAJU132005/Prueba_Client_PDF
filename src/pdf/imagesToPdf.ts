import { PDFDocument } from "pdf-lib";

import {
  ImagesToPdfFailedError,
  InvalidImageError,
  type ProgressCallback,
} from "@/pdf/types";

/** Tipos de imagen soportados. (R4) */
export type ImageType = "jpeg" | "png";

/** Lista canónica de tipos. (R4) */
export const IMAGE_TYPES: readonly ImageType[] = ["jpeg", "png"];

/** Modo de tamaño de página. (R5) */
export type PageSizeMode = "fit" | "a4";

/** Lista canónica de modos. (R5) */
export const PAGE_SIZE_MODES: readonly PageSizeMode[] = ["fit", "a4"];

/** A4 vertical en puntos (PageSizes.A4 de pdf-lib). (R8) */
export const A4_PORTRAIT: { width: number; height: number } = {
  width: 595.28,
  height: 841.89,
};

/** Margen para el modo "a4", en puntos. (R10–R13) */
export const A4_MARGIN = 36;

/** Geometría resultante de una página. */
export interface PageLayout {
  pageWidth: number;
  pageHeight: number;
  drawWidth: number;
  drawHeight: number;
  x: number;
  y: number;
}

/** Firma JPEG: FF D8 FF. (R1) */
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff] as const;

/** Firma PNG: 89 50 4E 47 0D 0A 1A 0A. (R2) */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) {
    return false;
  }
  for (let i = 0; i < signature.length; i++) {
    if (bytes[i] !== signature[i]) {
      return false;
    }
  }
  return true;
}

/** Detecta el tipo por firma de bytes; null si no es JPG/PNG. (R1–R3) */
export function detectImageType(bytes: Uint8Array): ImageType | null {
  if (startsWith(bytes, JPEG_SIGNATURE)) {
    return "jpeg";
  }
  if (startsWith(bytes, PNG_SIGNATURE)) {
    return "png";
  }
  return null;
}

/** Calcula la geometría de la página según el modo. (R6–R13) */
export function computePageLayout(
  imageWidth: number,
  imageHeight: number,
  mode: PageSizeMode,
): PageLayout {
  if (mode === "fit") {
    // Página = imagen; dibujo a página completa desde el origen. (R6, R7)
    return {
      pageWidth: imageWidth,
      pageHeight: imageHeight,
      drawWidth: imageWidth,
      drawHeight: imageHeight,
      x: 0,
      y: 0,
    };
  }

  // Modo "a4": página A4 vertical; imagen escalada con aspecto y centrada.
  const pageWidth = A4_PORTRAIT.width;
  const pageHeight = A4_PORTRAIT.height;
  const availWidth = pageWidth - 2 * A4_MARGIN;
  const availHeight = pageHeight - 2 * A4_MARGIN;
  // Escala que preserva aspecto y cabe dentro de los márgenes. (R9, R10, R11)
  const scale = Math.min(availWidth / imageWidth, availHeight / imageHeight);
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;
  return {
    pageWidth,
    pageHeight,
    drawWidth,
    drawHeight,
    x: (pageWidth - drawWidth) / 2, // centrado horizontal (R12)
    y: (pageHeight - drawHeight) / 2, // centrado vertical (R13)
  };
}

/** Opciones de construcción. */
export interface ImagesToPdfOptions {
  pageSize: PageSizeMode;
}

/**
 * Construye un PDF con una imagen por página, en el orden de `images`. (R14–R25)
 * - Lanza `ImagesToPdfFailedError` si `images` está vacío. (R21)
 * - Lanza `InvalidImageError` (abortando, sin salida) si alguna imagen no tiene
 *   firma JPG/PNG (R18, R19) o si pdf-lib no puede incrustarla (R20, R22).
 * - Emite progreso en [0,1], terminando en 1. (R23, R24)
 * Función pura respecto a React/DOM (usa pdf-lib, que es JS puro). (R26)
 */
export async function imagesToPdf(
  images: readonly Uint8Array[],
  options: ImagesToPdfOptions,
  onProgress?: ProgressCallback,
): Promise<Uint8Array> {
  if (images.length === 0) {
    throw new ImagesToPdfFailedError("No hay imágenes para convertir.");
  }

  onProgress?.(0);
  const out = await PDFDocument.create();
  const n = images.length;

  for (let i = 0; i < n; i++) {
    const bytes = images[i];
    const type = detectImageType(bytes); // (R1–R3)
    if (type === null) {
      // Firma desconocida: abortar antes de tocar pdf-lib. (R18, R19, R22)
      throw new InvalidImageError(
        `La imagen ${String(i + 1)} no es un JPG o PNG válido.`,
      );
    }

    let embedded;
    try {
      embedded =
        type === "jpeg"
          ? await out.embedJpg(bytes) // (R16)
          : await out.embedPng(bytes); // (R17)
    } catch {
      // Firma válida pero cuerpo corrupto/incrustable. (R20, R22)
      throw new InvalidImageError(
        `La imagen ${String(i + 1)} está corrupta o no se puede incrustar.`,
      );
    }

    const layout = computePageLayout(
      embedded.width,
      embedded.height,
      options.pageSize,
    );
    const page = out.addPage([layout.pageWidth, layout.pageHeight]); // (R6,R8,R14,R15)
    page.drawImage(embedded, {
      x: layout.x,
      y: layout.y,
      width: layout.drawWidth,
      height: layout.drawHeight,
    }); // (R7, R9–R13)

    onProgress?.((i + 1) / n); // (R23, R24: último = 1)
  }

  return out.save(); // (R25)
}
