/**
 * Módulo PURO de estado del visor (navegación y zoom), independiente de React,
 * pdf.js y el `<canvas>`, para que sea testeable sin render. `currentPage` es
 * 1-indexado. Todas las funciones son inmutables: devuelven un objeto nuevo y no
 * mutan el argumento. (R1–R7)
 */

/** Zoom mínimo del visor. */
export const MIN_SCALE = 0.5;
/** Zoom máximo del visor. */
export const MAX_SCALE = 4;
/** Incremento/decremento de zoom por paso. */
export const SCALE_STEP = 0.25;

export interface ViewerState {
  /** Número total de páginas del documento (>= 1). */
  readonly pageCount: number;
  /** Página visible, 1-indexada, en `[1, pageCount]`. */
  readonly currentPage: number;
  /** Escala de zoom actual, en `[MIN_SCALE, MAX_SCALE]`. */
  readonly scale: number;
}

/** Restringe `value` al intervalo cerrado `[min, max]`. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Estado inicial: página 1, zoom 1 y `pageCount` dado. (R1) */
export function createViewerState(pageCount: number): ViewerState {
  return { pageCount, currentPage: 1, scale: 1 };
}

/** Avanza una página, sin pasar de `pageCount`. (R2, R7) */
export function nextPage(state: ViewerState): ViewerState {
  return {
    ...state,
    currentPage: Math.min(state.currentPage + 1, state.pageCount),
  };
}

/** Retrocede una página, sin bajar de 1. (R3, R7) */
export function prevPage(state: ViewerState): ViewerState {
  return {
    ...state,
    currentPage: Math.max(state.currentPage - 1, 1),
  };
}

/** Salta a la página `page`, con clamp a `[1, pageCount]`. (R4, R7) */
export function goToPage(state: ViewerState, page: number): ViewerState {
  return {
    ...state,
    currentPage: clamp(page, 1, state.pageCount),
  };
}

/** Aumenta el zoom un paso, sin pasar de `MAX_SCALE`. (R5, R7) */
export function zoomIn(state: ViewerState): ViewerState {
  return {
    ...state,
    scale: Math.min(state.scale + SCALE_STEP, MAX_SCALE),
  };
}

/** Reduce el zoom un paso, sin bajar de `MIN_SCALE`. (R6, R7) */
export function zoomOut(state: ViewerState): ViewerState {
  return {
    ...state,
    scale: Math.max(state.scale - SCALE_STEP, MIN_SCALE),
  };
}
