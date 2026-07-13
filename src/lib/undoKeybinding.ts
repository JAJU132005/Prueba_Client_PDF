/**
 * Lógica PURA del atajo de deshacer/rehacer (#37). Sin React, sin dependencias
 * del DOM más allá de comprobar el tipo del `target`. Testeable con objetos
 * planos. (R14–R17)
 */

/** Acción resultante de un acorde de teclado, o `null` si no aplica. */
export type UndoRedoAction = "undo" | "redo" | null;

/** Descriptor mínimo de una tecla (subconjunto de `KeyboardEvent`). */
export interface KeyChord {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

/**
 * Mapea un acorde a la acción: `z`/`Z` con Ctrl o Cmd → `"undo"` sin Shift,
 * `"redo"` con Shift; cualquier otra combinación → `null`. (R15, R16, R17)
 */
export function matchUndoRedo(chord: KeyChord): UndoRedoAction {
  if (chord.key.toLowerCase() !== "z") {
    return null;
  }
  if (!chord.ctrlKey && !chord.metaKey) {
    return null;
  }
  return chord.shiftKey ? "redo" : "undo";
}

/**
 * Verdadero cuando `target` es un `<input>`, un `<textarea>` o un elemento con
 * `contenteditable` activo. Robusta ante `null`/no-Element (jsdom). No incluye
 * `<select>`. (R14)
 */
export function isTextEntryElement(target: EventTarget | null): boolean {
  if (target === null || typeof HTMLElement === "undefined") {
    return false;
  }
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement
  ) {
    return true;
  }
  return target.isContentEditable === true;
}
