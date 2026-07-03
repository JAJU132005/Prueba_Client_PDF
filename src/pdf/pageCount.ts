/**
 * Orquestación PURA del conteo de páginas de un PDF + helper de formato.
 * No importa pdf.js ni React/DOM: la parte concreta (abrir el PDF y leer
 * `numPages`) vive en `@/lib/pdfjsPageCounter` a través de la costura
 * inyectable `PageCounter`. Es el módulo reutilizado por todas las
 * herramientas vía el `Dropzone`. (R1, R2, R3, R10, R14a)
 */

/** Costura inyectable: cuenta páginas a partir de bytes; cancelable. */
export type PageCounter = (
  input: Uint8Array,
  signal?: AbortSignal,
) => Promise<number>;

/** Resultado tipado del conteo orquestado. */
export type PageCountResult =
  | { status: "counted"; pages: number }
  | { status: "unavailable" }
  | { status: "cancelled" };

/**
 * Orquesta el conteo a través de `counter`. Devuelve:
 * - `"counted"` con el número si tiene éxito (R2, R3),
 * - `"cancelled"` si al resolver/rechazar el `signal` está abortado (R14a),
 * - `"unavailable"` si `counter` lanza cualquier error (R10).
 * Nunca rasteriza ni propaga la excepción. Pura respecto a React/DOM/pdf.js.
 */
export async function countPdfPages(
  input: Uint8Array,
  counter: PageCounter,
  signal?: AbortSignal,
): Promise<PageCountResult> {
  try {
    const pages = await counter(input, signal);
    // Si el conteo resuelve con el signal ya abortado, el resultado se descarta
    // como cancelado en lugar de "counted". (R14a)
    if (signal?.aborted) {
      return { status: "cancelled" };
    }
    return { status: "counted", pages };
  } catch {
    // Una cancelación puede manifestarse como rechazo del counter: prevalece
    // "cancelled" sobre "unavailable". (R14a)
    if (signal?.aborted) {
      return { status: "cancelled" };
    }
    // Cualquier otro error (PDF cifrado/corrupto) → "unavailable", sin
    // propagar la excepción al llamante. (R10)
    return { status: "unavailable" };
  }
}

/** Texto del conteo con pluralización: 1 → "1 página"; N → "N páginas". (R2, R3) */
export function formatPageCount(pages: number): string {
  return pages === 1 ? "1 página" : `${pages} páginas`;
}
