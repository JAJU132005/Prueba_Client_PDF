import { PDFDocument } from "pdf-lib";

import { parsePageRanges } from "@/pdf/splitRanges";
import {
  InvalidPdfError,
  SplitFailedError,
  type ProgressCallback,
} from "@/pdf/types";

/**
 * Extrae de `input` las páginas indicadas por `rangeSpec` (p. ej. "1-3,5") y
 * devuelve un único PDF con esas páginas en el orden resuelto. (R14, R16)
 *
 * - `InvalidPdfError` si los bytes no son un PDF cargable (R18) → sin salida (R20).
 * - `SplitFailedError` si el PDF tiene 0 páginas (R19) → sin salida (R20).
 * - `InvalidRangeError` (propagado de `parsePageRanges`) si el rango es inválido
 *   (R20) → sin salida.
 * - Emite progreso en [0,1], terminando en 1. (R22–R24)
 *
 * Función pura: no importa React ni accede al DOM. (R21)
 */
export async function splitPdf(
  input: Uint8Array,
  rangeSpec: string,
  onProgress?: ProgressCallback,
): Promise<Uint8Array> {
  onProgress?.(0);

  let src: PDFDocument;
  try {
    // pdf-lib lanza si los bytes no son un PDF cargable. (R18)
    src = await PDFDocument.load(input);
  } catch {
    // Re-lanzamos como error de dominio nombrado. La excepción interrumpe el
    // flujo ANTES de cualquier `save`, por lo que no hay salida. (R18, R20)
    throw new InvalidPdfError("El archivo no es un PDF válido.");
  }

  const pageCount = src.getPageCount();
  // Guarda de documento vacío. (R19, R20)
  if (pageCount === 0) {
    throw new SplitFailedError("El PDF no tiene páginas que extraer.");
  }

  // Resuelve los índices 0-indexados; propaga `InvalidRangeError` sin capturar,
  // abortando antes de `save`. (R16, R20)
  const indices = parsePageRanges(rangeSpec, pageCount);

  const out = await PDFDocument.create();
  // `copyPages` respeta el orden del arreglo `indices`, garantizando el orden
  // resuelto y un conteo igual a `indices.length`. (R15, R16, R17)
  const pages = await out.copyPages(src, indices);
  for (const page of pages) {
    out.addPage(page);
  }

  // Extracción completada con éxito. (R22, R23, R24)
  onProgress?.(1);

  // pdf-lib devuelve Uint8Array. (R14)
  return out.save();
}
