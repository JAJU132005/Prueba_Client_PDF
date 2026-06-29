import * as pdfjs from "pdfjs-dist";
// El `?url` deja que Vite empaquete el worker de pdf.js como asset estático en
// un chunk separado; su contenido se carga desde la propia app (no son datos
// del usuario). (R23, R24)
import PdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import { imageMimeType, type PageRasterizer } from "@/pdf/rasterize";
import { InvalidPdfError } from "@/pdf/types";

// El parseo del PDF corre en el worker propio de pdf.js (no en el hilo
// principal). Se configura a nivel de módulo, una sola vez. (R23)
pdfjs.GlobalWorkerOptions.workerSrc = PdfjsWorkerUrl;

/**
 * Abre `input` con pdf.js y devuelve un `PageRasterizer`. Si el PDF no se puede
 * abrir, rechaza con `InvalidPdfError` y no produce ninguna imagen. Única pieza
 * que toca `pdfjs-dist` y `<canvas>`. (R18, R19, R20, R21, R22, R23, R24)
 */
export async function createPdfjsPageRasterizer(
  input: Uint8Array,
): Promise<PageRasterizer> {
  let doc;
  try {
    // El parseo pesado corre en el worker de pdf.js. Si falla, lanza
    // InvalidPdfError y no se produce ninguna imagen. (R18, R19)
    doc = await pdfjs.getDocument({ data: input }).promise;
  } catch {
    throw new InvalidPdfError("El archivo no es un PDF válido.");
  }

  return {
    pageCount(): number {
      return doc.numPages;
    },

    async renderPage(index, options, signal): Promise<Blob> {
      // pdf.js es 1-indexado.
      const page = await doc.getPage(index + 1);
      const viewport = page.getViewport({ scale: options.scale });

      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const canvasContext = canvas.getContext("2d");
      if (!canvasContext) {
        throw new Error("No se pudo obtener el contexto 2D del canvas.");
      }

      const task = page.render({ canvasContext, viewport });

      // Cancelación: al abortar el signal, cancelar la RenderTask de pdf.js. (R22)
      const onAbort = (): void => {
        task.cancel();
      };
      if (signal.aborted) {
        task.cancel();
      } else {
        signal.addEventListener("abort", onAbort, { once: true });
      }

      try {
        await task.promise;
      } finally {
        signal.removeEventListener("abort", onAbort);
      }

      // Blob local desde el canvas (bytes en memoria); sin red. Si toBlob
      // devuelve null, rechaza en lugar de entregar un Blob vacío. (R20, R21, R24)
      const mime = imageMimeType(options.format);
      return await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) =>
            blob
              ? resolve(blob)
              : reject(new Error("No se pudo generar la imagen.")),
          mime,
          options.format === "jpeg" ? options.quality : undefined,
        );
      });
    },

    destroy(): void {
      void doc.destroy();
    },
  };
}
