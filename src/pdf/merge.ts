import { PDFDocument } from "pdf-lib";

import {
  InvalidPdfError,
  MergeFailedError,
  type ProgressCallback,
} from "@/pdf/types";

/**
 * Une `inputs` (PDFs en orden) en un único PDF y devuelve sus bytes.
 *
 * - Requiere >= 2 PDFs; en otro caso lanza `MergeFailedError`. (R8)
 * - Lanza `InvalidPdfError` si algún input no es un PDF cargable y, en ese caso,
 *   NO devuelve bytes (la excepción aborta antes de `save`). (R6, R7)
 * - Añade las páginas respetando el orden de la lista de entrada. (R3)
 * - Emite progreso en [0,1], terminando en 1. (R11–R13)
 *
 * Función pura: no importa React ni accede al DOM. (R5)
 */
export async function mergePdfs(
  inputs: readonly Uint8Array[],
  onProgress?: ProgressCallback,
): Promise<Uint8Array> {
  // Guarda de cardinalidad: la unión necesita al menos 2 PDFs. (R8)
  if (inputs.length < 2) {
    throw new MergeFailedError(
      "Se necesitan al menos 2 PDFs para unir.",
    );
  }

  const n = inputs.length;
  onProgress?.(0);

  const out = await PDFDocument.create();

  for (let i = 0; i < n; i++) {
    let doc: PDFDocument;
    try {
      // pdf-lib lanza si los bytes no son un PDF cargable. (R6)
      doc = await PDFDocument.load(inputs[i]);
    } catch {
      // Re-lanzamos como error de dominio nombrado. La excepción interrumpe el
      // flujo ANTES de `out.save()`, por lo que no se devuelve ningún byte. (R7)
      throw new InvalidPdfError(
        `El archivo en la posición ${String(i + 1)} no es un PDF válido.`,
      );
    }

    // Copia todas las páginas del documento en su orden original y las añade al
    // resultado. Recorrer `inputs` en orden garantiza el orden global. (R1–R4)
    const pages = await out.copyPages(doc, doc.getPageIndices());
    for (const page of pages) {
      out.addPage(page);
    }

    // Progreso tras procesar el archivo i (0-based) de n; el último es 1. (R12, R13)
    onProgress?.((i + 1) / n);
  }

  // pdf-lib devuelve Uint8Array. (R1)
  return out.save();
}
