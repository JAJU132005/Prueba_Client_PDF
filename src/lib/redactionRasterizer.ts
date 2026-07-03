/**
 * Adaptador DOM (hilo principal) que produce el bitmap YA REDACTADO de una
 * página: rasteriza con el `PageRasterizer` existente (pdf.js, precedente #9/#26)
 * y pinta cada caja como relleno SÓLIDO OPACO sobre el `<canvas>` ANTES de
 * `toBlob`, borrando los píxeles subyacentes. Pintar sobre el bitmap antes de
 * incrustar es lo que hace la redacción segura (no un rect en pdf-lib). (R5, R2)
 */

import {
  normalizedBoxToPixels,
  type NormalizedBox,
  type RedactedPageImage,
} from "@/pdf/redact";
import type { PageRasterizer, RasterizeOptions } from "@/pdf/rasterize";

/** Color de relleno opaco de las cajas de redacción (negro sólido). */
export const REDACTION_FILL_STYLE = "#000000";

/** Decodifica un Blob de imagen a un `HTMLImageElement` cargado. */
async function decodeBlob(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => {
        resolve();
      };
      img.onerror = () => {
        reject(new Error("No se pudo decodificar el bitmap de la página."));
      };
      img.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Rasteriza la página `pageIndex`, pinta `boxes` opacas sobre el bitmap y
 * devuelve la imagen resultante como `RedactedPageImage` (PNG). Reutiliza
 * `rasterizer.renderPage`. (R5)
 */
export async function rasterizeRedactedPage(
  rasterizer: PageRasterizer,
  pageIndex: number,
  boxes: readonly NormalizedBox[],
  options: RasterizeOptions,
  signal: AbortSignal,
): Promise<RedactedPageImage> {
  const blob = await rasterizer.renderPage(pageIndex, options, signal);
  const img = await decodeBlob(blob);

  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("No se pudo obtener el contexto 2D del canvas.");
  }

  // Fondo: la página rasterizada.
  ctx.drawImage(img, 0, 0, width, height);

  // Cajas: relleno SÓLIDO OPACO (opacidad 1) que borra los píxeles debajo. (R5, R2)
  ctx.globalAlpha = 1;
  ctx.fillStyle = REDACTION_FILL_STYLE;
  for (const box of boxes) {
    const rect = normalizedBoxToPixels(box, width, height);
    ctx.fillRect(rect.left, rect.top, rect.width, rect.height);
  }

  const outBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) =>
        b ? resolve(b) : reject(new Error("No se pudo generar la imagen.")),
      "image/png",
    );
  });
  const bytes = new Uint8Array(await outBlob.arrayBuffer());
  return { pageIndex, bytes, mimeType: "image/png" };
}
