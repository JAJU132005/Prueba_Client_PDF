import { useEffect, useMemo, useRef, useState } from "react";

import { PageRangeSelector } from "@/components/PageRangeSelector";
import { createPdfjsPageRasterizer } from "@/lib/pdfjsPageRasterizer";
import {
  canvasPointToPdf,
  pdfPointToCanvas,
  type Annotation,
  type AnnotationColor,
  type PdfPoint,
} from "@/pdf/annotate";
import { ANNOTATION_TOOLS, type AnnotationTool } from "@/pdf/annotationModel";
import type { PageSelectionState } from "@/pdf/pageSelection";
import type { PageRasterizer, PageRasterizerFactory } from "@/pdf/rasterize";

/** Etiqueta legible de cada herramienta. */
const TOOL_LABELS: Record<AnnotationTool, string> = {
  text: "Texto",
  highlight: "Resaltado",
  freehand: "Dibujo libre",
  line: "Línea",
  rect: "Rectángulo",
  image: "Imagen",
};

/** Tamaños/valores por defecto de cada anotación creada al hacer clic (en puntos PDF). */
const DEFAULT_FONT_SIZE = 16;
const DEFAULT_TEXT = "Texto";
const DEFAULT_HIGHLIGHT = { width: 120, height: 18, opacity: 0.4 };
const DEFAULT_RECT = { width: 120, height: 80, thickness: 1.5 };
const DEFAULT_LINE_LENGTH = 100;
const DEFAULT_LINE_THICKNESS = 1.5;
const DEFAULT_FREEHAND_STEP = 24;
const DEFAULT_IMAGE = { width: 120, height: 120 };
const DEFAULT_COLOR: AnnotationColor = { r: 0, g: 0, b: 0 };
const HIGHLIGHT_COLOR: AnnotationColor = { r: 1, g: 0.9, b: 0.2 };

export interface AnnotationEditorProps {
  /** PDF fuente; sus bytes se leen frescos (sin red) para rasterizar. */
  file: File;
  /** Número de páginas del documento. */
  pageCount: number;
  /** Anotaciones ya colocadas (controladas por la ruta). */
  annotations: readonly Annotation[];
  /** Índice 0-indexado de la página activa a anotar (controlado). (R13) */
  activePageIndex: number;
  /** Notifica el cambio de página activa elegido en el selector visual. (R13) */
  onActivePageChange: (pageIndex: number) => void;
  /** Herramienta activa; `null` desactiva la creación por clic. */
  activeTool: AnnotationTool | null;
  /** Cambia la herramienta activa. */
  onToolChange: (tool: AnnotationTool | null) => void;
  /** Notifica una nueva anotación creada al hacer clic. (R7–R12) */
  onAddAnnotation: (annotation: Annotation) => void;
  /** Bytes de la imagen cargada para la herramienta de imagen (o null). */
  imageData?: Uint8Array | null;
  /** Escala de render de la página; por defecto 1 (1 punto PDF = 1 px). */
  scale?: number;
  /** Generador de ids inyectable (tests deterministas). */
  createId?: () => string;
  /**
   * Factoría de rasterizador inyectable (tests). Por defecto
   * `createPdfjsPageRasterizer` (async cancelable, sin bloquear la UI). (R24)
   */
  createRasterizer?: PageRasterizerFactory;
}

/** Id por defecto: contador local suficiente para el uso interactivo. */
function defaultIdFactory(): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `ann-${String(n)}-${String(Date.now())}`;
  };
}

/**
 * Lienzo interactivo del editor de anotaciones. Rasteriza el fondo de la página
 * activa con el `PageRasterizer` existente (async cancelable, sin congelar la
 * UI, R24), integra el selector de páginas visual para elegir la página a anotar
 * (R13) y, al hacer clic con una herramienta activa, crea la anotación
 * convirtiendo el punto de clic a puntos PDF con `canvasPointToPdf` (R14). No
 * contiene lógica de PDF (pdf-lib): solo orquesta y delega en el dominio.
 */
export function AnnotationEditor({
  file,
  pageCount,
  annotations,
  activePageIndex,
  onActivePageChange,
  activeTool,
  onToolChange,
  onAddAnnotation,
  imageData,
  scale = 1,
  createId,
  createRasterizer = createPdfjsPageRasterizer,
}: AnnotationEditorProps): JSX.Element {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(0);

  const rasterizerRef = useRef<PageRasterizer | null>(null);
  const renderAbortRef = useRef<AbortController | null>(null);
  const imageUrlRef = useRef<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const idFactoryRef = useRef<() => string>(createId ?? defaultIdFactory());
  if (createId) {
    idFactoryRef.current = createId;
  }

  // Selección visual: sólo la página activa aparece marcada (single-active).
  const selection: PageSelectionState = useMemo(
    () => ({ pageCount, selected: new Set([activePageIndex]) }),
    [pageCount, activePageIndex],
  );

  // Carga del documento al montar / cambiar `file`. Lee los bytes locales (sin
  // red) y crea el rasterizador async cancelable. (R24)
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

  // Rasteriza SOLO la página activa; al cambiarla, aborta el render previo. (R24)
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
          activePageIndex,
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
  }, [activePageIndex, scale, ready]);

  // El selector visual es multi-toggle; aquí lo usamos como single-active: la
  // página recién marcada (distinta de la activa) pasa a ser la activa. (R13)
  function handleSelectionChange(next: PageSelectionState): void {
    const candidate = [...next.selected].find((i) => i !== activePageIndex);
    if (candidate !== undefined) {
      onActivePageChange(candidate);
    }
  }

  function buildAnnotation(at: PdfPoint, tool: AnnotationTool): Annotation | null {
    const id = idFactoryRef.current();
    const base = { id, pageIndex: activePageIndex };
    switch (tool) {
      case "text":
        return {
          ...base,
          kind: "text",
          at,
          text: DEFAULT_TEXT,
          fontSize: DEFAULT_FONT_SIZE,
          color: DEFAULT_COLOR,
        };
      case "highlight":
        return {
          ...base,
          kind: "highlight",
          at: { x: at.x, y: at.y - DEFAULT_HIGHLIGHT.height },
          width: DEFAULT_HIGHLIGHT.width,
          height: DEFAULT_HIGHLIGHT.height,
          color: HIGHLIGHT_COLOR,
          opacity: DEFAULT_HIGHLIGHT.opacity,
        };
      case "rect":
        return {
          ...base,
          kind: "rect",
          at: { x: at.x, y: at.y - DEFAULT_RECT.height },
          width: DEFAULT_RECT.width,
          height: DEFAULT_RECT.height,
          color: DEFAULT_COLOR,
          thickness: DEFAULT_RECT.thickness,
        };
      case "line":
        return {
          ...base,
          kind: "line",
          start: at,
          end: { x: at.x + DEFAULT_LINE_LENGTH, y: at.y },
          color: DEFAULT_COLOR,
          thickness: DEFAULT_LINE_THICKNESS,
        };
      case "freehand":
        return {
          ...base,
          kind: "freehand",
          points: [
            at,
            { x: at.x + DEFAULT_FREEHAND_STEP, y: at.y },
            { x: at.x + 2 * DEFAULT_FREEHAND_STEP, y: at.y + DEFAULT_FREEHAND_STEP },
          ],
          color: DEFAULT_COLOR,
          thickness: DEFAULT_LINE_THICKNESS,
        };
      case "image":
        if (!imageData) {
          return null;
        }
        return {
          ...base,
          kind: "image",
          at: { x: at.x, y: at.y - DEFAULT_IMAGE.height },
          width: DEFAULT_IMAGE.width,
          height: DEFAULT_IMAGE.height,
          data: imageData,
        };
    }
  }

  function handleOverlayClick(event: React.MouseEvent<HTMLDivElement>): void {
    if (!activeTool) {
      return;
    }
    const overlay = overlayRef.current;
    if (!overlay) {
      return;
    }
    const rect = overlay.getBoundingClientRect();
    const pxX = event.clientX - rect.left;
    const pxY = event.clientY - rect.top;
    // Altura de la página en puntos PDF derivada del tamaño mostrado y la escala.
    const pageHeightPts = rect.height / scale;
    const at = canvasPointToPdf(pxX, pxY, pageHeightPts, scale); // (R14)
    const annotation = buildAnnotation(at, activeTool);
    if (annotation) {
      onAddAnnotation(annotation); // (R7–R12)
    }
  }

  const pageAnnotations = annotations.filter(
    (a) => a.pageIndex === activePageIndex,
  );

  return (
    <section
      aria-label="Editor de anotaciones"
      className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 shadow-sm"
    >
      {/* Paleta de herramientas (R7–R12) */}
      <div
        role="toolbar"
        aria-label="Herramientas de anotación"
        className="flex flex-wrap gap-2"
      >
        {ANNOTATION_TOOLS.map((tool) => (
          <button
            key={tool}
            type="button"
            onClick={() => onToolChange(activeTool === tool ? null : tool)}
            aria-pressed={activeTool === tool}
            className={`rounded-xl border px-3 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none ${
              activeTool === tool
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-surface text-text hover:bg-primary/5"
            }`}
          >
            {TOOL_LABELS[tool]}
          </button>
        ))}
      </div>

      {/* Selector de páginas visual: elige la página a anotar (R13) */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-text">Página a anotar</span>
        <PageRangeSelector
          pageCount={pageCount}
          value={selection}
          onChange={handleSelectionChange}
        />
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-danger/40 bg-danger/5 p-4 text-sm text-danger"
        >
          {error}
        </div>
      ) : (
        <div className="relative flex min-h-[8rem] items-center justify-center overflow-auto rounded-xl bg-bg p-2">
          {imageUrl && (
            <div className="relative">
              <img
                src={imageUrl}
                alt={`Página ${String(activePageIndex + 1)} para anotar`}
                className="block max-w-full"
              />
              {/* Capa interactiva: clic → nueva anotación en puntos PDF (R14) */}
              <div
                ref={overlayRef}
                data-testid="annotation-overlay"
                onClick={handleOverlayClick}
                className="absolute inset-0"
                style={{ cursor: activeTool ? "crosshair" : "default" }}
              >
                {pageAnnotations.map((annotation) => (
                  <AnnotationMarker
                    key={annotation.id}
                    annotation={annotation}
                    overlay={overlayRef.current}
                    scale={scale}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** Marca visual mínima de una anotación ya colocada (posición vía pdfPointToCanvas). */
function AnnotationMarker({
  annotation,
  overlay,
  scale,
}: {
  annotation: Annotation;
  overlay: HTMLDivElement | null;
  scale: number;
}): JSX.Element | null {
  if (!overlay) {
    return null;
  }
  const pageHeightPts = overlay.getBoundingClientRect().height / scale;
  const anchor: PdfPoint =
    annotation.kind === "line"
      ? annotation.start
      : annotation.kind === "freehand"
        ? annotation.points[0]
        : annotation.at;
  const { left, top } = pdfPointToCanvas(anchor, pageHeightPts, scale);
  return (
    <span
      data-testid="annotation-marker"
      className="absolute h-2 w-2 -translate-x-1 -translate-y-1 rounded-full bg-primary"
      style={{ left: `${String(left)}px`, top: `${String(top)}px` }}
    />
  );
}
