import { useRef, useState } from "react";

import { signatureCanvasToPng } from "@/lib/signatureCanvasToPng";
import { usePointerStroke, type StrokePoint } from "@/lib/usePointerStroke";

export interface SignaturePadProps {
  /** Notifica los bytes PNG de la firma dibujada al confirmar. (R16) */
  onCapture: (bytes: Uint8Array) => void;
  /**
   * Costura inyectable que captura el lienzo como PNG. Por defecto
   * `signatureCanvasToPng`; los tests inyectan un mock. (R16)
   */
  capture?: (canvas: HTMLCanvasElement) => Promise<Uint8Array>;
  /** Ancho del lienzo en píxeles CSS. */
  width?: number;
  /** Alto del lienzo en píxeles CSS. */
  height?: number;
}

/**
 * Lienzo de dibujo a mano alzada. Al confirmar, captura el trazo como PNG
 * mediante la costura inyectable (`capture`) y notifica los bytes por
 * `onCapture`. No contiene lógica de PDF; el único punto que toca `<canvas>`
 * está aislado en la costura. (R16)
 */
export function SignaturePad({
  onCapture,
  capture = signatureCanvasToPng,
  width = 400,
  height = 160,
}: SignaturePadProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastRef = useRef<StrokePoint | null>(null);
  const [hasStrokes, setHasStrokes] = useState(false);

  // Captura de trazo compartida (Pointer Events): mismos puntos relativos al
  // elemento que el patrón inline de ratón anterior. (R8 de #29)
  const strokeHandlers = usePointerStroke({
    onStart: (point) => {
      lastRef.current = point;
      setHasStrokes(true);
    },
    onMove: (point) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (ctx && lastRef.current) {
        ctx.strokeStyle = "#111";
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(lastRef.current.x, lastRef.current.y);
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
      }
      lastRef.current = point;
    },
    onEnd: () => {
      lastRef.current = null;
    },
  });

  function handleClear(): void {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (ctx && canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    setHasStrokes(false);
  }

  async function handleConfirm(): Promise<void> {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const bytes = await capture(canvas); // (R16)
    onCapture(bytes);
  }

  return (
    <div className="flex flex-col gap-3">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        data-testid="signature-pad-canvas"
        aria-label="Lienzo para dibujar la firma"
        onPointerDown={strokeHandlers.onPointerDown}
        onPointerMove={strokeHandlers.onPointerMove}
        onPointerUp={strokeHandlers.onPointerUp}
        onPointerLeave={strokeHandlers.onPointerLeave}
        className="touch-none rounded-xl border border-line bg-white"
        style={{ width, height, cursor: "crosshair" }}
      />
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleClear}
          className="rounded-xl border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mk-green motion-reduce:transition-none"
        >
          Limpiar
        </button>
        <button
          type="button"
          onClick={() => void handleConfirm()}
          disabled={!hasStrokes}
          className="rounded-xl bg-mk-green px-4 py-2 text-sm font-semibold text-white transition hover:bg-mk-green/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mk-green focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
        >
          Usar esta firma
        </button>
      </div>
    </div>
  );
}
