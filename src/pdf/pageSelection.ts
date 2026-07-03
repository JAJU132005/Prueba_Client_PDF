/**
 * Módulo PURO de selección de páginas. Estado inmutable de páginas 0-indexadas
 * seleccionadas + operaciones y atajos, más la conversión a la ESTRUCTURA
 * CANÓNICA ya existente (`PageSelection = "all" | string`) que consumen las
 * herramientas de dominio. No define un formato de rango nuevo: reutiliza
 * `parsePageRanges` para parsear/validar e `InvalidRangeError` para los errores.
 *
 * Sin React, sin DOM, sin pdf.js, sin pdf-lib: es el núcleo testeable del
 * selector visual. (R1–R17)
 */

import type { PageSelection } from "@/pdf/rotateOptions";
import { parsePageRanges } from "@/pdf/splitRanges";
import { InvalidRangeError } from "@/pdf/types";

/** Estado inmutable de selección: páginas 0-indexadas seleccionadas de un PDF. */
export interface PageSelectionState {
  readonly pageCount: number;
  readonly selected: ReadonlySet<number>; // índices 0-indexados
}

/** Índices `0..pageCount-1` en orden ascendente. */
function allIndices(pageCount: number): number[] {
  return Array.from({ length: Math.max(0, pageCount) }, (_, i) => i);
}

/**
 * Crea una selección con TODAS las páginas (índices `0..pageCount-1`)
 * seleccionadas. (R1)
 */
export function createSelection(pageCount: number): PageSelectionState {
  return { pageCount, selected: new Set(allIndices(pageCount)) };
}

/**
 * Añade `index` si no estaba seleccionado, o lo quita si ya lo estaba,
 * devolviendo un estado NUEVO (no muta la entrada). (R2, R3)
 */
export function togglePage(
  s: PageSelectionState,
  index: number,
): PageSelectionState {
  const selected = new Set(s.selected);
  if (selected.has(index)) {
    selected.delete(index);
  } else {
    selected.add(index);
  }
  return { pageCount: s.pageCount, selected };
}

/** Selecciona todas las páginas `0..pageCount-1`. (R4) */
export function selectAll(s: PageSelectionState): PageSelectionState {
  return createSelection(s.pageCount);
}

/** Selecciona las páginas de número 1-indexado PAR (2, 4, 6…). (R5) */
export function selectEven(s: PageSelectionState): PageSelectionState {
  // Número de página par ⇔ índice 0-indexado impar.
  const selected = allIndices(s.pageCount).filter((i) => (i + 1) % 2 === 0);
  return { pageCount: s.pageCount, selected: new Set(selected) };
}

/** Selecciona las páginas de número 1-indexado IMPAR (1, 3, 5…). (R6) */
export function selectOdd(s: PageSelectionState): PageSelectionState {
  // Número de página impar ⇔ índice 0-indexado par.
  const selected = allIndices(s.pageCount).filter((i) => (i + 1) % 2 !== 0);
  return { pageCount: s.pageCount, selected: new Set(selected) };
}

/** Invierte la selección dentro de `0..pageCount-1` (complemento). (R7) */
export function invertSelection(s: PageSelectionState): PageSelectionState {
  const selected = allIndices(s.pageCount).filter((i) => !s.selected.has(i));
  return { pageCount: s.pageCount, selected: new Set(selected) };
}

/**
 * Selecciona el rango 1-indexado inclusive `from..to`. Lanza `InvalidRangeError`
 * si los límites son inválidos (`from < 1`, `to > pageCount` o `from > to`),
 * sin devolver estado. (R8, R9)
 */
export function selectRange(
  s: PageSelectionState,
  from: number,
  to: number,
): PageSelectionState {
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 1 ||
    to > s.pageCount ||
    from > to
  ) {
    throw new InvalidRangeError(
      `El rango ${String(from)}-${String(to)} no es válido para ${String(
        s.pageCount,
      )} páginas.`,
    );
  }
  const selected = new Set<number>();
  for (let page = from; page <= to; page++) {
    selected.add(page - 1); // 0-indexado
  }
  return { pageCount: s.pageCount, selected };
}

/**
 * Compacta un arreglo de índices 0-indexados ascendentes en una especificación
 * de rangos 1-indexada con runs consecutivos: `[0,1,2,4] → "1-3,5"`.
 */
function compactRuns(sortedIndices: number[]): string {
  const parts: string[] = [];
  let i = 0;
  while (i < sortedIndices.length) {
    let j = i;
    while (
      j + 1 < sortedIndices.length &&
      sortedIndices[j + 1] === sortedIndices[j] + 1
    ) {
      j++;
    }
    const start = sortedIndices[i] + 1;
    const end = sortedIndices[j] + 1;
    parts.push(start === end ? `${String(start)}` : `${String(start)}-${String(end)}`);
    i = j + 1;
  }
  return parts.join(",");
}

/** Índices seleccionados en orden ascendente. */
function sortedSelected(s: PageSelectionState): number[] {
  return [...s.selected].sort((a, b) => a - b);
}

/**
 * Emite la estructura canónica `PageSelection`:
 * - todas seleccionadas → `"all"` (R10),
 * - subconjunto propio no vacío → spec compacta round-trip con
 *   `parsePageRanges` (R11),
 * - ninguna seleccionada → `""` (R12).
 */
export function toPageSelection(s: PageSelectionState): PageSelection {
  if (s.selected.size === 0) {
    return "";
  }
  if (s.selected.size === s.pageCount) {
    return "all";
  }
  return compactRuns(sortedSelected(s));
}

/**
 * Emite SIEMPRE una especificación numérica de rangos (nunca `"all"`), para las
 * herramientas que solo aceptan una spec (p. ej. dividir):
 * - todas → `"1-<pageCount>"` (R13),
 * - subconjunto → spec compacta,
 * - ninguna → `""`.
 */
export function toRangeSpec(s: PageSelectionState): string {
  if (s.selected.size === 0) {
    return "";
  }
  return compactRuns(sortedSelected(s));
}

/**
 * Construye un estado a partir de un texto de rangos, delegando el parseo y la
 * validación en `parsePageRanges`. Propaga `InvalidRangeError` sin devolver
 * estado ante texto vacío, mal formado o fuera de límites. (R14, R15)
 */
export function fromText(text: string, pageCount: number): PageSelectionState {
  const indices = parsePageRanges(text, pageCount);
  return { pageCount, selected: new Set(indices) };
}

/**
 * Resuelve una selección canónica a índices 0-indexados:
 * - `"all"` → `0..pageCount-1` ascendente,
 * - spec de rangos → `parsePageRanges` (orden de primera aparición, sin
 *   reordenar). (R16)
 */
export function resolvePages(
  selection: PageSelection,
  pageCount: number,
): number[] {
  if (selection === "all") {
    return allIndices(pageCount);
  }
  return parsePageRanges(selection, pageCount);
}
