import { PDFDocument, degrees } from "pdf-lib";

import {
  normalizeRotationAngle,
  resolveRotationPages,
  type RotateOptions,
} from "@/pdf/rotateOptions";
import {
  InvalidPdfError,
  RotateFailedError,
  type ProgressCallback,
} from "@/pdf/types";

/**
 * Rota las páginas indicadas por `options` y devuelve el PDF resultante. (R12)
 *
 * - `InvalidPdfError` si los bytes no son un PDF cargable (R18) → sin salida (R22).
 * - `RotateFailedError` si el PDF tiene 0 páginas (R19) → sin salida (R22).
 * - `InvalidRotationError` si el ángulo no es múltiplo de 90 (R20) → sin salida.
 * - `InvalidRangeError` si la selección por rango es inválida (R21) → sin salida.
 * - La rotación es acumulativa sobre la rotación previa de cada página (R16).
 * - Emite progreso en [0,1], terminando en 1. (R24–R26)
 *
 * Función pura: no importa React ni accede al DOM. (R23)
 */
export async function rotatePdf(
  input: Uint8Array,
  options: RotateOptions,
  onProgress?: ProgressCallback,
): Promise<Uint8Array> {
  onProgress?.(0);

  let doc: PDFDocument;
  try {
    // pdf-lib lanza si los bytes no son un PDF cargable. (R18)
    doc = await PDFDocument.load(input);
  } catch {
    // Re-lanzamos como error de dominio nombrado. La excepción interrumpe el
    // flujo ANTES de cualquier `save`, por lo que no hay salida. (R18, R22)
    throw new InvalidPdfError("El archivo no es un PDF válido.");
  }

  const pageCount = doc.getPageCount();
  // Guarda de documento vacío. (R19, R22)
  if (pageCount === 0) {
    throw new RotateFailedError("El PDF no tiene páginas que rotar.");
  }

  // Normaliza el ángulo; propaga `InvalidRotationError` sin capturar, abortando
  // antes de `save`. (R16, R20, R22)
  const delta = normalizeRotationAngle(options.angle);

  // Resuelve los índices 0-indexados; propaga `InvalidRangeError` sin capturar,
  // abortando antes de `save`. (R14, R21, R22)
  const indices = resolveRotationPages(options.pages, pageCount);

  indices.forEach((i, k) => {
    const page = doc.getPage(i);
    // Acumulativa: suma el delta sobre la rotación previa y renormaliza al
    // cuadrante para mantenerla en {0,90,180,270}. (R13, R15, R16)
    const prev = page.getRotation().angle;
    page.setRotation(degrees(normalizeRotationAngle(prev + delta)));
    onProgress?.((k + 1) / indices.length);
  });

  // Rotación completada con éxito. El documento se rota in situ: no se añaden ni
  // eliminan páginas, así que el conteo se preserva. (R17, R26)
  onProgress?.(1);

  // pdf-lib devuelve Uint8Array. (R12)
  return doc.save();
}
