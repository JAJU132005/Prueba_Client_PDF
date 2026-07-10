import * as pdfjs from "pdfjs-dist";
// El `?url` deja que Vite empaquete el worker de pdf.js como asset estático en
// un chunk separado; su contenido se carga desde la propia app (no son datos
// del usuario). El parseo/extracción corre en ese worker, no en el hilo
// principal. (R10)
import PdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import {
  type PageTextGeometry,
  type TextItemGeometry,
} from "@/pdf/redactSearch";
import { InvalidPdfError } from "@/pdf/types";

// El parseo del PDF corre en el worker propio de pdf.js (no en el hilo
// principal). Se configura a nivel de módulo, una sola vez (mismo patrón que
// `pdfjsPageRasterizer.ts`/`pdfjsPageCounter.ts`). (R10)
pdfjs.GlobalWorkerOptions.workerSrc = PdfjsWorkerUrl;

/** Factoría inyectable de extracción de geometría de texto (tests). */
export type TextGeometryExtractor = (
  input: Uint8Array,
) => Promise<PageTextGeometry[]>;

/** Ítem de texto de pdf.js del que dependemos (subconjunto de `TextItem`). */
interface PdfTextItemLike {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

/** Página mínima que necesita la extracción (subconjunto de pdf.js). */
interface PdfTextPage {
  getViewport(options: { scale: number }): { width: number; height: number };
  getTextContent(): Promise<{ items: readonly unknown[] }>;
}

/** Documento mínimo que necesita la extracción (subconjunto de pdf.js). */
interface PdfTextDocument {
  numPages: number;
  getPage(index: number): Promise<PdfTextPage>;
  destroy(): void | Promise<void>;
}

/**
 * Cargador inyectable (default = `pdfjs.getDocument`) para poder testear sin el
 * worker real de pdf.js en jsdom (mismo seam que `pdfjsPageCounter`).
 */
export type PdfDocumentLoader = (
  input: Uint8Array,
) => { promise: Promise<PdfTextDocument> };

const defaultLoad: PdfDocumentLoader = (input) =>
  pdfjs.getDocument({ data: input }) as unknown as {
    promise: Promise<PdfTextDocument>;
  };

/** `true` si `item` es un `TextItem` con la geometría que necesitamos. */
function isTextItem(item: unknown): item is PdfTextItemLike {
  return (
    typeof item === "object" &&
    item !== null &&
    "str" in item &&
    "transform" in item &&
    "width" in item &&
    "height" in item
  );
}

/**
 * Abre `input` con pdf.js sobre bytes en memoria (sin red) y devuelve, por
 * página, la geometría de sus ítems de texto (`getTextContent` +
 * `getViewport({ scale: 1 })`). Si el PDF no se puede abrir, rechaza con
 * `InvalidPdfError` y no produce ninguna geometría. Única pieza de #33 que toca
 * `pdfjs-dist`. (R10, R11)
 *
 * - Clona los bytes (`input.slice()`) para no detachar el buffer del llamante
 *   (misma defensa que `pdfjsPageCounter`).
 * - Libera el documento con `destroy()` en `finally`.
 */
export async function extractPageTextGeometry(
  input: Uint8Array,
  load: PdfDocumentLoader = defaultLoad,
): Promise<PageTextGeometry[]> {
  const data = input.slice();

  let doc: PdfTextDocument;
  try {
    doc = await load(data).promise;
  } catch {
    throw new InvalidPdfError("El archivo no es un PDF válido."); // (R11)
  }

  try {
    const pages: PageTextGeometry[] = [];
    for (let i = 0; i < doc.numPages; i++) {
      const page = await doc.getPage(i + 1); // pdf.js es 1-indexado.
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();

      const items: TextItemGeometry[] = [];
      for (const item of content.items) {
        if (!isTextItem(item)) {
          continue; // TextMarkedContent u otros: sin geometría de glifo.
        }
        items.push({
          str: item.str,
          xPts: item.transform[4],
          yPts: item.transform[5],
          widthPts: item.width,
          heightPts: item.height,
        });
      }

      pages.push({
        pageIndex: i,
        pageWidthPts: viewport.width,
        pageHeightPts: viewport.height,
        items,
      });
    }
    return pages;
  } finally {
    void doc.destroy();
  }
}
