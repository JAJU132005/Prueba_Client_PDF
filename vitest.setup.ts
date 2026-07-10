import "@testing-library/jest-dom";

// jsdom (v24) no implementa Blob/File.arrayBuffer, una API estándar del
// navegador que el código de producción usa para leer archivos en memoria
// (cero red). Se polifilla con FileReader (sí soportado por jsdom) para que los
// tests de UI ejerciten el flujo real sin tocar la lógica de producción.
if (typeof Blob.prototype.arrayBuffer !== "function") {
  Blob.prototype.arrayBuffer = function (this: Blob): Promise<ArrayBuffer> {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}

// jsdom (v24) no implementa `PointerEvent`, por lo que `fireEvent.pointerDown`
// crea un `Event` genérico que PIERDE `clientX/clientY` (llegan como NaN). Se
// polifilla como subclase de `MouseEvent` (sí soportado por jsdom, ya usado por
// los tests de ratón) para que los gestos de puntero de los tests de UI lleven
// coordenadas reales. Solo afecta al entorno de test; producción usa el
// PointerEvent nativo del navegador.
if (
  typeof MouseEvent === "function" &&
  typeof (globalThis as { PointerEvent?: unknown }).PointerEvent !== "function"
) {
  class PointerEventPolyfill extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;
    readonly isPrimary: boolean;

    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 0;
      this.pointerType = params.pointerType ?? "mouse";
      this.isPrimary = params.isPrimary ?? true;
    }
  }
  (globalThis as { PointerEvent: unknown }).PointerEvent = PointerEventPolyfill;
}

// jsdom no implementa `setPointerCapture`/`releasePointerCapture`; los gestos
// de puntero los invocan de forma defensiva. Se añaden como no-ops.
if (
  typeof Element !== "undefined" &&
  typeof Element.prototype.setPointerCapture !== "function"
) {
  Element.prototype.setPointerCapture = function (): void {
    // no-op en jsdom
  };
  Element.prototype.releasePointerCapture = function (): void {
    // no-op en jsdom
  };
}
