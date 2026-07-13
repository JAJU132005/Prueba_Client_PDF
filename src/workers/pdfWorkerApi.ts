import { cantooPdfCryptoEngine } from "@/lib/cantooPdfCryptoEngine";
import { offscreenImageRecompressor } from "@/lib/offscreenImageRecompressor";
import { tesseractOcrEngine } from "@/lib/tesseractOcrEngine";
import { flattenAnnotations } from "@/pdf/annotate";
import { compressPdf, type ImageRecompressor } from "@/pdf/compressPdf";
import { detectFormFields, fillForms } from "@/pdf/fillForms";
import { imagesToPdf } from "@/pdf/imagesToPdf";
import { mergePdfs } from "@/pdf/merge";
import { ocrImages, type OcrEngine } from "@/pdf/ocrPdf";
import { organizePdf } from "@/pdf/organize";
import { addPageNumbers } from "@/pdf/pageNumbers";
import { probe } from "@/pdf/probe";
import { protectPdf, type PdfCryptoEngine } from "@/pdf/protectPdf";
import { redactPdf } from "@/pdf/redact";
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
  cryptoEngine: PdfCryptoEngine = cantooPdfCryptoEngine,
  ocrEngine: OcrEngine = tesseractOcrEngine,
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
    async protect(input, options, onProgress) {
      return protectPdf(input, options, cryptoEngine, onProgress);
    },
    async annotate(input, annotations, onProgress) {
      return flattenAnnotations(input, annotations, onProgress);
    },
    async detectForm(input) {
      return detectFormFields(input);
    },
    async fillForms(input, options, onProgress) {
      return fillForms(input, options, onProgress);
    },
    async ocr(pages, options, onProgress) {
      return ocrImages(pages, ocrEngine, options, onProgress);
    },
    async redact(input, redactedPages, onProgress) {
      return redactPdf(input, redactedPages, onProgress);
    },
  };
}
