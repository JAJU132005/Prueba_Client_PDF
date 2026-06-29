/**
 * Orquestación PURA del render de páginas a imágenes + helpers de formato.
 * Recorre las páginas de un `PageRasterizer` de forma incremental y cancelable,
 * sin tocar pdf.js ni el DOM: la parte concreta vive en
 * `@/lib/pdfjsPageRasterizer`. (R1–R13)
 */

import type { ProgressCallback } from "@/pdf/types";

/** Formatos de imagen soportados. (R1) */
export type ImageFormat = "png" | "jpeg";

/** Lista canónica de formatos. (R1) */
export const IMAGE_FORMATS: readonly ImageFormat[] = ["png", "jpeg"];

/** Resolución elegible por el usuario. (R5a, R5b) */
export type ImageResolution = "low" | "medium" | "high";

/** Tipo MIME del formato. (R2) */
export function imageMimeType(format: ImageFormat): string {
  return format === "png" ? "image/png" : "image/jpeg";
}

/** Extensión de archivo del formato ("png" | "jpg"). (R3) */
export function imageFileExtension(format: ImageFormat): string {
  return format === "png" ? "png" : "jpg";
}

/** Nombre de archivo de la página `index` (0-indexada): "pagina-<n>.<ext>". (R4) */
export function imageFileName(index: number, format: ImageFormat): string {
  return `pagina-${index + 1}.${imageFileExtension(format)}`;
}

/**
 * Escala de render de una resolución. Mapa constante con valores estrictamente
 * positivos (R5a) y crecientes high > medium > low (R5b).
 */
const RESOLUTION_SCALES: Record<ImageResolution, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

/** Escala de render de una resolución (>0, monótona creciente). (R5a, R5b) */
export function scaleForResolution(resolution: ImageResolution): number {
  return RESOLUTION_SCALES[resolution];
}

/** Opciones de rasterización. */
export interface RasterizeOptions {
  format: ImageFormat;
  /** Escala de render (p. ej. resuelta con `scaleForResolution`). */
  scale: number;
  /** Calidad JPG en [0,1]; ignorada para PNG. */
  quality?: number;
}

/** Resultado de una página rasterizada. */
export interface RasterizedPage {
  /** Índice 0-indexado de la página. */
  index: number;
  /** Imagen de la página en el formato pedido. */
  blob: Blob;
}

/** Fuente de imágenes: una por página, render cancelable. (mockeable) */
export interface PageRasterizer {
  pageCount(): number;
  renderPage(
    index: number,
    options: RasterizeOptions,
    signal: AbortSignal,
  ): Promise<Blob>;
  destroy(): void;
}

/** Crea un rasterizador a partir de los bytes de un PDF. (R27) */
export type PageRasterizerFactory = (
  input: Uint8Array,
) => Promise<PageRasterizer>;

/**
 * Recorre las páginas de `rasterizer` de forma incremental (una a una, en orden
 * ascendente), invocando `onPage({ index, blob })` tras completar cada una y
 * antes de iniciar la siguiente. Espera (`await`) el resultado de cada
 * `renderPage` antes de la siguiente página. Cancelable vía `signal`: si está
 * abortado (antes o durante el recorrido), se detiene sin invocar `onPage` para
 * las páginas posteriores. El mismo `signal` se pasa a cada `renderPage` para
 * propagar la cancelación al adaptador. Reporta progreso en `[0,1]`, último
 * valor `1`. (R6–R12)
 */
export async function rasterizePages(
  rasterizer: PageRasterizer,
  options: RasterizeOptions,
  onPage: (page: RasterizedPage) => void,
  signal: AbortSignal,
  onProgress?: ProgressCallback,
): Promise<void> {
  const total = rasterizer.pageCount();
  for (let i = 0; i < total; i++) {
    // Aborto antes de iniciar el render de la página. (R10)
    if (signal.aborted) return;
    // `await` secuencial: la página i+1 no empieza hasta completar la i. El
    // mismo `signal` y las `options` (formato/escala) se pasan al adaptador.
    // (R7, R8, R9)
    const blob = await rasterizer.renderPage(i, options, signal);
    // Aborto durante el render: no invocar onPage para esta ni posteriores. (R10)
    if (signal.aborted) return;
    // Render incremental: una imagen por página, en orden. (R6)
    onPage({ index: i, blob });
    // Progreso en [0,1]; el último valor es exactamente 1. (R11, R12)
    onProgress?.((i + 1) / total);
  }
}
