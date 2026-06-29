import { PDFDocument, StandardFonts } from "pdf-lib";

import {
  InvalidPdfError,
  PageNumbersFailedError,
  type ProgressCallback,
} from "@/pdf/types";

/** Formatos de numeración. (R1) */
export type PageNumberFormat = "n" | "n-of-total" | "page-n";

/** Lista canónica de formatos. (R1) */
export const PAGE_NUMBER_FORMATS: readonly PageNumberFormat[] = [
  "n",
  "n-of-total",
  "page-n",
];

/** Posiciones de la numeración (vertical-horizontal). (R5) */
export type PageNumberPosition =
  | "bottom-left"
  | "bottom-center"
  | "bottom-right"
  | "top-left"
  | "top-center"
  | "top-right";

/** Lista canónica de posiciones. (R5) */
export const PAGE_NUMBER_POSITIONS: readonly PageNumberPosition[] = [
  "bottom-left",
  "bottom-center",
  "bottom-right",
  "top-left",
  "top-center",
  "top-right",
];

/** Margen fijo desde el borde, en puntos. (R6–R10) */
export const PAGE_NUMBER_MARGIN = 36;

/** Tamaño de fuente por defecto, en puntos. */
export const DEFAULT_PAGE_NUMBER_FONT_SIZE = 12;

/** Coordenadas de la línea base del texto. */
export interface TextPosition {
  x: number;
  y: number;
}

/** Construye la cadena a dibujar según el formato. (R2, R3, R4) */
export function formatPageNumber(
  format: PageNumberFormat,
  current: number,
  total: number,
): string {
  switch (format) {
    case "n":
      return String(current);
    case "n-of-total":
      return `${String(current)} / ${String(total)}`;
    case "page-n":
      return `Página ${String(current)}`;
  }
}

/** Calcula la línea base del texto según la posición. (R6–R10) */
export function computeTextPosition(
  position: PageNumberPosition,
  pageWidth: number,
  pageHeight: number,
  textWidth: number,
  fontSize: number,
  margin: number,
): TextPosition {
  const x = position.endsWith("left")
    ? margin
    : position.endsWith("right")
      ? pageWidth - margin - textWidth
      : (pageWidth - textWidth) / 2; // center (R9)
  const y = position.startsWith("bottom")
    ? margin // (R6)
    : pageHeight - margin - fontSize; // top (R7)
  return { x, y };
}

/** Opciones de la operación. */
export interface PageNumbersOptions {
  position: PageNumberPosition;
  format: PageNumberFormat;
  startNumber: number;
  fontSize: number;
}

/**
 * Dibuja un número en cada página de `input` y devuelve los bytes. (R11–R25)
 * - Lanza `InvalidPdfError` si los bytes no son un PDF cargable (R19) → sin
 *   salida (R20).
 * - Lanza `PageNumbersFailedError` si el PDF tiene 0 páginas (R21) o si
 *   `startNumber`/`fontSize` son inválidos (R22, R23).
 * - Emite progreso en [0,1], terminando en 1. (R16, R17)
 * Función pura respecto a React/DOM (usa pdf-lib, que es JS puro). (R24)
 */
export async function addPageNumbers(
  input: Uint8Array,
  options: PageNumbersOptions,
  onProgress?: ProgressCallback,
): Promise<Uint8Array> {
  onProgress?.(0);

  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(input);
  } catch {
    throw new InvalidPdfError("El archivo no es un PDF válido."); // (R19, R20)
  }

  const pageCount = doc.getPageCount();
  if (pageCount === 0) {
    throw new PageNumbersFailedError("El PDF no tiene páginas."); // (R21)
  }
  if (!Number.isInteger(options.startNumber) || options.startNumber < 0) {
    throw new PageNumbersFailedError("El número de inicio no es válido."); // (R22)
  }
  if (!Number.isFinite(options.fontSize) || options.fontSize <= 0) {
    throw new PageNumbersFailedError("El tamaño de fuente no es válido."); // (R23)
  }

  const font = await doc.embedFont(StandardFonts.Helvetica); // (R14)
  const last = options.startNumber + pageCount - 1; // total para "n-of-total"
  const pages = doc.getPages();

  for (let i = 0; i < pageCount; i++) {
    const page = pages[i];
    const current = options.startNumber + i; // (R12)
    const text = formatPageNumber(options.format, current, last);
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(text, options.fontSize); // (R15)
    const { x, y } = computeTextPosition(
      options.position,
      width,
      height,
      textWidth,
      options.fontSize,
      PAGE_NUMBER_MARGIN,
    );
    page.drawText(text, { x, y, size: options.fontSize, font }); // (R11, R15)
    onProgress?.((i + 1) / pageCount); // (R16, R17: último = 1)
  }

  return doc.save(); // (R13, R18)
}
