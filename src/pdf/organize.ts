import { PDFDocument } from "pdf-lib";

import {
  InvalidPageOrderError,
  InvalidPdfError,
  OrganizeFailedError,
  type ProgressCallback,
} from "@/pdf/types";

/**
 * Reescribe `input` conservando solo las páginas de `pageOrder`, en ese orden
 * exacto, y devuelve los bytes resultantes. (R11, R12, R13)
 *
 * - `InvalidPdfError` si los bytes no son un PDF cargable (R14) → sin salida (R18).
 * - `OrganizeFailedError` si el PDF tiene 0 páginas (R15) o `pageOrder` está
 *   vacío (R16) → sin salida (R18).
 * - `InvalidPageOrderError` si algún índice está fuera de rango o no es entero
 *   (R17) → sin salida (R18).
 * - Emite progreso en [0,1], terminando en 1. (R19–R21)
 *
 * Función pura: no importa React, no toca el DOM, no importa pdfjs. (R22)
 */
export async function organizePdf(
  input: Uint8Array,
  pageOrder: readonly number[],
  onProgress?: ProgressCallback,
): Promise<Uint8Array> {
  onProgress?.(0);

  let src: PDFDocument;
  try {
    // pdf-lib lanza si los bytes no son un PDF cargable. (R14)
    src = await PDFDocument.load(input);
  } catch {
    // Re-lanzamos como error de dominio nombrado, ANTES de cualquier `save`, de
    // modo que no se devuelven bytes. (R14, R18)
    throw new InvalidPdfError("El archivo no es un PDF válido.");
  }

  const pageCount = src.getPageCount();
  // Guarda de documento vacío. (R15, R18)
  if (pageCount === 0) {
    throw new OrganizeFailedError("El PDF no tiene páginas que organizar.");
  }

  // Guarda de orden vacío: todas las páginas marcadas para eliminar. (R16, R18)
  if (pageOrder.length === 0) {
    throw new OrganizeFailedError(
      "No se pueden eliminar todas las páginas.",
    );
  }

  // Validación de índices: cada índice debe ser un entero dentro del rango del
  // documento de entrada. (R17, R18)
  if (
    pageOrder.some(
      (i) => !Number.isInteger(i) || i < 0 || i >= pageCount,
    )
  ) {
    throw new InvalidPageOrderError("El orden de páginas no es válido.");
  }

  // Copia en el orden exacto de `pageOrder`; las páginas omitidas no se copian
  // (quedan eliminadas). (R12)
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, [...pageOrder]);
  copied.forEach((page, k) => {
    out.addPage(page);
    // Un valor de progreso por página, en [0,1]. (R19, R20)
    onProgress?.((k + 1) / copied.length);
  });

  // Última emisión de progreso al finalizar con éxito. (R21)
  onProgress?.(1);

  // pdf-lib devuelve Uint8Array. El conteo coincide con pageOrder.length. (R11, R13)
  return out.save();
}
