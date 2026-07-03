import * as pdfjs from "pdfjs-dist";
// El `?url` deja que Vite empaquete el worker de pdf.js como asset estático en
// un chunk separado; su contenido se carga desde la propia app (no son datos
// del usuario). Mismo import que los renderers existentes. (R7, R8)
import PdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import { InvalidPdfError } from "@/pdf/types";

// El parseo del PDF corre en el worker propio de pdf.js (no en el hilo
// principal). Se configura a nivel de módulo, una sola vez. (R7)
pdfjs.GlobalWorkerOptions.workerSrc = PdfjsWorkerUrl;

/** Documento mínimo que necesita el conteo (subconjunto de pdf.js). */
interface PdfCountDocument {
  numPages: number;
  destroy(): void | Promise<void>;
}

/**
 * Cargador inyectable (default = `pdfjs.getDocument`) para poder testear sin
 * pdf.js real en jsdom.
 */
export type PdfDocumentLoader = (
  input: Uint8Array,
) => { promise: Promise<PdfCountDocument> };

const defaultLoad: PdfDocumentLoader = (input) =>
  pdfjs.getDocument({ data: input });

/**
 * Cuenta las páginas abriendo el PDF con pdf.js y leyendo `numPages`. No
 * solicita el render (`getPage`/`render`) de ninguna página. (R6)
 * - Clona los bytes (`input.slice()`) para no "detachar" el buffer del
 *   llamante (misma defensa que `pdfjsThumbnailRenderer`, causa del bug #16).
 * - El parseo corre en el worker de pdf.js; el hilo principal solo `await`. (R7)
 * - Solo opera sobre bytes en memoria; ninguna petición de red con datos del
 *   usuario. (R8)
 * - Honra el `signal` de forma temprana (antes del parseo y tras él) para no
 *   malgastar trabajo en un conteo ya abortado; la capa pura `countPdfPages`
 *   traduce ese lanzamiento a estado `"cancelled"` al ver el signal abortado. (R13)
 * - Lanza `InvalidPdfError` si el loader rechaza (cifrado/corrupto). (R9)
 * - Libera el documento con `destroy()` en `finally`, tanto en éxito como tras
 *   fallar al leer `numPages`. (R16)
 */
export async function pdfjsPageCount(
  input: Uint8Array,
  signal?: AbortSignal,
  load: PdfDocumentLoader = defaultLoad,
): Promise<number> {
  // Cancelación temprana: si ya está abortado, no malgastamos el parseo. (R13)
  signal?.throwIfAborted();

  // Copia defensiva: evita que pdf.js detache el ArrayBuffer del llamante.
  const data = input.slice();

  let doc: PdfCountDocument;
  try {
    // El parseo pesado corre en el worker de pdf.js. Si falla (cifrado o
    // corrupto), se traduce al error de dominio existente. (R7, R9)
    doc = await load(data).promise;
  } catch {
    throw new InvalidPdfError("El archivo no es un PDF válido.");
  }

  try {
    // Si se abortó durante el parseo, descartamos el conteo sin leer
    // `numPages`; el documento se libera igualmente en el `finally`. (R13, R16)
    signal?.throwIfAborted();
    // Conteo derivado únicamente de `numPages`, sin rasterizar. (R6)
    return doc.numPages;
  } finally {
    // Libera el documento siempre. (R16)
    void doc.destroy();
  }
}
