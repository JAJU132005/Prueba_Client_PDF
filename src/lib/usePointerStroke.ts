import { useRef } from "react";

/** Punto capturado en píxeles RELATIVOS al elemento que recibe el gesto. */
export interface StrokePoint {
  x: number;
  y: number;
}

/** Callbacks del ciclo de vida de un trazo (bajada → movimientos → subida). */
export interface PointerStrokeCallbacks {
  onStart?: (p: StrokePoint) => void;
  onMove?: (p: StrokePoint) => void;
  onEnd?: () => void;
}

/** Handlers React de Pointer Events que produce el hook. */
export interface PointerStrokeHandlers {
  onPointerDown: React.PointerEventHandler;
  onPointerMove: React.PointerEventHandler;
  onPointerUp: React.PointerEventHandler;
  onPointerLeave: React.PointerEventHandler;
}

/**
 * Captura de trazo puntero-relativa-al-elemento extraída del patrón inline de
 * `SignaturePad` (down → move → up con coordenadas locales), generalizada a
 * Pointer Events (cubren ratón, táctil y stylus en navegadores reales). Emite
 * puntos en píxeles relativos al elemento que recibe el gesto y sólo entre una
 * bajada y la subida/salida correspondiente.
 *
 * Los callbacks se leen desde una ref, de modo que los handlers devueltos son
 * estables pero siempre invocan la última versión de las funciones (evita cierres
 * obsoletos cuando el consumidor decide el modo por render). `setPointerCapture`
 * se invoca sólo si existe (jsdom no lo implementa). (R8)
 */
export function usePointerStroke(
  callbacks: PointerStrokeCallbacks,
): PointerStrokeHandlers {
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;
  const activeRef = useRef(false);

  function pointFrom(event: React.PointerEvent): StrokePoint {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function finish(): void {
    if (!activeRef.current) {
      return;
    }
    activeRef.current = false;
    callbacksRef.current.onEnd?.();
  }

  return {
    onPointerDown: (event) => {
      activeRef.current = true;
      const target = event.currentTarget;
      if (typeof target.setPointerCapture === "function") {
        try {
          target.setPointerCapture(event.pointerId);
        } catch {
          // Algunos entornos rechazan pointerId sintéticos; el trazo sigue.
        }
      }
      callbacksRef.current.onStart?.(pointFrom(event));
    },
    onPointerMove: (event) => {
      if (!activeRef.current) {
        return;
      }
      callbacksRef.current.onMove?.(pointFrom(event));
    },
    onPointerUp: () => {
      finish();
    },
    onPointerLeave: () => {
      finish();
    },
  };
}
