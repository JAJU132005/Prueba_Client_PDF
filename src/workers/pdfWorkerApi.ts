import { offscreenImageRecompressor } from "@/lib/offscreenImageRecompressor";
import { compressPdf, type ImageRecompressor } from "@/pdf/compressPdf";
import { imagesToPdf } from "@/pdf/imagesToPdf";
import { mergePdfs } from "@/pdf/merge";
import { organizePdf } from "@/pdf/organize";
import { addPageNumbers } from "@/pdf/pageNumbers";
import { probe } from "@/pdf/probe";
import { rotatePdf } from "@/pdf/rotate";
import { splitPdf } from "@/pdf/split";
import { addWatermark } from "@/pdf/watermark";
import type { PdfWorkerApi } from "@/workers/contract";

/**
 * Implementa el contrato delegando en el dominio. Pura (sin `Comlink.expose`):
 * testeable en jsdom sin instanciar un worker real. El recompresor de imágenes
 * (canvas) se inyecta para poder testear `compress` sin tocar `OffscreenCanvas`.
 */
export function createPdfWorkerApi(
  recompress: ImageRecompressor = offscreenImageRecompressor,
): PdfWorkerApi {
  return {
    async probe(input, onProgress) {
      return probe(input, onProgress);
    },
    async merge(inputs, onProgress) {
      return mergePdfs(inputs, onProgress);
    },
    async split(input, rangeSpec, onProgress) {
      return splitPdf(input, rangeSpec, onProgress);
    },
    async rotate(input, options, onProgress) {
      return rotatePdf(input, options, onProgress);
    },
    async organize(input, pageOrder, onProgress) {
      return organizePdf(input, pageOrder, onProgress);
    },
    async imagesToPdf(images, options, onProgress) {
      return imagesToPdf(images, options, onProgress);
    },
    async addPageNumbers(input, options, onProgress) {
      return addPageNumbers(input, options, onProgress);
    },
    async addWatermark(input, options, onProgress) {
      return addWatermark(input, options, onProgress);
    },
    async compress(input, options, onProgress) {
      return compressPdf(input, options, recompress, onProgress);
    },
  };
}
