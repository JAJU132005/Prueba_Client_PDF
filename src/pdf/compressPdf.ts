import {
  PDFArray,
  PDFBool,
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFRef,
} from "pdf-lib";

import {
  CompressFailedError,
  InvalidPdfError,
  type ProgressCallback,
} from "@/pdf/types";

/** Niveles de calidad (calidad creciente). (R1) */
export type CompressionLevel = "low" | "medium" | "high";

/** Lista canónica de niveles, en orden de calidad creciente. (R1) */
export const COMPRESSION_LEVELS: readonly CompressionLevel[] = [
  "low",
  "medium",
  "high",
];

/** Calidad JPEG de canvas por nivel, en (0,1], estrictamente creciente. (R2, R3) */
const LEVEL_QUALITIES: Record<CompressionLevel, number> = {
  low: 0.4,
  medium: 0.6,
  high: 0.8,
};

/** Calidad JPEG de canvas por nivel, en (0,1], creciente. (R2, R3) */
export function qualityForLevel(level: CompressionLevel): number {
  return LEVEL_QUALITIES[level];
}

/** Opciones de la operación. */
export interface CompressOptions {
  level: CompressionLevel;
}

/**
 * Costura inyectable que recomprime bytes de imagen a JPEG. La implementación
 * concreta (OffscreenCanvas) vive en @/lib/offscreenImageRecompressor. (R18, R19)
 */
export type ImageRecompressor = (
  bytes: Uint8Array,
  mimeType: string,
  quality: number,
) => Promise<Uint8Array>;

/** Metadatos de un XObject de imagen. (R5) */
export interface ImageXObjectInfo {
  ref: PDFRef;
  width: number;
  height: number;
  filter: string | null;
  /**
   * Espacio de color resuelto, p. ej. "DeviceRGB" | "DeviceGray" | "DeviceCMYK"
   * | "Indexed" | "ICCBased" | null. (R5, R6, R7)
   */
  colorSpace: string | null;
  hasSMask: boolean;
  byteLength: number;
  recompressible: boolean;
}

/**
 * Predicado puro: recomprimible solo si es JPEG `DCTDecode` en `DeviceRGB` (3
 * componentes), sin `SMask`, y sin actuar como máscara ni invertir color
 * (`isSMask`, `/Decode`, `/Mask`, `ImageMask`). Cualquier otro espacio de color
 * (DeviceGray, CMYK, Indexed, ICCBased no-RGB) o filtro queda excluido, porque el
 * recompresor canvas siempre emite JPEG RGB de 3 componentes y reescribirlos
 * corrompería el color o la transparencia. (R6, R7)
 */
export function isRecompressibleImage(meta: {
  filter: string | null;
  colorSpace: string | null;
  hasSMask: boolean;
  isSMask?: boolean;
  hasDecode?: boolean;
  hasMask?: boolean;
  isImageMask?: boolean;
}): boolean {
  return (
    meta.filter === "DCTDecode" &&
    meta.colorSpace === "DeviceRGB" &&
    !meta.hasSMask &&
    !meta.isSMask &&
    !meta.hasDecode &&
    !meta.hasMask &&
    !meta.isImageMask
  );
}

/** Nombre (sin la barra inicial) de un espacio de color, sea PDFName o PDFArray. */
function resolveColorSpaceName(value: unknown): string | null {
  if (value instanceof PDFName) {
    return value.asString().replace(/^\//, "");
  }
  if (value instanceof PDFArray) {
    const first = value.size() > 0 ? value.get(0) : undefined;
    if (first instanceof PDFName) {
      return first.asString().replace(/^\//, "");
    }
  }
  return null;
}

/** Nombre (sin la barra inicial) de un PDFName, o null. */
function resolveName(value: unknown): string | null {
  return value instanceof PDFName ? value.asString().replace(/^\//, "") : null;
}

const SUBTYPE = PDFName.of("Subtype");
const WIDTH = PDFName.of("Width");
const HEIGHT = PDFName.of("Height");
const FILTER = PDFName.of("Filter");
const COLOR_SPACE = PDFName.of("ColorSpace");
const SMASK = PDFName.of("SMask");
const DECODE = PDFName.of("Decode");
const MASK = PDFName.of("Mask");
const IMAGE_MASK = PDFName.of("ImageMask");
const LENGTH = PDFName.of("Length");
const DCT_DECODE = PDFName.of("DCTDecode");
const DEVICE_RGB = PDFName.of("DeviceRGB");

function asNumber(value: unknown): number {
  // PDFNumber expone su valor numérico vía asNumber().
  return value !== undefined &&
    value !== null &&
    typeof (value as { asNumber?: () => number }).asNumber === "function"
    ? (value as { asNumber: () => number }).asNumber()
    : 0;
}

/** Enumera los XObjects de imagen del documento (pdf-lib, sin canvas). (R4, R5) */
export function extractImageXObjects(doc: PDFDocument): ImageXObjectInfo[] {
  const entries = doc.context.enumerateIndirectObjects();

  // Primer recorrido: refs usadas como SMask por otra imagen (no recomprimibles).
  const smaskRefTags = new Set<string>();
  for (const [, object] of entries) {
    if (object instanceof PDFRawStream) {
      const smask = object.dict.get(SMASK);
      if (smask instanceof PDFRef) {
        smaskRefTags.add(smask.tag);
      }
    }
  }

  const images: ImageXObjectInfo[] = [];
  for (const [ref, object] of entries) {
    if (!(object instanceof PDFRawStream)) {
      continue;
    }
    const dict = object.dict;
    const subtype = resolveName(dict.get(SUBTYPE));
    if (subtype !== "Image") {
      continue;
    }

    const filter = resolveName(dict.get(FILTER));
    const colorSpace = resolveColorSpaceName(dict.get(COLOR_SPACE));
    const hasSMask = dict.get(SMASK) !== undefined;
    const isSMask = smaskRefTags.has(ref.tag);
    const hasDecode = dict.get(DECODE) !== undefined;
    const hasMask = dict.get(MASK) !== undefined;
    const imageMaskValue = dict.get(IMAGE_MASK);
    const isImageMask =
      imageMaskValue instanceof PDFBool && imageMaskValue.asBoolean();

    images.push({
      ref,
      width: asNumber(dict.get(WIDTH)),
      height: asNumber(dict.get(HEIGHT)),
      filter,
      colorSpace,
      hasSMask,
      byteLength: object.contents.length,
      recompressible: isRecompressibleImage({
        filter,
        colorSpace,
        hasSMask,
        isSMask,
        hasDecode,
        hasMask,
        isImageMask,
      }),
    });
  }

  return images;
}

/** Reporte honesto de la compresión. (R12, R13) */
export interface CompressionReport {
  originalSize: number;
  compressedSize: number;
  totalImages: number;
  recompressibleImages: number;
  recompressedImages: number;
  minimalReduction: boolean;
}

export interface CompressPdfResult {
  bytes: Uint8Array;
  report: CompressionReport;
}

function isValidLevel(level: string): level is CompressionLevel {
  return (COMPRESSION_LEVELS as readonly string[]).includes(level);
}

/**
 * Recomprime las imágenes recomprimibles de `input` reasignando cada flujo
 * recomprimido (si es más pequeño) a su misma ref, y devuelve el PDF + reporte.
 * - Lanza InvalidPdfError si los bytes no son un PDF cargable. (R15)
 * - Lanza CompressFailedError si options.level no es válido. (R16)
 * - Emite progreso en [0,1], terminando en 1. (R17, R17b)
 * Función pura respecto a React/DOM; el acceso a canvas es vía `recompress`. (R18)
 */
export async function compressPdf(
  input: Uint8Array,
  options: CompressOptions,
  recompress: ImageRecompressor,
  onProgress?: ProgressCallback,
): Promise<CompressPdfResult> {
  onProgress?.(0);

  // Validar el nivel antes de tocar el PDF/las imágenes. (R16)
  if (!isValidLevel(options.level)) {
    throw new CompressFailedError("El nivel de calidad no es válido.");
  }

  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(input);
  } catch {
    throw new InvalidPdfError("El archivo no es un PDF válido.");
  }

  const images = extractImageXObjects(doc);
  const recompressible = images.filter((image) => image.recompressible);
  const quality = qualityForLevel(options.level);

  let recompressedImages = 0;
  const total = recompressible.length;

  for (let k = 0; k < total; k++) {
    const image = recompressible[k];
    const original = doc.context.lookup(image.ref);
    if (!(original instanceof PDFRawStream)) {
      onProgress?.((k + 1) / total);
      continue;
    }

    const originalBytes = original.contents;
    // Recompresión canvas vía la costura inyectable; en jsdom se inyecta un
    // recompresor falso. MIME y calidad fijados por el nivel. (R9)
    const next = await recompress(originalBytes, "image/jpeg", quality);

    if (next.byteLength < originalBytes.byteLength) {
      // Reconstruir el diccionario fijando Filter=DCTDecode y ColorSpace=DeviceRGB
      // (salida RGB del recompresor; nunca se clona el espacio original). (R11)
      const dict = original.dict.clone(doc.context);
      dict.set(FILTER, DCT_DECODE);
      dict.set(COLOR_SPACE, DEVICE_RGB);
      dict.set(WIDTH, doc.context.obj(image.width));
      dict.set(HEIGHT, doc.context.obj(image.height));
      dict.set(LENGTH, doc.context.obj(next.length));
      const replacement = PDFRawStream.of(dict, next);
      // Reasignar a la MISMA ref: las páginas la siguen resolviendo. (R11)
      doc.context.assign(image.ref, replacement);
      recompressedImages += 1;
    }
    // Si no encoge, se conserva el flujo original (nunca agrandar). (R10)

    onProgress?.((k + 1) / total);
  }

  const bytes = await doc.save();

  const report: CompressionReport = {
    originalSize: input.byteLength,
    compressedSize: bytes.byteLength,
    totalImages: images.length,
    recompressibleImages: recompressible.length,
    recompressedImages,
    minimalReduction: recompressible.length === 0, // (R13)
  };

  onProgress?.(1); // (R17, R17b)

  return { bytes, report };
}
