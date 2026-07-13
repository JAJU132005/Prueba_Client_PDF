import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { createPdfjsPageRasterizer } from "@/lib/pdfjsPageRasterizer";
import { usePointerStroke, type StrokePoint } from "@/lib/usePointerStroke";
import {
  canvasPointToPdf,
  pdfPointToCanvas,
  type PdfPoint,
} from "@/pdf/annotate";
import {
  findSignatureAt,
  moveSignatureBox,
  resizeSignatureBox,
  type FreePlacement,
  type PlacedSignature,
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
  /** Índice 0-indexado de la página activa donde se colocan las firmas. */
  pageIndex: number;
  /** LISTA de firmas colocadas (controlada por la ruta). (R16–R18) */
  placements: readonly PlacedSignature[];
  /** `id` de la firma seleccionada (muestra tiradores) o `null`. (R16) */
  selectedId: string | null;
  /** Selección por clic; resuelta con `findSignatureAt`. (R16) */
  onSelect: (id: string | null) => void;
  /** Notifica la nueva caja de la firma `id` tras mover/redimensionar. (R17, R18) */
  onPlacementChange: (id: string, box: FreePlacement) => void;
  /** Inicio de un gesto de mover/redimensionar (coalescing del undo). (#37 R32) */
  onGestureStart?: () => void;
  /** Fin de un gesto de mover/redimensionar (sella la entrada de undo). (#37 R32) */
  onGestureEnd?: () => void;
  /** Object URL de la imagen por `id` de firma, para dibujarla dentro de su caja. */
  signatureUrls?: Record<string, string | null>;
  /** Tamaño mínimo (pts PDF) de la caja al redimensionar. */
  minSize?: number;
  /** Escala de render de la página; por defecto 1 (1 punto PDF = 1 px). */
  scale?: number;
  /** Factoría de rasterizador inyectable (tests). */
  createRasterizer?: PageRasterizerFactory;
}

/** Gesto de puntero en curso sobre una firma. */
type Gesture =
  | { type: "move"; id: string; original: FreePlacement; start: PdfPoint }
  | { type: "resize"; id: string; handle: SignatureHandle; aspectRatio: number }
  | null;

/**
 * Lienzo interactivo de colocación LIBRE de VARIAS firmas (#36). Rasteriza el
 * fondo de la página activa con el `PageRasterizer` (async cancelable, patrón de
 * #29) y superpone una capa SVG con TODAS las cajas de firma de esa página; la
 * seleccionada muestra tiradores. Convierte puntero↔PDF con `canvasPointToPdf`/
 * `pdfPointToCanvas` (R11) y delega TODA la aritmética en `signature.ts`
 * (`findSignatureAt` para seleccionar, `moveSignatureBox`/`resizeSignatureBox`
 * para editar). No contiene lógica de pdf-lib. (R11, R16, R17, R18)
 */
export function SignaturePlacementCanvas({
  file,
  pageIndex,
  placements,
  selectedId,
  onSelect,
  onPlacementChange,
  onGestureStart,
  onGestureEnd,
  signatureUrls,
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

  // Firmas visibles en la página activa (una firma puede vivir en varias).
  const pagePlacements = placements.filter((p) =>
    p.pageIndices.includes(pageIndex),
  );
  const selected =
    selectedId === null
      ? undefined
      : pagePlacements.find((p) => p.id === selectedId);

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

  /** Coordenadas PDF (y-arriba) de las 4 esquinas de una caja. */
  function handlePositions(
    box: FreePlacement,
  ): { handle: SignatureHandle; point: PdfPoint }[] {
    return [
      { handle: "nw", point: { x: box.x, y: box.y + box.height } },
      { handle: "ne", point: { x: box.x + box.width, y: box.y + box.height } },
      { handle: "sw", point: { x: box.x, y: box.y } },
      { handle: "se", point: { x: box.x + box.width, y: box.y } },
    ];
  }

  function handleAt(box: FreePlacement, pdf: PdfPoint): SignatureHandle | null {
    const tolerance = HANDLE_HIT_PX / scale;
    for (const { handle, point } of handlePositions(box)) {
      if (Math.hypot(point.x - pdf.x, point.y - pdf.y) <= tolerance) {
        return handle;
      }
    }
    return null;
  }

  const strokeHandlers = usePointerStroke({
    onStart: (p: StrokePoint) => {
      const pdf = toPdf(p.x, p.y);
      // Si hay una firma seleccionada y el puntero cae sobre uno de sus
      // tiradores → redimensionar esa firma. (R18)
      if (selected) {
        const handle = handleAt(selected.box, pdf);
        if (handle) {
          gestureRef.current = {
            type: "resize",
            id: selected.id,
            handle,
            aspectRatio: selected.aspectRatio,
          };
          onGestureStart?.(); // (#37 R32)
          return;
        }
      }
      // Si no, resolver la firma bajo el puntero (topmost) y seleccionarla; el
      // mismo gesto arranca el arrastre para moverla. (R16, R17)
      const hitId = findSignatureAt(pagePlacements, pdf);
      if (hitId !== null) {
        onSelect(hitId);
        const hit = pagePlacements.find((pl) => pl.id === hitId);
        if (hit) {
          gestureRef.current = {
            type: "move",
            id: hitId,
            original: hit.box,
            start: pdf,
          };
          onGestureStart?.(); // (#37 R32)
        }
        return;
      }
      onSelect(null);
      gestureRef.current = null;
    },
    onMove: (p: StrokePoint) => {
      const pdf = toPdf(p.x, p.y);
      const gesture = gestureRef.current;
      if (gesture?.type === "move") {
        onPlacementChange(
          gesture.id,
          moveSignatureBox(
            gesture.original,
            pdf.x - gesture.start.x,
            pdf.y - gesture.start.y,
          ),
        ); // (R17)
      } else if (gesture?.type === "resize") {
        const target = placements.find((pl) => pl.id === gesture.id);
        if (target) {
          onPlacementChange(
            gesture.id,
            resizeSignatureBox(
              target.box,
              gesture.handle,
              pdf,
              gesture.aspectRatio,
              minSize,
            ),
          ); // (R18)
        }
      }
    },
    onEnd: () => {
      const gesture = gestureRef.current;
      gestureRef.current = null;
      if (gesture?.type === "move" || gesture?.type === "resize") {
        onGestureEnd?.(); // (#37 R32)
      }
    },
  });

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
                    {pagePlacements.map((placement) => {
                      const topLeft = toPx({
                        x: placement.box.x,
                        y: placement.box.y + placement.box.height,
                      });
                      const url = signatureUrls?.[placement.id] ?? null;
                      const isSelected = placement.id === selectedId;
                      return (
                        <g key={placement.id}>
                          {url ? (
                            <image
                              data-testid="signature-placement-image"
                              data-signature-id={placement.id}
                              href={url}
                              x={topLeft.left}
                              y={topLeft.top}
                              width={placement.box.width * scale}
                              height={placement.box.height * scale}
                            />
                          ) : (
                            <rect
                              data-testid="signature-placement-box"
                              data-signature-id={placement.id}
                              x={topLeft.left}
                              y={topLeft.top}
                              width={placement.box.width * scale}
                              height={placement.box.height * scale}
                              fill="none"
                              stroke={isSelected ? "#1f9d55" : "#9ca3af"}
                              strokeWidth={1.5}
                              strokeDasharray="4 3"
                            />
                          )}
                          {(placement.extras ?? []).map((extra) => {
                            const at = toPx(extra.at);
                            return (
                              <text
                                key={extra.id}
                                data-testid="signature-placement-extra"
                                x={at.left}
                                y={at.top}
                                fontSize={extra.fontSize * scale}
                                fill="#111"
                                style={{
                                  fontFamily: "Helvetica, Arial, sans-serif",
                                }}
                              >
                                {extra.text}
                              </text>
                            );
                          })}
                          {isSelected &&
                            handlePositions(placement.box).map(
                              ({ handle, point }) => {
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
                              },
                            )}
                        </g>
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
