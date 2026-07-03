import { useRef, useState } from "react";

import { signatureCanvasToPng } from "@/lib/signatureCanvasToPng";

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
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const [hasStrokes, setHasStrokes] = useState(false);

  function pointFromEvent(event: React.MouseEvent<HTMLCanvasElement>): {
    x: number;
    y: number;
  } {
    const canvas = canvasRef.current;
    if (!canvas) {
      return { x: 0, y: 0 };
    }
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function handleMouseDown(event: React.MouseEvent<HTMLCanvasElement>): void {
    drawingRef.current = true;
    lastRef.current = pointFromEvent(event);
    setHasStrokes(true);
  }

  function handleMouseMove(event: React.MouseEvent<HTMLCanvasElement>): void {
    if (!drawingRef.current) {
      return;
    }
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const point = pointFromEvent(event);
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
  }

  function handleMouseUp(): void {
    drawingRef.current = false;
    lastRef.current = null;
  }

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
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className="touch-none rounded-xl border border-border bg-white"
        style={{ width, height, cursor: "crosshair" }}
      />
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleClear}
          className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-text transition hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
        >
          Limpiar
        </button>
        <button
          type="button"
          onClick={() => void handleConfirm()}
          disabled={!hasStrokes}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
        >
          Usar esta firma
        </button>
      </div>
    </div>
  );
}
