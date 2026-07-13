import { useEffect, useRef } from "react";

import { isTextEntryElement, matchUndoRedo } from "@/lib/undoKeybinding";

/** Opciones del atajo de deshacer/rehacer. */
export interface UndoKeybindingOptions {
  /** Acción a ejecutar en Ctrl/Cmd+Z (sin Shift). (R18) */
  onUndo: () => void;
  /** Acción a ejecutar en Ctrl/Cmd+Shift+Z. (R19) */
  onRedo: () => void;
  /** Si es `false`, el atajo no hace nada (p. ej. sin archivo). Por defecto true. */
  enabled?: boolean;
}

/**
 * Suscribe un listener `keydown` en `window` (patrón de `useOnlineStatus`) para
 * el atajo de deshacer/rehacer. Los callbacks se leen desde una ref para no
 * re-suscribir en cada render. Si el foco está en un campo de texto NO dispara,
 * dejando intacto el undo nativo del campo (R20). Solo llama `preventDefault`
 * cuando maneja el atajo (R21). (R18–R21)
 */
export function useUndoKeybinding(options: UndoKeybindingOptions): void {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const handler = (event: KeyboardEvent): void => {
      const current = optionsRef.current;
      if (current.enabled === false) {
        return;
      }
      // Foco en un campo de texto: no pisar el undo nativo. (R20)
      if (isTextEntryElement(event.target)) {
        return;
      }
      const action = matchUndoRedo(event);
      if (action === null) {
        return; // No es el atajo → no preventDefault. (R21)
      }
      event.preventDefault(); // (R21)
      if (action === "undo") {
        current.onUndo(); // (R18)
      } else {
        current.onRedo(); // (R19)
      }
    };
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, []);
}
