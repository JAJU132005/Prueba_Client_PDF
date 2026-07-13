import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { PageRangeSelector } from "@/components/PageRangeSelector";
import { createPdfjsPageRasterizer } from "@/lib/pdfjsPageRasterizer";
import { usePointerStroke, type StrokePoint } from "@/lib/usePointerStroke";
import {
  canvasPointToPdf,
  pdfPointToCanvas,
  type Annotation,
  type AnnotationColor,
  type PdfPoint,
} from "@/pdf/annotate";
import {
  annotationBounds,
  beginDraft,
  commitDraft,
  createImageAnnotation,
  createTextAnnotation,
  hitTest,
  moveAnnotation,
  resizeAnnotation,
  updateAnnotationText,
  updateDraft,
  type Draft,
  type ResizeHandle,
  type ToolSettings,
} from "@/pdf/annotationInteraction";
import { ANNOTATION_TOOLS, type AnnotationTool } from "@/pdf/annotationModel";
import { deriveEditorGeometry } from "@/pdf/editorScale";
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

/** Radio (px de vista) del área sensible de un tirador de selección. */
const HANDLE_HIT_PX = 12;
/** Lado (px de vista) del cuadrado del tirador dibujado. */
const HANDLE_SIZE_PX = 10;
/** Opciones de tamaño de fuente para el control de estilo (pts PDF). */
const FONT_SIZE_OPTIONS = [10, 12, 14, 16, 20, 24, 32, 48];
/** Opciones de grosor de trazo para el control de estilo (pts PDF). */
const THICKNESS_OPTIONS = [1, 1.5, 2, 3, 5, 8];

export interface AnnotationEditorProps {
  /** PDF fuente; sus bytes se leen frescos (sin red) para rasterizar. */
  file: File;
  /** Número de páginas del documento. */
  pageCount: number;
  /** Anotaciones ya colocadas (controladas por la ruta). */
  annotations: readonly Annotation[];
  /** Índice 0-indexado de la página activa a anotar (controlado). */
  activePageIndex: number;
  /** Notifica el cambio de página activa elegido en el selector visual. */
  onActivePageChange: (pageIndex: number) => void;
  /** Herramienta activa; `null` = modo selección. */
  activeTool: AnnotationTool | null;
  /** Cambia la herramienta activa. */
  onToolChange: (tool: AnnotationTool | null) => void;
  /** Notifica una nueva anotación creada. (R2, R4, R10, R12, R13, R16) */
  onAddAnnotation: (annotation: Annotation) => void;
  /** Reemplaza una anotación existente (mover/redimensionar/editar). (R19–R23) */
  onUpdateAnnotation: (annotation: Annotation) => void;
  /** Elimina una anotación por id. (R25) */
  onRemoveAnnotation: (id: string) => void;
  /** Id de la anotación seleccionada (controlado). (R17) */
  selectedId: string | null;
  /** Cambia la selección (o `null` para deseleccionar). (R17, R26) */
  onSelectionChange: (id: string | null) => void;
  /** Ajustes de estilo activos para la siguiente anotación. (R1, R2) */
  settings: ToolSettings;
  /** Cambia los ajustes de estilo. (R1) */
  onSettingsChange: (settings: ToolSettings) => void;
  /** Inicio de un gesto de mover/redimensionar (para coalescing del undo). (#37 R32) */
  onGestureStart?: () => void;
  /** Fin de un gesto de mover/redimensionar (sella la entrada de undo). (#37 R32) */
  onGestureEnd?: () => void;
  /** Bytes de la imagen cargada para la herramienta de imagen (o null). */
  imageData?: Uint8Array | null;
  /** Escala de render de la página; por defecto 1 (1 punto PDF = 1 px). */
  scale?: number;
  /** Generador de ids inyectable (tests deterministas). */
  createId?: () => string;
  /** Factoría de rasterizador inyectable (tests). (R24 de #23) */
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

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function channelToHex(v: number): string {
  return Math.round(clamp01(v) * 255)
    .toString(16)
    .padStart(2, "0");
}

function rgbToHex(c: AnnotationColor): string {
  return `#${channelToHex(c.r)}${channelToHex(c.g)}${channelToHex(c.b)}`;
}

function hexToRgb(hex: string): AnnotationColor {
  const n = hex.replace("#", "");
  return {
    r: parseInt(n.slice(0, 2), 16) / 255,
    g: parseInt(n.slice(2, 4), 16) / 255,
    b: parseInt(n.slice(4, 6), 16) / 255,
  };
}

function cssColor(c: AnnotationColor): string {
  return rgbToHex(c);
}

/** Estado del campo de texto inline: al crear (editingId null) o al reeditar. */
interface TextDraft {
  at: PdfPoint;
  value: string;
  editingId: string | null;
}

/** Gesto de selección en curso (mover/redimensionar/deseleccionar). */
type SelectionGesture =
  | { type: "move"; original: Annotation; start: PdfPoint }
  | { type: "resize"; original: Annotation; handle: ResizeHandle }
  | { type: "deselect" }
  | { type: "draft" }
  | null;

/**
 * Lienzo interactivo del editor de anotaciones (#29). Rasteriza el fondo de la
 * página activa con el `PageRasterizer` (async cancelable, sin congelar la UI) y
 * superpone una CAPA SVG fiel que renderiza cada anotación con su geometría y
 * estilo reales (R27). Los gestos (arrastre para formas/trazo, clic para texto/
 * imagen, selección/mover/redimensionar) se convierten a puntos PDF con
 * `canvasPointToPdf`/`pdfPointToCanvas` (R28) y toda la aritmética vive en el
 * modelo puro `annotationInteraction.ts` (R34). No contiene lógica de pdf-lib.
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
  onUpdateAnnotation,
  onRemoveAnnotation,
  selectedId,
  onSelectionChange,
  settings,
  onSettingsChange,
  onGestureStart,
  onGestureEnd,
  imageData,
  scale = 1,
  createId,
  createRasterizer = createPdfjsPageRasterizer,
}: AnnotationEditorProps): JSX.Element {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(0);
  // Tamaño MOSTRADO de la página (px de vista), medido inicialmente por
  // getBoundingClientRect y recalculado por un ResizeObserver ante reflow. (R2)
  const [displaySize, setDisplaySize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  // Tamaño NATURAL de la imagen rasterizada (px), reportado por `onLoad`. Con él
  // se deriva el ancho/alto real de la página en puntos PDF. (R1, R3)
  const [naturalSize, setNaturalSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [textDraft, setTextDraft] = useState<TextDraft | null>(null);
  const [imageObjectUrls, setImageObjectUrls] = useState<Record<string, string>>(
    {},
  );

  const rasterizerRef = useRef<PageRasterizer | null>(null);
  const renderAbortRef = useRef<AbortController | null>(null);
  const imageUrlRef = useRef<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const gestureRef = useRef<SelectionGesture>(null);
  const idFactoryRef = useRef<() => string>(createId ?? defaultIdFactory());
  if (createId) {
    idFactoryRef.current = createId;
  }

  const selection: PageSelectionState = useMemo(
    () => ({ pageCount, selected: new Set([activePageIndex]) }),
    [pageCount, activePageIndex],
  );

  const pageAnnotations = useMemo(
    () => annotations.filter((a) => a.pageIndex === activePageIndex),
    [annotations, activePageIndex],
  );

  // `scale` es la escala de RENDER (rasterización). La escala de VISUALIZACIÓN
  // real (px mostrados por punto PDF) y la altura real de la página se derivan de
  // la geometría observada, no se asume 1 px = 1 pt. (R1, R3, R4)
  const geometry = useMemo(
    () =>
      deriveEditorGeometry({
        naturalWidth: naturalSize?.width ?? 0,
        naturalHeight: naturalSize?.height ?? 0,
        displayedWidth: displaySize?.width ?? 0,
        displayedHeight: displaySize?.height ?? 0,
        renderScale: scale,
      }),
    [naturalSize, displaySize, scale],
  );
  const displayScale = geometry?.scale ?? scale;
  const pageHeightPts = geometry?.pageHeightPts ?? 0;

  // --- Carga del documento y rasterización del fondo (intacto respecto a #23) ---
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

  // Medición inicial del tamaño MOSTRADO de la página para derivar la geometría
  // de la capa SVG. El ResizeObserver la mantiene al día ante reflow. (R2)
  useLayoutEffect(() => {
    const el = overlayRef.current;
    if (imageUrl && el) {
      const rect = el.getBoundingClientRect();
      setDisplaySize({ width: rect.width, height: rect.height });
    }
  }, [imageUrl, scale, activePageIndex]);

  // Recalcula el tamaño mostrado cuando el contenedor hace reflow (la <img> se
  // encoge por CSS): sin esto la escala de visualización se quedaría obsoleta. (R2)
  useEffect(() => {
    const img = imgRef.current;
    if (!img || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const rect = entry.contentRect;
        if (rect.width > 0 && rect.height > 0) {
          setDisplaySize({ width: rect.width, height: rect.height });
        }
      }
    });
    observer.observe(img);
    return () => {
      observer.disconnect();
    };
  }, [imageUrl]);

  // Cierra el borrador de texto/forma al cambiar de página O de herramienta, para
  // que un borrador abierto no bloquee las demás herramientas. (R6, R7)
  useEffect(() => {
    setTextDraft(null);
    setDraft(null);
  }, [activePageIndex, activeTool]);

  // Object URLs por anotación de imagen para renderizarlas en la capa SVG.
  useEffect(() => {
    const urls: Record<string, string> = {};
    for (const a of pageAnnotations) {
      if (a.kind === "image") {
        urls[a.id] = URL.createObjectURL(
          new Blob([a.data as BlobPart], { type: "image/png" }),
        );
      }
    }
    setImageObjectUrls(urls);
    return () => {
      for (const url of Object.values(urls)) {
        URL.revokeObjectURL(url);
      }
    };
  }, [pageAnnotations]);

  function handleSelectionChange(next: PageSelectionState): void {
    const candidate = [...next.selected].find((i) => i !== activePageIndex);
    if (candidate !== undefined) {
      onActivePageChange(candidate);
    }
  }

  // --- Conversión de coordenadas (única fuente, R28) ---
  // Usa la escala de VISUALIZACIÓN derivada (px mostrados por punto PDF), no la
  // escala de render asumida `1`. (R4)
  function toPdf(pxX: number, pxY: number): PdfPoint {
    return canvasPointToPdf(pxX, pxY, pageHeightPts, displayScale);
  }

  function toPx(point: PdfPoint): { left: number; top: number } {
    return pdfPointToCanvas(point, pageHeightPts, displayScale);
  }

  function pointFromClient(clientX: number, clientY: number): PdfPoint {
    const rect = overlayRef.current?.getBoundingClientRect();
    const left = rect?.left ?? 0;
    const top = rect?.top ?? 0;
    return toPdf(clientX - left, clientY - top);
  }

  // --- Tiradores de la anotación seleccionada, en puntos PDF ---
  function handlePositions(
    a: Annotation,
  ): { handle: ResizeHandle; point: PdfPoint }[] {
    if (a.kind === "line") {
      return [
        { handle: "start", point: a.start },
        { handle: "end", point: a.end },
      ];
    }
    const b = annotationBounds(a);
    return [
      { handle: "nw", point: { x: b.at.x, y: b.at.y + b.height } },
      { handle: "ne", point: { x: b.at.x + b.width, y: b.at.y + b.height } },
      { handle: "sw", point: { x: b.at.x, y: b.at.y } },
      { handle: "se", point: { x: b.at.x + b.width, y: b.at.y } },
    ];
  }

  function handleAt(a: Annotation, pdf: PdfPoint): ResizeHandle | null {
    const tolerance = HANDLE_HIT_PX / displayScale;
    for (const { handle, point } of handlePositions(a)) {
      if (Math.hypot(point.x - pdf.x, point.y - pdf.y) <= tolerance) {
        return handle;
      }
    }
    return null;
  }

  const isDragTool =
    activeTool === "line" || activeTool === "rect" || activeTool === "highlight";

  // --- Gestos de puntero (creación por arrastre + selección) ---
  const strokeHandlers = usePointerStroke({
    onStart: (p: StrokePoint) => {
      if (textDraft) {
        return;
      }
      const pdf = toPdf(p.x, p.y);
      if (isDragTool) {
        setDraft(beginDraft(activeTool as "line" | "rect" | "highlight", pdf));
        gestureRef.current = { type: "draft" };
        return;
      }
      if (activeTool === "freehand") {
        setDraft(beginDraft("freehand", pdf));
        gestureRef.current = { type: "draft" };
        return;
      }
      if (activeTool) {
        // Texto/imagen se colocan con clic, no con arrastre.
        gestureRef.current = null;
        return;
      }
      // Modo selección.
      const selected = pageAnnotations.find((a) => a.id === selectedId);
      if (selected) {
        const handle = handleAt(selected, pdf);
        if (handle) {
          gestureRef.current = { type: "resize", original: selected, handle };
          onGestureStart?.(); // (#37 R32)
          return;
        }
      }
      const hit = hitTest(pageAnnotations, pdf);
      if (hit) {
        if (hit.id !== selectedId) {
          onSelectionChange(hit.id);
        }
        gestureRef.current = { type: "move", original: hit, start: pdf };
        onGestureStart?.(); // (#37 R32)
      } else {
        gestureRef.current = { type: "deselect" };
      }
    },
    onMove: (p: StrokePoint) => {
      const pdf = toPdf(p.x, p.y);
      if (draft) {
        setDraft(updateDraft(draft, pdf));
        return;
      }
      const gesture = gestureRef.current;
      if (gesture?.type === "move") {
        onUpdateAnnotation(
          moveAnnotation(
            gesture.original,
            pdf.x - gesture.start.x,
            pdf.y - gesture.start.y,
          ),
        );
      } else if (gesture?.type === "resize") {
        onUpdateAnnotation(
          resizeAnnotation(gesture.original, gesture.handle, pdf),
        );
      }
    },
    onEnd: () => {
      if (draft) {
        const committed = commitDraft(
          draft,
          activePageIndex,
          idFactoryRef.current(),
          settings,
        );
        setDraft(null);
        gestureRef.current = null;
        if (committed) {
          onAddAnnotation(committed);
        }
        return;
      }
      const gesture = gestureRef.current;
      gestureRef.current = null;
      if (gesture?.type === "deselect") {
        onSelectionChange(null);
      } else if (gesture?.type === "move" || gesture?.type === "resize") {
        onGestureEnd?.(); // (#37 R32)
      }
    },
  });

  // Texto e imagen: colocación con clic (no arrastre).
  function handleClick(event: React.MouseEvent<HTMLDivElement>): void {
    if (textDraft) {
      return;
    }
    const pdf = pointFromClient(event.clientX, event.clientY);
    if (activeTool === "text") {
      setTextDraft({ at: pdf, value: "", editingId: null });
      return;
    }
    if (activeTool === "image") {
      if (!imageData) {
        // Sin imagen cargada NO se crea anotación; el aviso visible (R11) queda
        // como retroalimentación en lugar de fallar en silencio. (R12)
        return;
      }
      const id = idFactoryRef.current();
      onAddAnnotation(createImageAnnotation(id, activePageIndex, pdf, imageData));
      // Vuelve a modo selección para poder mover/redimensionar/eliminar la imagen
      // recién colocada; la selección la fija `addAnnotation`. (R9, R10)
      onSelectionChange(id);
      onToolChange(null);
    }
  }

  function handleDoubleClick(event: React.MouseEvent<HTMLDivElement>): void {
    const pdf = pointFromClient(event.clientX, event.clientY);
    const hit = hitTest(pageAnnotations, pdf);
    if (hit && hit.kind === "text") {
      onSelectionChange(hit.id);
      setTextDraft({ at: hit.at, value: hit.text, editingId: hit.id });
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (
      (event.key === "Delete" || event.key === "Backspace") &&
      selectedId &&
      !textDraft
    ) {
      event.preventDefault();
      onRemoveAnnotation(selectedId);
    }
  }

  function confirmText(): void {
    if (!textDraft) {
      return;
    }
    if (textDraft.editingId) {
      const existing = pageAnnotations.find((a) => a.id === textDraft.editingId);
      if (existing && existing.kind === "text") {
        if (textDraft.value.trim() === "") {
          onRemoveAnnotation(existing.id); // (R5)
        } else {
          onUpdateAnnotation(updateAnnotationText(existing, textDraft.value)); // (R7)
        }
      }
    } else {
      const created = createTextAnnotation(
        idFactoryRef.current(),
        activePageIndex,
        textDraft.at,
        textDraft.value,
        settings,
      );
      if (created) {
        onAddAnnotation(created); // (R4)
        // Tras colocar por clic un texto con contenido, vuelve a modo selección
        // para poder mover/redimensionar/eliminar la anotación. (R8, R10)
        onToolChange(null);
      }
    }
    setTextDraft(null);
  }

  const selectedAnnotation = pageAnnotations.find((a) => a.id === selectedId);

  return (
    <section
      aria-label="Editor de anotaciones"
      className="flex flex-col gap-4 rounded-2xl border border-line bg-card p-4 shadow-sm"
    >
      {/* Paleta de herramientas */}
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
            className={`rounded-xl border px-3 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mk-green motion-reduce:transition-none ${
              activeTool === tool
                ? "border-mk-green bg-hl-green text-mk-green"
                : "border-line bg-card text-ink hover:bg-hl-green/50"
            }`}
          >
            {TOOL_LABELS[tool]}
          </button>
        ))}
      </div>

      {/* Feedback herramienta Imagen sin imagen cargada: no es un no-op silencioso.
          (R11) */}
      {activeTool === "image" && !imageData && (
        <div
          role="alert"
          data-testid="image-tool-notice"
          className="rounded-xl border border-mk-orange/50 bg-hl-orange/40 px-3 py-2 text-sm text-ink"
        >
          Carga una imagen (JPG o PNG) para usar la herramienta de imagen.
        </div>
      )}

      {/* Barra de ajustes de estilo (R1, R2) */}
      <div
        role="group"
        aria-label="Ajustes de estilo"
        className="flex flex-wrap items-center gap-4"
      >
        <label className="flex items-center gap-2 text-sm font-medium text-ink">
          Color
          <input
            type="color"
            aria-label="Color de la anotación"
            value={rgbToHex(settings.color)}
            onChange={(e) =>
              onSettingsChange({ ...settings, color: hexToRgb(e.target.value) })
            }
            className="h-8 w-10 cursor-pointer rounded border border-line bg-white"
          />
        </label>
        <label className="flex items-center gap-2 text-sm font-medium text-ink">
          Tamaño de fuente
          <select
            aria-label="Tamaño de fuente"
            value={settings.fontSize}
            onChange={(e) =>
              onSettingsChange({ ...settings, fontSize: Number(e.target.value) })
            }
            className="rounded-lg border border-line bg-white px-2 py-1 text-sm text-ink"
          >
            {FONT_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm font-medium text-ink">
          Grosor
          <select
            aria-label="Grosor de trazo"
            value={settings.thickness}
            onChange={(e) =>
              onSettingsChange({ ...settings, thickness: Number(e.target.value) })
            }
            className="rounded-lg border border-line bg-white px-2 py-1 text-sm text-ink"
          >
            {THICKNESS_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        {selectedAnnotation && (
          <button
            type="button"
            onClick={() => onRemoveAnnotation(selectedAnnotation.id)}
            className="rounded-xl border border-mk-red/40 bg-hl-red/40 px-3 py-1.5 text-sm font-medium text-mk-red transition hover:bg-hl-red/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mk-red motion-reduce:transition-none"
          >
            Eliminar
          </button>
        )}
      </div>

      {/* Selector de páginas visual: elige la página a anotar */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-ink">Página a anotar</span>
        <PageRangeSelector
          pageCount={pageCount}
          value={selection}
          onChange={handleSelectionChange}
        />
      </div>

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
                ref={imgRef}
                src={imageUrl}
                alt={`Página ${String(activePageIndex + 1)} para anotar`}
                className="block max-w-full"
                onLoad={(e) => {
                  const img = e.currentTarget;
                  if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                    setNaturalSize({
                      width: img.naturalWidth,
                      height: img.naturalHeight,
                    });
                  }
                }}
              />
              {/* Capa interactiva + SVG fiel (R27, R28) */}
              <div
                ref={overlayRef}
                data-testid="annotation-overlay"
                tabIndex={0}
                onPointerDown={strokeHandlers.onPointerDown}
                onPointerMove={strokeHandlers.onPointerMove}
                onPointerUp={strokeHandlers.onPointerUp}
                onPointerLeave={strokeHandlers.onPointerLeave}
                onClick={handleClick}
                onDoubleClick={handleDoubleClick}
                onKeyDown={handleKeyDown}
                className="absolute inset-0 outline-none"
                style={{ cursor: activeTool ? "crosshair" : "default" }}
              >
                {displaySize && (
                  <svg
                    data-testid="annotation-layer"
                    width={displaySize.width}
                    height={displaySize.height}
                    viewBox={`0 0 ${String(displaySize.width)} ${String(
                      displaySize.height,
                    )}`}
                    className="pointer-events-none absolute inset-0"
                  >
                    {pageAnnotations.map((annotation) => (
                      <AnnotationShape
                        key={annotation.id}
                        annotation={annotation}
                        toPx={toPx}
                        scale={displayScale}
                        imageUrl={imageObjectUrls[annotation.id]}
                        selected={annotation.id === selectedId}
                      />
                    ))}
                    {draft && (
                      <DraftShape
                        draft={draft}
                        toPx={toPx}
                        scale={displayScale}
                        settings={settings}
                      />
                    )}
                    {selectedAnnotation && (
                      <SelectionOverlay
                        annotation={selectedAnnotation}
                        toPx={toPx}
                        handles={handlePositions(selectedAnnotation)}
                      />
                    )}
                  </svg>
                )}
                {textDraft && displaySize && (
                  <textarea
                    data-testid="annotation-text-input"
                    aria-label="Contenido del texto"
                    autoFocus
                    value={textDraft.value}
                    onChange={(e) =>
                      setTextDraft({ ...textDraft, value: e.target.value })
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        confirmText();
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        setTextDraft(null);
                      }
                    }}
                    rows={1}
                    className="absolute z-10 min-w-[6rem] resize-none rounded border border-mk-green bg-white/95 px-1 py-0.5 text-ink shadow-sm outline-none"
                    style={{
                      left: `${String(toPx(textDraft.at).left)}px`,
                      top: `${String(
                        toPx(textDraft.at).top - settings.fontSize * displayScale,
                      )}px`,
                      fontSize: `${String(settings.fontSize * displayScale)}px`,
                    }}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {textDraft && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={confirmText}
            className="rounded-xl bg-mk-green px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-mk-green/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mk-green motion-reduce:transition-none"
          >
            Añadir
          </button>
          <button
            type="button"
            onClick={() => setTextDraft(null)}
            className="rounded-xl border border-line px-4 py-1.5 text-sm font-medium text-ink transition hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mk-green motion-reduce:transition-none"
          >
            Cancelar
          </button>
        </div>
      )}
    </section>
  );
}

/** Renderiza UNA anotación colocada como nodo SVG fiel. (R27) */
function AnnotationShape({
  annotation,
  toPx,
  scale,
  imageUrl,
  selected,
}: {
  annotation: Annotation;
  toPx: (p: PdfPoint) => { left: number; top: number };
  scale: number;
  imageUrl: string | undefined;
  selected: boolean;
}): JSX.Element | null {
  const stroke = selected ? "#1f9d55" : undefined;
  switch (annotation.kind) {
    case "text": {
      const at = toPx(annotation.at);
      return (
        <text
          data-testid="annotation-text"
          data-annotation-id={annotation.id}
          x={at.left}
          y={at.top}
          fontSize={annotation.fontSize * scale}
          fill={cssColor(annotation.color)}
          style={{ fontFamily: "Helvetica, Arial, sans-serif" }}
        >
          {annotation.text}
        </text>
      );
    }
    case "highlight": {
      const topLeft = toPx({
        x: annotation.at.x,
        y: annotation.at.y + annotation.height,
      });
      return (
        <rect
          data-testid="annotation-highlight"
          data-annotation-id={annotation.id}
          x={topLeft.left}
          y={topLeft.top}
          width={annotation.width * scale}
          height={annotation.height * scale}
          fill={cssColor(annotation.color)}
          fillOpacity={annotation.opacity}
        />
      );
    }
    case "rect": {
      const topLeft = toPx({
        x: annotation.at.x,
        y: annotation.at.y + annotation.height,
      });
      return (
        <rect
          data-testid="annotation-rect"
          data-annotation-id={annotation.id}
          x={topLeft.left}
          y={topLeft.top}
          width={annotation.width * scale}
          height={annotation.height * scale}
          fill="none"
          stroke={cssColor(annotation.color)}
          strokeWidth={annotation.thickness * scale}
        />
      );
    }
    case "line": {
      const start = toPx(annotation.start);
      const end = toPx(annotation.end);
      return (
        <line
          data-testid="annotation-line"
          data-annotation-id={annotation.id}
          x1={start.left}
          y1={start.top}
          x2={end.left}
          y2={end.top}
          stroke={cssColor(annotation.color)}
          strokeWidth={annotation.thickness * scale}
        />
      );
    }
    case "freehand": {
      const points = annotation.points
        .map((p) => {
          const px = toPx(p);
          return `${String(px.left)},${String(px.top)}`;
        })
        .join(" ");
      return (
        <polyline
          data-testid="annotation-freehand"
          data-annotation-id={annotation.id}
          points={points}
          fill="none"
          stroke={cssColor(annotation.color)}
          strokeWidth={annotation.thickness * scale}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    }
    case "image": {
      const topLeft = toPx({
        x: annotation.at.x,
        y: annotation.at.y + annotation.height,
      });
      if (!imageUrl) {
        return null;
      }
      return (
        <image
          data-testid="annotation-image"
          data-annotation-id={annotation.id}
          href={imageUrl}
          x={topLeft.left}
          y={topLeft.top}
          width={annotation.width * scale}
          height={annotation.height * scale}
          stroke={stroke}
        />
      );
    }
  }
}

/** Forma provisional durante un arrastre de creación. (R9, R14) */
function DraftShape({
  draft,
  toPx,
  scale,
  settings,
}: {
  draft: Draft;
  toPx: (p: PdfPoint) => { left: number; top: number };
  scale: number;
  settings: ToolSettings;
}): JSX.Element {
  if (draft.kind === "freehand") {
    const points = draft.points
      .map((p) => {
        const px = toPx(p);
        return `${String(px.left)},${String(px.top)}`;
      })
      .join(" ");
    return (
      <polyline
        data-testid="annotation-draft"
        points={points}
        fill="none"
        stroke={cssColor(settings.color)}
        strokeWidth={settings.thickness * scale}
        strokeLinecap="round"
      />
    );
  }
  const start = toPx(draft.start);
  const current = toPx(draft.current);
  if (draft.tool === "line") {
    return (
      <line
        data-testid="annotation-draft"
        x1={start.left}
        y1={start.top}
        x2={current.left}
        y2={current.top}
        stroke={cssColor(settings.color)}
        strokeWidth={settings.thickness * scale}
      />
    );
  }
  const x = Math.min(start.left, current.left);
  const y = Math.min(start.top, current.top);
  const width = Math.abs(current.left - start.left);
  const height = Math.abs(current.top - start.top);
  return (
    <rect
      data-testid="annotation-draft"
      x={x}
      y={y}
      width={width}
      height={height}
      fill={draft.tool === "highlight" ? cssColor(settings.color) : "none"}
      fillOpacity={draft.tool === "highlight" ? settings.highlightOpacity : 0}
      stroke={cssColor(settings.color)}
      strokeWidth={
        draft.tool === "rect" ? settings.thickness * scale : 1
      }
      strokeDasharray={draft.tool === "highlight" ? "4 4" : undefined}
    />
  );
}

/** Contorno de selección y tiradores de la anotación seleccionada. (R18) */
function SelectionOverlay({
  annotation,
  toPx,
  handles,
}: {
  annotation: Annotation;
  toPx: (p: PdfPoint) => { left: number; top: number };
  handles: { handle: ResizeHandle; point: PdfPoint }[];
}): JSX.Element {
  const bounds = annotationBounds(annotation);
  const topLeft = toPx({ x: bounds.at.x, y: bounds.at.y + bounds.height });
  const bottomRight = toPx({
    x: bounds.at.x + bounds.width,
    y: bounds.at.y,
  });
  return (
    <g data-testid="annotation-selection">
      <rect
        x={Math.min(topLeft.left, bottomRight.left)}
        y={Math.min(topLeft.top, bottomRight.top)}
        width={Math.abs(bottomRight.left - topLeft.left)}
        height={Math.abs(bottomRight.top - topLeft.top)}
        fill="none"
        stroke="#1f9d55"
        strokeWidth={1}
        strokeDasharray="4 3"
      />
      {handles.map(({ handle, point }) => {
        const px = toPx(point);
        return (
          <rect
            key={handle}
            data-testid={`annotation-handle-${handle}`}
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
    </g>
  );
}
