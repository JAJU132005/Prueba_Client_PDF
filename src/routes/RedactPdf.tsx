import { useEffect, useMemo, useRef, useState } from "react";

import { Dropzone } from "@/components/Dropzone";
import { ErrorBubble } from "@/components/ErrorBubble";
import { ProgressBar } from "@/components/ProgressBar";
import { ToolPageHeader } from "@/components/ToolPageHeader";
import { downloadBlob, pdfBytesToBlob } from "@/lib/download";
import {
  DEFAULT_MAX_FILE_BYTES,
  type FileValidationConfig,
} from "@/lib/fileValidation";
import { createPdfjsPageRasterizer } from "@/lib/pdfjsPageRasterizer";
import {
  extractPageTextGeometry,
  type TextGeometryExtractor,
} from "@/lib/pdfjsTextExtractor";
import { rasterizeRedactedPage } from "@/lib/redactionRasterizer";
import {
  addBox,
  boxesForPage,
  createBoxState,
  hitTestBox,
  moveBox,
  removeBox,
  resizeBox,
  selectBox,
  updateBox,
  type BoxHandle,
  type RedactBox,
} from "@/pdf/redactBoxModel";
import {
  normalizedBoxFromCanvas,
  normalizedBoxToPixels,
  pagesWithRedactions,
  type NormalizedBox,
  type RedactedPageImage,
} from "@/pdf/redact";
import type { PageRasterizer, PageRasterizerFactory } from "@/pdf/rasterize";
import { findMatches, type TextMatch } from "@/pdf/redactSearch";
import {
  createPdfClient,
  isPdfWorkerError,
  type PdfClient,
} from "@/workers/pdfClient";

type Status = "idle" | "processing" | "done" | "error";

/** Validación de entrada del Dropzone: un único PDF. */
export const PDF_VALIDATION: FileValidationConfig = {
  allowedExtensions: [".pdf"],
  allowedMimeTypes: ["application/pdf"],
  maxBytes: DEFAULT_MAX_FILE_BYTES,
};

/** Escala de render de la vista previa (1 punto PDF = 1 px). */
const PREVIEW_SCALE = 1;

/** Escala de render del bitmap redactado (más resolución = mejor calidad). */
const REDACT_RENDER_SCALE = 2;

/** Tiradores de esquina para redimensionar la caja seleccionada. */
const BOX_HANDLES: readonly BoxHandle[] = ["nw", "ne", "sw", "se"];

/**
 * Aviso permanente de que las páginas redactadas se convierten en imagen y
 * pierden el texto seleccionable a cambio de seguridad real. (R8)
 */
export const IMAGE_CONVERSION_WARNING =
  "Las páginas que redactes se convertirán en imagen y perderán el texto seleccionable. Es el precio de una redacción realmente segura.";

/** Mensaje cuando la búsqueda no encuentra ninguna coincidencia. (R6) */
export const NO_MATCHES_MESSAGE = "Sin coincidencias para ese término.";

/** Id por defecto: contador local suficiente para el uso interactivo. */
function defaultIdFactory(): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `box-${String(n)}-${String(Date.now())}`;
  };
}

/** Mapea el `name` estable del error de dominio a un mensaje legible. */
function messageForError(error: unknown): string {
  if (isPdfWorkerError(error)) {
    switch (error.name) {
      case "InvalidPdfError":
        return "El archivo no es un PDF válido.";
      case "RedactFailedError":
        return "No se pudo redactar el PDF.";
      default:
        break;
    }
  }
  return "Ocurrió un error inesperado al redactar el PDF.";
}

/** Gesto de puntero en curso sobre el overlay. */
type Gesture =
  | { mode: "draw"; start: { x: number; y: number } }
  | { mode: "move"; startNorm: { x: number; y: number }; orig: RedactBox }
  | { mode: "resize"; handle: BoxHandle; orig: RedactBox };

export interface RedactPdfProps {
  /**
   * Factoría de rasterizador inyectable (tests). Por defecto
   * `createPdfjsPageRasterizer` (pdf.js).
   */
  createRasterizer?: PageRasterizerFactory;
  /** Cliente inyectable (tests). Por defecto se crea uno con worker real. */
  client?: PdfClient;
  /**
   * Extractor de geometría de texto inyectable (tests). Por defecto
   * `extractPageTextGeometry` (pdf.js en su propio worker). (R10)
   */
  extractText?: TextGeometryExtractor;
  /** Generador de ids inyectable (tests deterministas). */
  createId?: () => string;
}

export function RedactPdf(props?: RedactPdfProps): JSX.Element {
  const createRasterizer =
    props?.createRasterizer ?? createPdfjsPageRasterizer;
  const extractText = props?.extractText ?? extractPageTextGeometry;
  const pdfClient = useMemo(
    () => props?.client ?? createPdfClient(),
    [props?.client],
  );

  const idFactoryRef = useRef<() => string>(props?.createId ?? defaultIdFactory());
  if (props?.createId) {
    idFactoryRef.current = props.createId;
  }
  const newId = (): string => idFactoryRef.current();

  const [files, setFiles] = useState<File[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [activePage, setActivePage] = useState(0);
  const [boxState, setBoxState] = useState(createBoxState);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [draft, setDraft] = useState<NormalizedBox | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [ready, setReady] = useState(0);

  // Estado de la búsqueda de texto.
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<TextMatch[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);

  const rasterizerRef = useRef<PageRasterizer | null>(null);
  const renderAbortRef = useRef<AbortController | null>(null);
  const imageUrlRef = useRef<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture | null>(null);

  // Carga del documento al montar / cambiar el archivo: lee los bytes locales
  // (sin red) y crea el rasterizador reutilizado para preview y export.
  useEffect(() => {
    if (files.length === 0) {
      return;
    }
    let cancelled = false;
    setErrorMessage(null);
    setImageUrl(null);
    imageUrlRef.current = null;

    void (async (): Promise<void> => {
      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(await files[0].arrayBuffer());
      } catch {
        if (!cancelled) {
          setErrorMessage("No se pudo leer el archivo.");
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
        setPageCount(rasterizer.pageCount());
        setReady((n) => n + 1);
      } catch {
        if (!cancelled) {
          setErrorMessage("El archivo no es un PDF válido.");
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
  }, [files, createRasterizer]);

  // Rasteriza SOLO la página activa para la vista previa; al cambiarla, aborta
  // el render previo.
  useEffect(() => {
    const rasterizer = rasterizerRef.current;
    if (!rasterizer || files.length === 0) {
      return;
    }
    const controller = new AbortController();
    renderAbortRef.current = controller;

    void (async (): Promise<void> => {
      try {
        const blob = await rasterizer.renderPage(
          activePage,
          { format: "png", scale: PREVIEW_SCALE },
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
          setErrorMessage("No se pudo mostrar la página.");
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [activePage, ready, files.length]);

  function resetProcessState(): void {
    setStatus("idle");
    setProgress(0);
    setErrorMessage(null);
  }

  function handleFilesChange(next: File[]): void {
    setFiles(next);
    setBoxState(createBoxState());
    setActivePage(0);
    setPageCount(0);
    setDraft(null);
    setQuery("");
    setMatches([]);
    setSearched(false);
    resetProcessState();
  }

  /** Métricas del puntero relativas al overlay: px, normalizadas y tamaño. */
  function overlayMetrics(event: React.MouseEvent<HTMLElement>): {
    px: number;
    py: number;
    nx: number;
    ny: number;
    width: number;
    height: number;
  } {
    const rect = overlayRef.current?.getBoundingClientRect();
    const left = rect?.left ?? 0;
    const top = rect?.top ?? 0;
    const width = rect?.width ?? 0;
    const height = rect?.height ?? 0;
    const px = event.clientX - left;
    const py = event.clientY - top;
    return {
      px,
      py,
      nx: width === 0 ? 0 : px / width,
      ny: height === 0 ? 0 : py / height,
      width,
      height,
    };
  }

  function handleOverlayMouseDown(
    event: React.MouseEvent<HTMLDivElement>,
  ): void {
    const m = overlayMetrics(event);
    // Selección de la caja bajo el punto (más reciente si hay solape). (R12)
    const hit = hitTestBox(boxesForPage(boxState, activePage), {
      x: m.nx,
      y: m.ny,
    });
    if (hit) {
      setBoxState((s) => selectBox(s, hit.id));
      gestureRef.current = {
        mode: "move",
        startNorm: { x: m.nx, y: m.ny },
        orig: hit,
      };
      setDraft(null);
      return;
    }
    // Zona vacía: deselecciona y comienza a dibujar una caja nueva.
    setBoxState((s) => selectBox(s, null));
    gestureRef.current = { mode: "draw", start: { x: m.px, y: m.py } };
    setDraft(null);
  }

  function handleHandleMouseDown(
    box: RedactBox,
    handle: BoxHandle,
  ): (event: React.MouseEvent<HTMLDivElement>) => void {
    return (event) => {
      event.stopPropagation();
      setBoxState((s) => selectBox(s, box.id));
      gestureRef.current = { mode: "resize", handle, orig: box };
      setDraft(null);
    };
  }

  function handleOverlayMouseMove(
    event: React.MouseEvent<HTMLDivElement>,
  ): void {
    const g = gestureRef.current;
    if (!g) {
      return;
    }
    const m = overlayMetrics(event);
    if (g.mode === "draw") {
      setDraft(
        normalizedBoxFromCanvas(
          g.start,
          { x: m.px, y: m.py },
          m.width,
          m.height,
          activePage,
        ),
      );
    } else if (g.mode === "move") {
      const dx = m.nx - g.startNorm.x;
      const dy = m.ny - g.startNorm.y;
      setBoxState((s) => updateBox(s, moveBox(g.orig, dx, dy))); // (R13, R16)
    } else {
      setBoxState((s) =>
        updateBox(s, resizeBox(g.orig, g.handle, { x: m.nx, y: m.ny })),
      ); // (R14, R15, R16)
    }
  }

  function handleOverlayMouseUp(
    event: React.MouseEvent<HTMLDivElement>,
  ): void {
    const g = gestureRef.current;
    gestureRef.current = null;
    setDraft(null);
    if (!g || g.mode !== "draw") {
      return;
    }
    const m = overlayMetrics(event);
    // Deriva la caja normalizada [0,1] en cualquier orden de arrastre. (R9)
    const box = normalizedBoxFromCanvas(
      g.start,
      { x: m.px, y: m.py },
      m.width,
      m.height,
      activePage,
    );
    if (box.width > 0 && box.height > 0) {
      setBoxState((s) =>
        addBox(s, { ...box, id: newId(), source: "manual" }),
      );
    }
  }

  function handleRemoveBox(id: string): void {
    setBoxState((s) => removeBox(s, id)); // (R17)
  }

  async function handleSearch(): Promise<void> {
    if (files.length === 0 || query.trim() === "") {
      return;
    }
    setSearching(true);
    setErrorMessage(null);
    try {
      const bytes = new Uint8Array(await files[0].arrayBuffer());
      // Extracción con pdf.js en su propio worker, sobre bytes en memoria. (R10)
      const pages = await extractText(bytes);
      const found = findMatches(pages, query); // (R1, R4, R5)
      setMatches(found);
      setSearched(true);
    } catch (error) {
      // PDF inválido u otro fallo de carga → mensaje legible, sin cajas. (R11)
      setErrorMessage(messageForError(error));
      setMatches([]);
      setSearched(true);
    } finally {
      setSearching(false);
    }
  }

  /** Añade la caja de una coincidencia al conjunto (source: "search"). (R7) */
  function markMatch(match: TextMatch): void {
    setBoxState((s) =>
      addBox(s, { ...match.box, id: newId(), source: "search" }),
    );
  }

  /** Añade la caja de TODAS las coincidencias (acción masiva). (R8) */
  function markAllMatches(): void {
    setBoxState((s) => {
      let next = s;
      for (const match of matches) {
        next = addBox(next, {
          ...match.box,
          id: newId(),
          source: "search",
        });
      }
      return next;
    });
  }

  const pageBoxes = boxesForPage(boxState, activePage);
  const totalBoxes = boxState.boxes.length;
  const canRedact =
    files.length > 0 && totalBoxes > 0 && status !== "processing";

  async function handleRedact(): Promise<void> {
    const rasterizer = rasterizerRef.current;
    if (files.length === 0 || totalBoxes === 0 || !rasterizer) {
      return;
    }
    setStatus("processing");
    setProgress(0);
    setErrorMessage(null);

    try {
      const input = new Uint8Array(await files[0].arrayBuffer());
      const controller = new AbortController();
      // Proyecta RedactBox → NormalizedBox: se descartan id/source y entran por
      // el MISMO pipeline seguro de #27 (sin ramas nuevas). (R9, R21)
      const allBoxes: NormalizedBox[] = boxState.boxes.map((b) => ({
        pageIndex: b.pageIndex,
        left: b.left,
        top: b.top,
        width: b.width,
        height: b.height,
      }));
      // SOLO las páginas con cajas se rasterizan (destruyen su capa de texto);
      // las intactas se copiarán vectoriales en el worker. (R19, R22)
      const pages = pagesWithRedactions(allBoxes);
      const redactedPages: RedactedPageImage[] = [];
      for (const pageIndex of pages) {
        const pageOfBoxes = allBoxes.filter((b) => b.pageIndex === pageIndex);
        // El bitmap ya trae las cajas OPACAS pintadas antes de incrustar. (R20)
        const redacted = await rasterizeRedactedPage(
          rasterizer,
          pageIndex,
          pageOfBoxes,
          { format: "png", scale: REDACT_RENDER_SCALE },
          controller.signal,
        );
        redactedPages.push(redacted);
      }
      // El ensamblado pesado (pdf-lib) corre en el worker. (R23)
      const bytes = await pdfClient.redact(input, redactedPages, (p) => {
        setProgress(p);
      });
      // Descarga local por Blob; sin red. (R24)
      downloadBlob(pdfBytesToBlob(bytes), "redactado.pdf");
      setStatus("done");
    } catch (error) {
      setErrorMessage(messageForError(error));
      setStatus("error");
    }
  }

  return (
    <section className="py-8">
      <ToolPageHeader toolId="redact" />

      {/* Ficha del expediente: aviso de rasterizado (R8; texto ÍNTEGRO, #28 R37) */}
      <div
        role="note"
        className="relative mt-4 max-w-xl border-[2.5px] border-ink bg-card p-4 shadow-doodle"
      >
        <span
          className="absolute -top-2 left-5 h-2 w-6 -rotate-3 rounded-sm bg-[#98a0a8]"
          aria-hidden="true"
        />
        <p className="hand m-0 text-lg text-ink">
          Ficha del expediente — léela en serio:
        </p>
        <p className="mb-0 mt-2 text-[15px] font-semibold leading-relaxed">
          {IMAGE_CONVERSION_WARNING}
        </p>
      </div>

      <div className="mt-8 flex flex-col gap-6">
        <Dropzone
          files={files}
          onFilesChange={handleFilesChange}
          validation={PDF_VALIDATION}
          multiple={false}
          label="Arrastra tu PDF aquí — ¡prometo no chismosear!"
        />

        {files.length > 0 && pageCount > 0 && (
          <div className="flex flex-col gap-4">
            {/* Panel de búsqueda de texto */}
            <div className="flex flex-col gap-2 rounded-xl border border-line p-3">
              <label htmlFor="redact-search" className="hand text-lg text-ink">
                Buscar texto para tachar
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  id="redact-search"
                  type="text"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                  }}
                  placeholder="Escribe un término…"
                  className="min-w-[12rem] flex-1 rounded-lg border border-line px-3 py-1.5 text-sm text-ink"
                />
                <button
                  type="button"
                  onClick={() => void handleSearch()}
                  disabled={query.trim() === "" || searching}
                  className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink disabled:opacity-40"
                >
                  Buscar
                </button>
                {matches.length > 0 && (
                  <button
                    type="button"
                    onClick={markAllMatches}
                    className="rounded-lg border border-ink px-3 py-1.5 text-sm text-ink"
                  >
                    Marcar todas ({matches.length})
                  </button>
                )}
              </div>

              {searched && matches.length === 0 && !errorMessage && (
                <p className="hand soft m-0 text-base" role="status">
                  {NO_MATCHES_MESSAGE}
                </p>
              )}

              {matches.length > 0 && (
                <ul
                  data-testid="match-list"
                  className="flex max-h-48 flex-col gap-1 overflow-auto"
                >
                  {matches.map((match, i) => (
                    <li
                      key={i}
                      data-testid="match-item"
                      className="flex items-center justify-between rounded-lg border border-line px-3 py-1.5 text-sm text-ink"
                    >
                      <span>
                        Pág. {match.box.pageIndex + 1} — “{match.snippet}”
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          markMatch(match);
                        }}
                        className="text-sm text-mk-red hover:underline"
                      >
                        Marcar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Navegación de páginas */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="hand text-lg text-ink">Página</span>
              <button
                type="button"
                onClick={() => setActivePage((p) => Math.max(0, p - 1))}
                disabled={activePage === 0}
                className="rounded-lg border border-line px-3 py-1 text-sm text-ink disabled:opacity-40"
              >
                Anterior
              </button>
              <span className="hand soft text-base">
                {activePage + 1} / {pageCount}
              </span>
              <button
                type="button"
                onClick={() =>
                  setActivePage((p) => Math.min(pageCount - 1, p + 1))
                }
                disabled={activePage >= pageCount - 1}
                className="rounded-lg border border-line px-3 py-1 text-sm text-ink disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>

            {/* Lienzo de la página activa con overlay para dibujar/editar cajas */}
            <div className="relative flex min-h-[8rem] items-center justify-center overflow-auto rounded-xl bg-paper p-2">
              {imageUrl && (
                <div className="relative">
                  <img
                    src={imageUrl}
                    alt={`Página ${String(activePage + 1)} para redactar`}
                    className="block max-w-full select-none"
                    draggable={false}
                  />
                  <div
                    ref={overlayRef}
                    data-testid="redaction-overlay"
                    onMouseDown={handleOverlayMouseDown}
                    onMouseMove={handleOverlayMouseMove}
                    onMouseUp={handleOverlayMouseUp}
                    onMouseLeave={handleOverlayMouseUp}
                    className="absolute inset-0 cursor-crosshair touch-none"
                  >
                    {pageBoxes.map((box) => {
                      // El overlay se posiciona en porcentaje del lienzo con la
                      // misma escala de `normalizedBoxToPixels`. Relleno OPACO. (R20)
                      const pct = normalizedBoxToPixels(box, 100, 100);
                      const selected = boxState.selectedId === box.id;
                      return (
                        <div key={box.id}>
                          <div
                            data-testid="redaction-box"
                            data-selected={selected ? "true" : "false"}
                            className={`absolute bg-black ${
                              selected ? "ring-2 ring-mk-red" : ""
                            }`}
                            style={{
                              left: `${String(pct.left)}%`,
                              top: `${String(pct.top)}%`,
                              width: `${String(pct.width)}%`,
                              height: `${String(pct.height)}%`,
                              opacity: 1,
                            }}
                          />
                          {selected &&
                            BOX_HANDLES.map((handle) => {
                              const hx =
                                handle === "nw" || handle === "sw"
                                  ? pct.left
                                  : pct.left + pct.width;
                              const hy =
                                handle === "nw" || handle === "ne"
                                  ? pct.top
                                  : pct.top + pct.height;
                              return (
                                <div
                                  key={handle}
                                  data-testid={`redaction-handle-${handle}`}
                                  onMouseDown={handleHandleMouseDown(box, handle)}
                                  className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize border border-white bg-mk-red"
                                  style={{
                                    left: `${String(hx)}%`,
                                    top: `${String(hy)}%`,
                                  }}
                                />
                              );
                            })}
                        </div>
                      );
                    })}
                    {draft && draft.width > 0 && draft.height > 0 && (
                      <div
                        data-testid="redaction-draft"
                        className="absolute border border-black/70 bg-black/60"
                        style={{
                          left: `${String(draft.left * 100)}%`,
                          top: `${String(draft.top * 100)}%`,
                          width: `${String(draft.width * 100)}%`,
                          height: `${String(draft.height * 100)}%`,
                        }}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Lista de cajas de la página activa */}
            <div className="flex flex-col gap-2">
              <span className="hand text-lg text-ink">
                Cajas en esta página: {pageBoxes.length}
              </span>
              {pageBoxes.length > 0 && (
                <ul className="flex flex-col gap-1">
                  {pageBoxes.map((box, i) => (
                    <li
                      key={box.id}
                      className="flex items-center justify-between rounded-lg border border-line px-3 py-1.5 text-sm text-ink"
                    >
                      <span>
                        Caja {i + 1} ({box.source === "search" ? "búsqueda" : "manual"}) —{" "}
                        {Math.round(box.width * 100)}% × {Math.round(box.height * 100)}%
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          handleRemoveBox(box.id);
                        }}
                        className="text-sm text-mk-red hover:underline"
                      >
                        Quitar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleRedact()}
            disabled={!canRedact}
            className="btn btn-primary lv-media"
          >
            Redactar y descargar
          </button>
          {files.length === 0 && (
            <span className="hand soft text-base">
              Selecciona un PDF y dibuja las zonas a redactar.
            </span>
          )}
          {files.length > 0 && totalBoxes === 0 && (
            <span className="hand soft text-base">
              Dibuja o busca al menos una caja de redacción para continuar.
            </span>
          )}
        </div>

        {status === "processing" && (
          <div className="flex max-w-[640px] flex-col gap-2.5" aria-live="polite">
            <p className="hand m-0 text-xl text-ink">El panda agente tacha con marcador grueso… <span className="scrawl soft">shhh…</span></p>
            <ProgressBar value={progress} />
          </div>
        )}

        {status === "done" && (
          <div className="card hand max-w-[640px] text-xl text-ink">
            <span className="stamp-topsecret mr-2">CLASIFICADO ✔</span>
            Redacción completada. Se ha descargado el PDF redactado.
          </div>
        )}

        {errorMessage && <ErrorBubble message={errorMessage} />}
      </div>
    </section>
  );
}
