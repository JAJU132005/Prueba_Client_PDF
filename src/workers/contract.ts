import type {
  CompressOptions,
  CompressPdfResult,
  CompressionReport,
} from "@/pdf/compressPdf";
import type { ImagesToPdfOptions } from "@/pdf/imagesToPdf";
import type { PageNumbersOptions } from "@/pdf/pageNumbers";
import type { ProbeInput, ProbeResult } from "@/pdf/probe";
import type { RotateOptions } from "@/pdf/rotateOptions";
import type { ProgressCallback } from "@/pdf/types";
import type { WatermarkOptions } from "@/pdf/watermark";

export type {
  CompressOptions,
  CompressPdfResult,
  CompressionReport,
  ImagesToPdfOptions,
  PageNumbersOptions,
  ProbeInput,
  ProbeResult,
  ProgressCallback,
  RotateOptions,
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
}
