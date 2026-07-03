/**
 * Orquestación PURA del OCR: recibe bitmaps de páginas ya rasterizadas y un
 * motor `OcrEngine` inyectable (costura mockeable, patrón
 * `PageRasterizer`/`PdfCryptoEngine`/`ImageRecompressor`). Produce siempre el
 * texto reconocido y, opcionalmente, un PDF con una capa de texto invisible
 * buscable (pdf-lib). Sin React ni DOM: el WASM real vive tras `OcrEngine`.
 * (R1–R19)
 */
import { PDFDocument, StandardFonts } from "pdf-lib";

import { OcrFailedError, type ProgressCallback } from "@/pdf/types";

/** Idiomas OCR soportados (códigos Tesseract). (R1) */
export type OcrLanguage = "spa" | "eng" | "fra" | "deu" | "por" | "ita";

/** Lista canónica de idiomas OCR; incluye al menos `spa` y `eng`. (R1) */
export const OCR_LANGUAGES: readonly OcrLanguage[] = [
  "spa",
  "eng",
  "fra",
  "deu",
  "por",
  "ita",
];

/** Etiquetas legibles por idioma. (R2) */
const OCR_LANGUAGE_LABELS: Record<OcrLanguage, string> = {
  spa: "Español",
  eng: "Inglés",
  fra: "Francés",
  deu: "Alemán",
  por: "Portugués",
  ita: "Italiano",
};

/** Etiqueta legible no vacía de un idioma soportado. (R2) */
export function ocrLanguageLabel(lang: OcrLanguage): string {
  return OCR_LANGUAGE_LABELS[lang];
}

/** Separador estable entre el texto de páginas consecutivas. (R5) */
export const OCR_PAGE_SEPARATOR = "\f";

/** Opacidad de la capa de texto buscable (invisible pero seleccionable). (R16) */
export const INVISIBLE_TEXT_OPACITY = 0;

/** Tamaño de fuente por defecto de la capa invisible (pt). */
const INVISIBLE_TEXT_SIZE = 12;

/** Bitmap de una página listo para OCR (bytes de imagen PNG/JPEG). */
export interface OcrImageInput {
  bytes: Uint8Array;
  /** "image/png" | "image/jpeg" */
  mimeType: string;
}

/** Palabra reconocida con su caja (píxeles del bitmap, sistema top-left). */
export interface OcrWord {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Resultado del reconocimiento de una página. */
export interface OcrPageRecognition {
  text: string;
  words: readonly OcrWord[];
}

/**
 * Costura del motor OCR (mockeable). El motor concreto real
 * (`tesseractOcrEngine`) se inyecta por defecto en `createPdfWorkerApi`; los
 * tests inyectan un motor falso determinista.
 */
export interface OcrEngine {
  recognize(
    image: OcrImageInput,
    language: string,
    onProgress?: ProgressCallback,
  ): Promise<OcrPageRecognition>;
  terminate(): Promise<void>;
}

/** Modo de salida elegible por el usuario. */
export type OcrOutput = "text" | "searchable-pdf" | "both";

export interface OcrOptions {
  language: OcrLanguage;
  output: OcrOutput;
}

export interface OcrResult {
  text: string;
  /** Presente solo si output es "searchable-pdf" | "both". (R12, R13) */
  pdfBytes?: Uint8Array;
}

/** Operación de dibujo de una palabra invisible (sistema PDF, bottom-left). */
export interface InvisibleTextOp {
  text: string;
  x: number;
  y: number;
  size: number;
}

/**
 * Dispone una operación por palabra, volteando la coordenada vertical al
 * sistema bottom-left de PDF (`y = pageHeight - word.y1`). Pura, sin pdf-lib.
 * (R14, R15)
 */
export function layoutInvisibleText(
  words: readonly OcrWord[],
  pageHeight: number,
): InvisibleTextOp[] {
  return words.map((word) => ({
    text: word.text,
    x: word.x0,
    y: pageHeight - word.y1,
    size: INVISIBLE_TEXT_SIZE,
  }));
}

/** Página para el PDF buscable: imagen de fondo + palabras reconocidas. */
export interface SearchablePage {
  image: OcrImageInput;
  words: readonly OcrWord[];
}

/** Incrusta la imagen de una página según su tipo MIME y devuelve dims en px. */
async function embedPageImage(
  pdf: PDFDocument,
  image: OcrImageInput,
): Promise<{ embedded: Awaited<ReturnType<PDFDocument["embedPng"]>>; width: number; height: number }> {
  const embedded =
    image.mimeType === "image/jpeg"
      ? await pdf.embedJpg(image.bytes)
      : await pdf.embedPng(image.bytes);
  return { embedded, width: embedded.width, height: embedded.height };
}

/**
 * Construye un PDF: una página por entrada, con la imagen rasterizada incrustada
 * como fondo (tamaño de página = tamaño en px de la imagen) y el texto invisible
 * (`opacity = INVISIBLE_TEXT_OPACITY`) posicionado por `layoutInvisibleText`.
 * (R13, R16, R17, R18)
 */
export async function buildSearchablePdf(
  pages: readonly SearchablePage[],
  onProgress?: ProgressCallback,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  for (let i = 0; i < pages.length; i++) {
    const { image, words } = pages[i];
    const { embedded, width, height } = await embedPageImage(pdf, image);
    // Tamaño de página = tamaño en px de la imagen incrustada. (R17)
    const page = pdf.addPage([width, height]);
    page.drawImage(embedded, { x: 0, y: 0, width, height });

    // Texto invisible (opacidad 0) por palabra, posición por bounding box. (R18)
    for (const op of layoutInvisibleText(words, height)) {
      if (op.text.length === 0) continue;
      page.drawText(op.text, {
        x: op.x,
        y: op.y,
        size: op.size,
        font,
        opacity: INVISIBLE_TEXT_OPACITY,
      });
    }
    onProgress?.((i + 1) / pages.length);
  }

  return pdf.save();
}

/**
 * Orquesta el OCR de una lista de bitmaps con `engine`:
 * - `pages` vacío → `OcrFailedError` sin tocar el motor (R7).
 * - `options.language` ∉ `OCR_LANGUAGES` → `OcrFailedError` antes de invocar el
 *   motor (R8).
 * - `engine.recognize` una vez por página, en orden, con `options.language`
 *   (R3, R4); concatena el texto con `OCR_PAGE_SEPARATOR` (R5, R6).
 * - Progreso real global en `[0,1]` terminando en 1: `global =
 *   (completadas + fracciónPáginaActual) / total` (R9, R10, R11).
 * - Si `output` requiere PDF, ensambla con `buildSearchablePdf` (R12, R13).
 * Pura respecto a React/DOM; el WASM vive tras `OcrEngine`. (R19)
 */
export async function ocrImages(
  pages: readonly OcrImageInput[],
  engine: OcrEngine,
  options: OcrOptions,
  onProgress?: ProgressCallback,
): Promise<OcrResult> {
  if (pages.length === 0) {
    throw new OcrFailedError("No hay páginas para reconocer.");
  }
  if (!OCR_LANGUAGES.includes(options.language)) {
    throw new OcrFailedError("El idioma solicitado no es compatible.");
  }

  const total = pages.length;
  const texts: string[] = [];
  const recognitions: OcrPageRecognition[] = [];

  for (let i = 0; i < total; i++) {
    const recognition = await engine.recognize(
      pages[i],
      options.language,
      // Progreso real por página → progreso global. (R11)
      (fraction) => {
        const clamped = fraction < 0 ? 0 : fraction > 1 ? 1 : fraction;
        onProgress?.((i + clamped) / total);
      },
    );
    recognitions.push(recognition);
    texts.push(recognition.text);
    // Garantiza un progreso monótono al cerrar cada página. (R9)
    onProgress?.((i + 1) / total);
  }

  const text = texts.join(OCR_PAGE_SEPARATOR);

  const wantsPdf =
    options.output === "searchable-pdf" || options.output === "both";
  if (!wantsPdf) {
    // Último valor exactamente 1. (R10, R12)
    onProgress?.(1);
    return { text };
  }

  const searchablePages: SearchablePage[] = pages.map((image, i) => ({
    image,
    words: recognitions[i].words,
  }));
  const pdfBytes = await buildSearchablePdf(searchablePages);
  // Último valor exactamente 1. (R10, R13)
  onProgress?.(1);
  return { text, pdfBytes };
}
