import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { createPdfjsPageRasterizer } from "@/lib/pdfjsPageRasterizer";
import { usePointerStroke, type StrokePoint } from "@/lib/usePointerStroke";
import {
  canvasPointToPdf,
  pdfPointToCanvas,
  type PdfPoint,
} from "@/pdf/annotate";
import {
  moveSignatureBox,
  resizeSignatureBox,
  type FreePlacement,
  type SignatureExtra,
  type SignatureHandle,
} from "@/pdf/signature";
import type { PageRasterizer, PageRasterizerFactory } from "@/pdf/rasterize";

/** Radio (px de vista) del área sensible de un tirador de redimensionado. */
const HANDLE_HIT_PX = 12;
/** Lado (px de vista) del cuadrado del tirador dibujado. */
const HANDLE_SIZE_PX = 10;

export interface SignaturePlacementCanvasProps {
  /** PDF fuente; sus bytes se leen frescos (sin red) para rasterizar. */
  file: File;
  /** Índice 0-indexado de la página activa donde se coloca la firma. */
  pageIndex: number;
  /** Caja de la firma en puntos PDF (controlada por la ruta). */
  placement: FreePlacement;
  /** Notifica la nueva caja tras mover/redimensionar. (R11, R12, R13) */
  onPlacementChange: (placement: FreePlacement) => void;
  /** Relación de aspecto intrínseca de la firma (`width / height`). (R13) */
  aspectRatio: number;
  /** Object URL de la firma para dibujarla dentro de la caja (opcional). */
  signatureUrl?: string | null;
  /** Extras colocables (fecha, iniciales/nombre) de la página activa. (R25) */
  extras?: readonly SignatureExtra[];
  /** Tamaño mínimo (pts PDF) de la caja al redimensionar. (R5) */
  minSize?: number;
  /** Escala de render de la página; por defecto 1 (1 punto PDF = 1 px). */
  scale?: number;
  /** Factoría de rasterizador inyectable (tests). */
  createRasterizer?: PageRasterizerFactory;
}

/** Gesto de puntero en curso sobre la caja de firma. */
type Gesture =
  | { type: "move"; original: FreePlacement; start: PdfPoint }
  | { type: "resize"; handle: SignatureHandle }
  | null;

/**
 * Lienzo interactivo de colocación LIBRE de la firma (#30). Rasteriza el fondo
 * de la página activa con el `PageRasterizer` (async cancelable, patrón de #29) y
 * superpone una capa SVG con una ÚNICA caja de firma (más los extras de la
 * página). Convierte puntero↔PDF con `canvasPointToPdf`/`pdfPointToCanvas` y
 * delega TODA la aritmética en `signature.ts` (`moveSignatureBox`,
 * `resizeSignatureBox`). No contiene lógica de pdf-lib. (R11, R12, R13)
 */
export function SignaturePlacementCanvas({
  file,
  pageIndex,
  placement,
  onPlacementChange,
  aspectRatio,
  signatureUrl,
  extras = [],
  minSize = 8,
  scale = 1,
  createRasterizer = createPdfjsPageRasterizer,
}: SignaturePlacementCanvasProps): JSX.Element {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(0);
  const [viewSize, setViewSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  const rasterizerRef = useRef<PageRasterizer | null>(null);
  const renderAbortRef = useRef<AbortController | null>(null);
  const imageUrlRef = useRef<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture>(null);

  const pageHeightPts = viewSize ? viewSize.height / scale : 0;

  // --- Carga del documento y rasterización del fondo (patrón #29) ---
  useEffect(() => {
    let cancelled = false;
    setError(null);
    setImageUrl(null);
    imageUrlRef.current = null;

    void (async (): Promise<void> => {
      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(await file.arrayBuffer());
      } catch {
        if (!cancelled) {
          setError("No se pudo leer el archivo.");
        }
        return;
      }
      try {
        const rasterizer = await createRasterizer(bytes);
        if (cancelled) {
          rasterizer.destroy();
          return;
        }
        rasterizerRef.current = rasterizer;
        setReady((n) => n + 1);
      } catch {
        if (!cancelled) {
          setError("El archivo no es un PDF válido.");
        }
      }
    })();

    return () => {
      cancelled = true;
      renderAbortRef.current?.abort();
      renderAbortRef.current = null;
      rasterizerRef.current?.destroy();
      rasterizerRef.current = null;
      if (imageUrlRef.current) {
        URL.revokeObjectURL(imageUrlRef.current);
        imageUrlRef.current = null;
      }
    };
  }, [file, createRasterizer]);

  useEffect(() => {
    const rasterizer = rasterizerRef.current;
    if (!rasterizer) {
      return;
    }
    const controller = new AbortController();
    renderAbortRef.current = controller;

    void (async (): Promise<void> => {
      try {
        const blob = await rasterizer.renderPage(
          pageIndex,
          { format: "png", scale },
          controller.signal,
        );
        if (controller.signal.aborted) {
          return;
        }
        const url = URL.createObjectURL(blob);
        if (imageUrlRef.current) {
          URL.revokeObjectURL(imageUrlRef.current);
        }
        imageUrlRef.current = url;
        setImageUrl(url);
      } catch {
        if (!controller.signal.aborted) {
          setError("No se pudo mostrar la página.");
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [pageIndex, scale, ready]);

  // Mide el tamaño mostrado de la página para derivar la geometría (px = pts·escala).
  useLayoutEffect(() => {
    const el = overlayRef.current;
    if (imageUrl && el) {
      const rect = el.getBoundingClientRect();
      setViewSize({ width: rect.width, height: rect.height });
    }
  }, [imageUrl, scale, pageIndex]);

  // --- Conversión de coordenadas (única fuente, reuso de #29) ---
  function toPdf(pxX: number, pxY: number): PdfPoint {
    return canvasPointToPdf(pxX, pxY, pageHeightPts, scale);
  }

  function toPx(point: PdfPoint): { left: number; top: number } {
    return pdfPointToCanvas(point, pageHeightPts, scale);
  }

  /** Coordenadas PDF (y-arriba) de las 4 esquinas de la caja. */
  function handlePositions(): { handle: SignatureHandle; point: PdfPoint }[] {
    return [
      { handle: "nw", point: { x: placement.x, y: placement.y + placement.height } },
      {
        handle: "ne",
        point: {
          x: placement.x + placement.width,
          y: placement.y + placement.height,
        },
      },
      { handle: "sw", point: { x: placement.x, y: placement.y } },
      { handle: "se", point: { x: placement.x + placement.width, y: placement.y } },
    ];
  }

  function handleAt(pdf: PdfPoint): SignatureHandle | null {
    const tolerance = HANDLE_HIT_PX / scale;
    for (const { handle, point } of handlePositions()) {
      if (Math.hypot(point.x - pdf.x, point.y - pdf.y) <= tolerance) {
        return handle;
      }
    }
    return null;
  }

  function insideBox(pdf: PdfPoint): boolean {
    return (
      pdf.x >= placement.x &&
      pdf.x <= placement.x + placement.width &&
      pdf.y >= placement.y &&
      pdf.y <= placement.y + placement.height
    );
  }

  const strokeHandlers = usePointerStroke({
    onStart: (p: StrokePoint) => {
      const pdf = toPdf(p.x, p.y);
      const handle = handleAt(pdf);
      if (handle) {
        gestureRef.current = { type: "resize", handle }; // (R13)
        return;
      }
      if (insideBox(pdf)) {
        gestureRef.current = { type: "move", original: placement, start: pdf }; // (R11, R12)
        return;
      }
      gestureRef.current = null;
    },
    onMove: (p: StrokePoint) => {
      const pdf = toPdf(p.x, p.y);
      const gesture = gestureRef.current;
      if (gesture?.type === "move") {
        onPlacementChange(
          moveSignatureBox(
            gesture.original,
            pdf.x - gesture.start.x,
            pdf.y - gesture.start.y,
          ),
        );
      } else if (gesture?.type === "resize") {
        onPlacementChange(
          resizeSignatureBox(placement, gesture.handle, pdf, aspectRatio, minSize),
        );
      }
    },
    onEnd: () => {
      gestureRef.current = null;
    },
  });

  const boxTopLeft = toPx({ x: placement.x, y: placement.y + placement.height });

  return (
    <section
      aria-label="Colocación de la firma"
      className="flex flex-col gap-2 rounded-2xl border border-line bg-card p-4 shadow-sm"
    >
      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-mk-red/40 bg-hl-red/40 p-4 text-sm text-mk-red"
        >
          {error}
        </div>
      ) : (
        <div className="relative flex min-h-[8rem] items-center justify-center overflow-auto rounded-xl bg-paper p-2">
          {imageUrl && (
            <div className="relative">
              <img
                src={imageUrl}
                alt={`Página ${String(pageIndex + 1)} para firmar`}
                className="block max-w-full"
              />
              <div
                ref={overlayRef}
                data-testid="signature-placement-overlay"
                onPointerDown={strokeHandlers.onPointerDown}
                onPointerMove={strokeHandlers.onPointerMove}
                onPointerUp={strokeHandlers.onPointerUp}
                onPointerLeave={strokeHandlers.onPointerLeave}
                className="absolute inset-0 outline-none"
                style={{ cursor: "move", touchAction: "none" }}
              >
                {viewSize && (
                  <svg
                    data-testid="signature-placement-layer"
                    width={viewSize.width}
                    height={viewSize.height}
                    viewBox={`0 0 ${String(viewSize.width)} ${String(
                      viewSize.height,
                    )}`}
                    className="pointer-events-none absolute inset-0"
                  >
                    {signatureUrl ? (
                      <image
                        data-testid="signature-placement-image"
                        href={signatureUrl}
                        x={boxTopLeft.left}
                        y={boxTopLeft.top}
                        width={placement.width * scale}
                        height={placement.height * scale}
                      />
                    ) : (
                      <rect
                        data-testid="signature-placement-box"
                        x={boxTopLeft.left}
                        y={boxTopLeft.top}
                        width={placement.width * scale}
                        height={placement.height * scale}
                        fill="none"
                        stroke="#1f9d55"
                        strokeWidth={1.5}
                        strokeDasharray="4 3"
                      />
                    )}
                    {extras.map((extra) => {
                      const at = toPx(extra.at);
                      return (
                        <text
                          key={extra.id}
                          data-testid="signature-placement-extra"
                          x={at.left}
                          y={at.top}
                          fontSize={extra.fontSize * scale}
                          fill="#111"
                          style={{ fontFamily: "Helvetica, Arial, sans-serif" }}
                        >
                          {extra.text}
                        </text>
                      );
                    })}
                    {handlePositions().map(({ handle, point }) => {
                      const px = toPx(point);
                      return (
                        <rect
                          key={handle}
                          data-testid={`signature-handle-${handle}`}
                          x={px.left - HANDLE_SIZE_PX / 2}
                          y={px.top - HANDLE_SIZE_PX / 2}
                          width={HANDLE_SIZE_PX}
                          height={HANDLE_SIZE_PX}
                          fill="#ffffff"
                          stroke="#1f9d55"
                          strokeWidth={1.5}
                        />
                      );
                    })}
                  </svg>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
