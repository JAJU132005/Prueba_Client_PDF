/**
 * Genera la object URL de la miniatura de la PRIMERA página de un PDF,
 * reutilizando el `PageRasterizer` de pdf.js inyectado (misma costura que el
 * visor de PDF, #18). Rasteriza SOLO el índice 0, es cancelable vía
 * `AbortSignal` y no hace red. (R14, R17, R19, R20)
 */

import type { PageRasterizerFactory } from "@/pdf/rasterize";

/** Escala de render de la miniatura de la página 1 (pequeña, suficiente). */
export const PDF_THUMBNAIL_SCALE = 0.5;

/**
 * Crea la object URL de la miniatura de la primera página de `bytes`.
 * Reutiliza `createRasterizer` (por defecto pdf.js en el consumidor) y
 * rasteriza SOLO el índice `0`. Cancelable vía `signal` (se propaga a
 * `renderPage`, que cancela la `RenderTask` de pdf.js al abortar). Libera el
 * rasterizador en `finally`. Sin red. Cualquier fallo (PDF inválido, render
 * abortado) se propaga al consumidor, que lo marca "unavailable". (R14, R17,
 * R19, R20)
 */
export async function renderPdfThumbnailUrl(
  bytes: Uint8Array,
  createRasterizer: PageRasterizerFactory,
  signal: AbortSignal,
): Promise<string> {
  const rasterizer = await createRasterizer(bytes);
  try {
    // Solo la página de índice 0; ninguna otra se rasteriza. (R14)
    const blob = await rasterizer.renderPage(
      0,
      { format: "png", scale: PDF_THUMBNAIL_SCALE },
      signal,
    );
    // Object URL local desde el Blob en memoria; sin red. (R19)
    return URL.createObjectURL(blob);
  } finally {
    rasterizer.destroy();
  }
}
