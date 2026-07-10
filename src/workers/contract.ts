import type { Annotation } from "@/pdf/annotate";
import type {
  CompressOptions,
  CompressPdfResult,
  CompressionReport,
} from "@/pdf/compressPdf";
import type {
  FieldFill,
  FillFormsOptions,
  FormFieldInfo,
  FormFieldType,
  FormModel,
} from "@/pdf/fillForms";
import type { ImagesToPdfOptions } from "@/pdf/imagesToPdf";
import type {
  OcrImageInput,
  OcrLanguage,
  OcrOptions,
  OcrOutput,
  OcrResult,
} from "@/pdf/ocrPdf";
import type { PageNumbersOptions } from "@/pdf/pageNumbers";
import type { ProbeInput, ProbeResult } from "@/pdf/probe";
import type { ProtectOptions } from "@/pdf/protectPdf";
import type { RedactedPageImage } from "@/pdf/redact";
import type { RotateOptions } from "@/pdf/rotateOptions";
import type { SignOptions } from "@/pdf/signature";
import type { ProgressCallback } from "@/pdf/types";
import type { WatermarkOptions } from "@/pdf/watermark";

export type {
  Annotation,
  CompressOptions,
  CompressPdfResult,
  CompressionReport,
  FieldFill,
  FillFormsOptions,
  FormFieldInfo,
  FormFieldType,
  FormModel,
  ImagesToPdfOptions,
  OcrImageInput,
  OcrLanguage,
  OcrOptions,
  OcrOutput,
  OcrResult,
  PageNumbersOptions,
  ProbeInput,
  ProbeResult,
  ProgressCallback,
  ProtectOptions,
  RedactedPageImage,
  RotateOptions,
  SignOptions,
  WatermarkOptions,
};

/**
 * Contrato ESTABLE worker↔hilo principal. Cada herramienta futura (#5+) añade
 * su método aquí (p. ej. `merge(files, onProgress)`) sin cambiar los métodos
 * existentes. Las operaciones son async porque cruzan Comlink.
 */
export interface PdfWorkerApi {
  probe(input: ProbeInput, onProgress?: ProgressCallback): Promise<ProbeResult>;
  /**
   * Une `inputs` (PDFs en orden) en un único PDF y devuelve sus bytes. La lógica
   * vive en `mergePdfs` (dominio puro); aquí solo se declara el contrato. (R14)
   */
  merge(
    inputs: readonly Uint8Array[],
    onProgress?: ProgressCallback,
  ): Promise<Uint8Array>;
  /**
   * Extrae de `input` las páginas indicadas por `rangeSpec` (p. ej. "1-3,5") y
   * devuelve un único PDF con esas páginas en el orden resuelto. La lógica vive
   * en `splitPdf` (dominio puro); aquí solo se declara el contrato. (R25)
   */
  split(
    input: Uint8Array,
    rangeSpec: string,
    onProgress?: ProgressCallback,
  ): Promise<Uint8Array>;
  /**
   * Rota las páginas de `input` indicadas por `options` (ángulo + selección) y
   * devuelve el PDF resultante. La lógica vive en `rotatePdf` (dominio puro);
   * aquí solo se declara el contrato. (R27)
   */
  rotate(
    input: Uint8Array,
    options: RotateOptions,
    onProgress?: ProgressCallback,
  ): Promise<Uint8Array>;
  /**
   * Reescribe `input` conservando solo las páginas de `pageOrder`, en ese orden
   * exacto (las omitidas quedan eliminadas), y devuelve los bytes resultantes.
   * `pageOrder` es un primitivo serializable por Comlink. La lógica vive en
   * `organizePdf` (dominio puro); aquí solo se declara el contrato. (R25)
   */
  organize(
    input: Uint8Array,
    pageOrder: readonly number[],
    onProgress?: ProgressCallback,
  ): Promise<Uint8Array>;
  /**
   * Construye un PDF con una imagen por página a partir de `images` (JPG/PNG, en
   * orden) y devuelve sus bytes. La lógica vive en `imagesToPdf` (dominio puro);
   * aquí solo se declara el contrato. (R33)
   */
  imagesToPdf(
    images: readonly Uint8Array[],
    options: ImagesToPdfOptions,
    onProgress?: ProgressCallback,
  ): Promise<Uint8Array>;
  /**
   * Dibuja un número en cada página de `input` según `options` (posición,
   * formato, número de inicio y tamaño de fuente) y devuelve sus bytes. La
   * lógica vive en `addPageNumbers` (dominio puro); aquí solo se declara el
   * contrato. (R29)
   */
  addPageNumbers(
    input: Uint8Array,
    options: PageNumbersOptions,
    onProgress?: ProgressCallback,
  ): Promise<Uint8Array>;
  /**
   * Superpone una marca (texto o imagen) en las páginas de `input` indicadas por
   * `options` (modo, posición, opacidad, ángulo, páginas) y devuelve sus bytes.
   * La lógica vive en `addWatermark` (dominio puro); aquí solo se declara el
   * contrato. (R39)
   */
  addWatermark(
    input: Uint8Array,
    options: WatermarkOptions,
    onProgress?: ProgressCallback,
  ): Promise<Uint8Array>;
  /**
   * Recomprime las imágenes recomprimibles de `input` según `options` (nivel de
   * calidad) y devuelve los bytes resultantes más un reporte honesto. La lógica
   * vive en `compressPdf` (dominio puro); aquí solo se declara el contrato. (R20)
   */
  compress(
    input: Uint8Array,
    options: CompressOptions,
    onProgress?: ProgressCallback,
  ): Promise<CompressPdfResult>;
  /**
   * Protege (cifra) o desbloquea (descifra) `input` según `options` (modo +
   * contraseña) y devuelve los bytes resultantes. El cifrado real corre en el
   * worker; la lógica vive en `protectPdf` (dominio puro), que delega en el motor
   * `@cantoo/pdf-lib`. Aquí solo se declara el contrato. (R15)
   */
  protect(
    input: Uint8Array,
    options: ProtectOptions,
    onProgress?: ProgressCallback,
  ): Promise<Uint8Array>;
  /**
   * Aplana (incrusta) la capa de `annotations` sobre las páginas de `input` y
   * devuelve los bytes. `annotations` es un primitivo serializable por Comlink
   * (objetos planos + `Uint8Array`). El aplanado pesado corre en el worker; la
   * lógica vive en `flattenAnnotations` (dominio puro). Aquí solo se declara el
   * contrato. (R22, R23)
   */
  annotate(
    input: Uint8Array,
    annotations: readonly Annotation[],
    onProgress?: ProgressCallback,
  ): Promise<Uint8Array>;
  /**
   * Coloca (incrusta y aplana) la imagen de firma de `options` en la página y
   * posición elegidas de `input` y devuelve los bytes. Firma VISUAL, no
   * criptográfica. El trabajo pesado de pdf-lib corre en el worker; la lógica
   * vive en `signPdf` (dominio puro). Aquí solo se declara el contrato. (R10)
   */
  sign(
    input: Uint8Array,
    options: SignOptions,
    onProgress?: ProgressCallback,
  ): Promise<Uint8Array>;
  /**
   * Detecta los campos AcroForm de `input` (texto/checkbox/radio/dropdown) y
   * devuelve un modelo serializable con `hasFields` y la lista de campos. La
   * lógica vive en `detectFormFields` (dominio puro); aquí solo se declara el
   * contrato. (R17, R18)
   */
  detectForm(input: Uint8Array): Promise<FormModel>;
  /**
   * Rellena los campos de `input` según `options.fills` y, si `options.flatten`,
   * aplana el formulario incrustando los valores en el contenido de página;
   * devuelve los bytes resultantes. La lógica vive en `fillForms` (dominio
   * puro); aquí solo se declara el contrato. (R17, R18, R19)
   */
  fillForms(
    input: Uint8Array,
    options: FillFormsOptions,
    onProgress?: ProgressCallback,
  ): Promise<Uint8Array>;
  /**
   * Reconoce el texto (OCR) de las páginas rasterizadas `pages` con Tesseract.js
   * y ensambla la salida: siempre el texto y, si `options.output` lo pide, un
   * PDF con capa de texto invisible buscable. El OCR (WASM) y el ensamblado
   * (pdf-lib) corren en el worker; la lógica vive en `ocrImages` (dominio puro)
   * con el motor `OcrEngine` inyectado. Aquí solo se declara el contrato. (R21)
   */
  ocr(
    pages: readonly OcrImageInput[],
    options: OcrOptions,
    onProgress?: ProgressCallback,
  ): Promise<OcrResult>;
  /**
   * Redacta PERMANENTEMENTE `input`: sustituye cada página de `redactedPages`
   * (bitmap ya redactado con cajas opacas) por una página-imagen nueva y copia
   * vectorial las intactas; devuelve los bytes resultantes. El ensamblado pesado
   * (pdf-lib) corre en el worker; la lógica vive en `redactPdf` (dominio puro).
   * Aquí solo se declara el contrato. Op nº 16. (R9)
   */
  redact(
    input: Uint8Array,
    redactedPages: readonly RedactedPageImage[],
    onProgress?: ProgressCallback,
  ): Promise<Uint8Array>;
}
