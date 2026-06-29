import * as pdfjs from "pdfjs-dist";
// El `?url` deja que Vite empaquete el worker de pdf.js como asset estático en
// un chunk separado; su contenido se carga desde la propia app (no son datos
// del usuario). (R39)
import PdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import type { ThumbnailRenderer } from "@/pdf/thumbnails";

// El parseo del PDF corre en el worker propio de pdf.js (no en el hilo
// principal). Se configura a nivel de módulo, una sola vez. (R39)
pdfjs.GlobalWorkerOptions.workerSrc = PdfjsWorkerUrl;

/** Escala de render de las miniaturas (suficiente para previsualizar). */
const THUMBNAIL_SCALE = 0.4;

/**
 * Abre `input` con pdf.js y devuelve un `ThumbnailRenderer`. Si el PDF no se
 * puede abrir, rechaza la promesa con un error y no produce ninguna miniatura.
 * Única pieza que toca `pdfjs-dist` y `<canvas>`. (R38, R40, R41, R42)
 */
export async function createPdfjsThumbnailRenderer(
  input: Uint8Array,
): Promise<ThumbnailRenderer> {
  // El parseo pesado corre en el worker de pdf.js; aquí solo esperamos su
  // promesa. Si falla, el `await` rechaza y no se produce miniatura. (R38, R42)
  const doc = await pdfjs.getDocument({ data: input }).promise;

  return {
    pageCount(): number {
      return doc.numPages;
    },

    async renderPage(index: number, signal: AbortSignal): Promise<string> {
      // pdf.js es 1-indexado.
      const page = await doc.getPage(index + 1);
      const viewport = page.getViewport({ scale: THUMBNAIL_SCALE });

      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const canvasContext = canvas.getContext("2d");
      if (!canvasContext) {
        throw new Error("No se pudo obtener el contexto 2D del canvas.");
      }

      const task = page.render({ canvasContext, viewport });

      // Cancelación: al abortar el signal, cancelar la RenderTask de pdf.js. (R41)
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

      // URL local (data URL): sin ninguna petición de red. (R40)
      return canvas.toDataURL();
    },

    destroy(): void {
      void doc.destroy();
    },
  };
}
