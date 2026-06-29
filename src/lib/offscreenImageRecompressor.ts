import type { ImageRecompressor } from "@/pdf/compressPdf";

/**
 * Recomprime bytes de imagen a JPEG con canvas. Decodifica con
 * `createImageBitmap`, redibuja en un `OffscreenCanvas` y re-codifica con
 * `convertToBlob({ type, quality })`. Solo se invoca dentro del Worker (donde
 * existe `OffscreenCanvas`); no se cubre en jsdom, igual que
 * `pdfjsPageRasterizer`. (R19)
 */
export const offscreenImageRecompressor: ImageRecompressor = async (
  bytes,
  mimeType,
  quality,
) => {
  const blob = new Blob([bytes as BlobPart], { type: mimeType });
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("No se pudo obtener el contexto 2D del canvas.");
    }
    context.drawImage(bitmap, 0, 0);
    const blob = await canvas.convertToBlob({ type: mimeType, quality });
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    bitmap.close();
  }
};
