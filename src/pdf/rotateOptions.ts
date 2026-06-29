import { parsePageRanges } from "@/pdf/splitRanges";
import { InvalidRotationError } from "@/pdf/types";

/** Ángulo normalizado a un cuadrante. (R1) */
export type RotationAngle = 0 | 90 | 180 | 270;

/** Selección de páginas: todas, o una cadena de rangos 1-indexados. (R11) */
export type PageSelection = "all" | string;

/** Opciones de la operación de rotación. (R11) */
export interface RotateOptions {
  angle: number;
  pages: PageSelection;
}

/**
 * Normaliza `angle` (grados) al conjunto {0,90,180,270}. (R1, R2)
 *
 * Lanza `InvalidRotationError` si `angle` no es un múltiplo finito de 90 (R3).
 * El doble módulo cubre ángulos negativos (`-90 → 270`).
 *
 * Función pura: sin `pdf-lib`, sin React, sin DOM. (R4)
 */
export function normalizeRotationAngle(angle: number): RotationAngle {
  if (!Number.isFinite(angle) || angle % 90 !== 0) {
    throw new InvalidRotationError(
      `El ángulo ${String(angle)} no es un múltiplo válido de 90.`,
    );
  }
  return (((angle % 360) + 360) % 360) as RotationAngle;
}

/**
 * Resuelve los índices 0-indexados de las páginas a rotar. (R5)
 *
 * - `"all"` → todos los índices en orden ascendente `[0..pageCount-1]` (R6).
 * - cadena de rangos → delega en `parsePageRanges` reutilizando el parser de #6
 *   (R7), propagando `InvalidRangeError` sin capturar ni devolver arreglo (R8).
 *
 * Función pura: sin `pdf-lib`, sin React, sin DOM.
 */
export function resolveRotationPages(
  pages: PageSelection,
  pageCount: number,
): number[] {
  if (pages === "all") {
    return Array.from({ length: pageCount }, (_, i) => i);
  }
  return parsePageRanges(pages, pageCount);
}
