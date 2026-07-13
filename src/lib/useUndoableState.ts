import { useCallback, useRef, useState } from "react";

import {
  DEFAULT_HISTORY_LIMIT,
  canRedo as historyCanRedo,
  canUndo as historyCanUndo,
  createHistory,
  pushCheckpoint as historyPushCheckpoint,
  redo as historyRedo,
  replace as historyReplace,
  reset as historyReset,
  set as historySet,
  undo as historyUndo,
  type History,
} from "@/lib/history";

/** Valor nuevo o función-actualizadora sobre el `present` actual. */
type Updater<T> = T | ((prev: T) => T);

/** API del estado deshacible. Delega toda la aritmética en `History<T>`. */
export interface UndoableState<T> {
  /** Estado de dominio actual. */
  present: T;
  /** Hay algo que deshacer. (R7) */
  canUndo: boolean;
  /** Hay algo que rehacer. (R8) */
  canRedo: boolean;
  /** Commit versionado (añade una entrada de historial). (R2) */
  set: (next: Updater<T>) => void;
  /** Cambio transitorio, sin historial (p. ej. selección). (R3, R34) */
  replace: (next: Updater<T>) => void;
  /** Captura el punto de control del gesto. (R12) */
  beginGesture: () => void;
  /** Actualiza `present` de forma transitoria durante el gesto. (R12) */
  updateGesture: (next: Updater<T>) => void;
  /** Sella el gesto: como MUCHO una entrada de historial. (R12, R13, R32) */
  endGesture: () => void;
  /** Deshacer. (R4) */
  undo: () => void;
  /** Rehacer. (R5) */
  redo: () => void;
  /** Reinicia el historial (p. ej. al cambiar de archivo). (R6, R33) */
  reset: (present: T) => void;
}

function resolve<T>(next: Updater<T>, prev: T): T {
  return typeof next === "function"
    ? (next as (prev: T) => T)(prev)
    : next;
}

/**
 * Envuelve `History<T>` en `useState` y expone operaciones estables. El punto de
 * control del gesto vive en una `useRef` (patrón `gestureRef` de los lienzos): al
 * terminar un gesto solo se añade una entrada si el `present` cambió respecto al
 * punto de control, comparando por identidad de referencia del modelo inmutable
 * (los reductores devuelven objetos nuevos solo ante cambio real). (R11, R12, R13)
 */
export function useUndoableState<T>(
  initial: T,
  limit: number = DEFAULT_HISTORY_LIMIT,
): UndoableState<T> {
  const [history, setHistory] = useState<History<T>>(() =>
    createHistory(initial, limit),
  );

  // Punto de control del gesto en curso (identidad del modelo pre-gesto).
  const checkpointRef = useRef<{ active: boolean; value: T }>({
    active: false,
    value: initial,
  });

  const set = useCallback((next: Updater<T>) => {
    setHistory((h) => historySet(h, resolve(next, h.present)));
  }, []);

  const replace = useCallback((next: Updater<T>) => {
    setHistory((h) => historyReplace(h, resolve(next, h.present)));
  }, []);

  const beginGesture = useCallback(() => {
    // Captura el checkpoint desde el estado más reciente en cola (no muta el
    // historial): así una `replace` de selección disparada en el mismo manejador
    // queda incluida y un clic sin arrastre NO añade entrada. (R13, R34)
    setHistory((h) => {
      checkpointRef.current = { active: true, value: h.present };
      return h;
    });
  }, []);

  const updateGesture = useCallback((next: Updater<T>) => {
    setHistory((h) => historyReplace(h, resolve(next, h.present)));
  }, []);

  const endGesture = useCallback(() => {
    const checkpoint = checkpointRef.current;
    checkpointRef.current = { active: false, value: checkpoint.value };
    if (!checkpoint.active) {
      return;
    }
    setHistory((h) =>
      h.present === checkpoint.value
        ? h
        : historyPushCheckpoint(h, checkpoint.value),
    );
  }, []);

  const undo = useCallback(() => {
    setHistory((h) => historyUndo(h));
  }, []);

  const redo = useCallback(() => {
    setHistory((h) => historyRedo(h));
  }, []);

  const reset = useCallback(
    (present: T) => {
      checkpointRef.current = { active: false, value: present };
      setHistory(historyReset(present, limit));
    },
    [limit],
  );

  return {
    present: history.present,
    canUndo: historyCanUndo(history),
    canRedo: historyCanRedo(history),
    set,
    replace,
    beginGesture,
    updateGesture,
    endGesture,
    undo,
    redo,
    reset,
  };
}
