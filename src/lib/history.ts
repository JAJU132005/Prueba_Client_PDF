/**
 * Modelo de historial PURO `History<T>` (#37): tres pilas inmutables
 * `past`/`present`/`future` con reductores sin mutación, en la línea de
 * `annotationModel.ts` y `redactBoxModel.ts`. Sin React, sin DOM, sin librería
 * externa. Es el núcleo testeable del sistema de deshacer/rehacer que envuelve
 * `useUndoableState`. (R1–R10)
 */

/** Historial inmutable: estados anteriores, actual y rehacibles + su cota. */
export interface History<T> {
  readonly past: readonly T[];
  readonly present: T;
  readonly future: readonly T[];
  readonly limit: number;
}

/** Máximo de entradas de `past` por defecto (evita crecer sin cota). (R10) */
export const DEFAULT_HISTORY_LIMIT = 50;

/** Acota `past` a las últimas `limit` entradas, descartando las más antiguas. (R10) */
function cap<T>(past: readonly T[], limit: number): readonly T[] {
  if (past.length <= limit) {
    return past;
  }
  return past.slice(past.length - limit);
}

/** Crea un historial con `present` y pilas vacías. (R1) */
export function createHistory<T>(
  present: T,
  limit: number = DEFAULT_HISTORY_LIMIT,
): History<T> {
  return { past: [], present, future: [], limit };
}

/**
 * Commit versionado: empuja el `present` anterior al final de `past`, fija
 * `next` como `present` y vacía `future`, respetando la cota de `past`.
 * Historial NUEVO, sin mutar la entrada. (R2, R10)
 */
export function set<T>(history: History<T>, next: T): History<T> {
  return {
    past: cap([...history.past, history.present], history.limit),
    present: next,
    future: [],
    limit: history.limit,
  };
}

/**
 * Cambio TRANSITORIO no versionado: sustituye `present` por `next` dejando
 * `past` y `future` intactos. Historial NUEVO. (R3)
 */
export function replace<T>(history: History<T>, next: T): History<T> {
  return {
    past: history.past,
    present: next,
    future: [],
    limit: history.limit,
  };
}

/**
 * Sella un gesto: inserta `checkpoint` (el estado PRE-gesto) como ÚNICA entrada
 * al final de `past` y vacía `future`, dejando `present` intacto (ya es la
 * geometría final tras los `replace` del gesto). Una entrada por gesto.
 * (R12, R32)
 */
export function pushCheckpoint<T>(
  history: History<T>,
  checkpoint: T,
): History<T> {
  return {
    past: cap([...history.past, checkpoint], history.limit),
    present: history.present,
    future: [],
    limit: history.limit,
  };
}

/**
 * Deshacer: mueve la última entrada de `past` a `present` y desplaza el
 * `present` anterior al inicio de `future`. Sin material devuelve el mismo
 * historial. Historial NUEVO. (R4, R9)
 */
export function undo<T>(history: History<T>): History<T> {
  if (history.past.length === 0) {
    return history;
  }
  const previous = history.past[history.past.length - 1];
  return {
    past: history.past.slice(0, history.past.length - 1),
    present: previous,
    future: [history.present, ...history.future],
    limit: history.limit,
  };
}

/**
 * Rehacer: mueve la primera entrada de `future` a `present` y añade el
 * `present` anterior al final de `past`. Sin material devuelve el mismo
 * historial. Historial NUEVO. (R5, R9)
 */
export function redo<T>(history: History<T>): History<T> {
  if (history.future.length === 0) {
    return history;
  }
  const next = history.future[0];
  return {
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1),
    limit: history.limit,
  };
}

/** Reinicia el historial con `present` y pilas vacías. (R6, R33) */
export function reset<T>(
  present: T,
  limit: number = DEFAULT_HISTORY_LIMIT,
): History<T> {
  return createHistory(present, limit);
}

/** Verdadero si y solo si hay algo que deshacer. (R7) */
export function canUndo<T>(history: History<T>): boolean {
  return history.past.length > 0;
}

/** Verdadero si y solo si hay algo que rehacer. (R8) */
export function canRedo<T>(history: History<T>): boolean {
  return history.future.length > 0;
}
