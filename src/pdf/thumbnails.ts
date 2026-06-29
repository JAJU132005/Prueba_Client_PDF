/**
 * Orquestación PURA del render de miniaturas. Recorre las páginas de un
 * `ThumbnailRenderer` de forma incremental y cancelable, sin tocar pdf.js ni el
 * DOM: la parte concreta vive en `@/lib/pdfjsThumbnailRenderer`. (R31–R36)
 */

/** Fuente de miniaturas: una por página, render cancelable. (R31) */
export interface ThumbnailRenderer {
  /** Número de páginas del documento. */
  pageCount(): number;
  /** Rasteriza la página `index` (0-indexada) y devuelve una URL local; cancelable. */
  renderPage(index: number, signal: AbortSignal): Promise<string>;
  /** Libera el documento y los recursos asociados. */
  destroy(): void;
}

/** Crea un renderer a partir de los bytes de un PDF. (R46) */
export type ThumbnailRendererFactory = (
  input: Uint8Array,
) => Promise<ThumbnailRenderer>;

/**
 * Recorre las páginas de `renderer` de forma incremental (una a una, en orden
 * ascendente), invocando `onThumbnail(index, url)` tras completar cada una y
 * antes de iniciar la siguiente. Espera (`await`) el resultado de cada
 * `renderPage` antes de la siguiente página. Cancelable vía `signal`: si está
 * abortado (antes o durante el recorrido), se detiene sin invocar `onThumbnail`
 * para las páginas posteriores. El mismo `signal` se pasa a cada `renderPage`
 * para propagar la cancelación al adaptador. (R32–R35)
 */
export async function renderThumbnails(
  renderer: ThumbnailRenderer,
  onThumbnail: (index: number, url: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const total = renderer.pageCount();
  for (let i = 0; i < total; i++) {
    // Aborto antes de iniciar el render de la página. (R34)
    if (signal.aborted) return;
    // `await` secuencial: la página i+1 no empieza hasta completar la i. El mismo
    // `signal` se propaga al adaptador. (R32, R35)
    const url = await renderer.renderPage(i, signal);
    // Aborto durante el render: no invocar onThumbnail para esta ni posteriores. (R34)
    if (signal.aborted) return;
    // Render incremental: notificar por página, antes de la siguiente. (R33)
    onThumbnail(i, url);
  }
}
