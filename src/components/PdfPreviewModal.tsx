import { useEffect, useRef, useState } from "react";

import { createPdfjsPageRasterizer } from "@/lib/pdfjsPageRasterizer";
import {
  createViewerState,
  goToPage,
  nextPage,
  prevPage,
  zoomIn,
  zoomOut,
  type ViewerState,
} from "@/pdf/previewViewer";
import type { PageRasterizer, PageRasterizerFactory } from "@/pdf/rasterize";

/** Selector de elementos enfocables para el focus trap. (R22) */
const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface PdfPreviewModalProps {
  /** Archivo PDF a previsualizar; sus bytes se leen frescos al abrir. */
  file: File;
  /** Cierra el visor (el padre desmonta el componente). */
  onClose: () => void;
  /**
   * Factoría de rasterizador inyectable (tests). Por defecto
   * `createPdfjsPageRasterizer`. Mismo patrón que `PdfToImages.createRasterizer`
   * y `Dropzone.countPages`.
   */
  createRasterizer?: PageRasterizerFactory;
}

export function PdfPreviewModal({
  file,
  onClose,
  createRasterizer = createPdfjsPageRasterizer,
}: PdfPreviewModalProps): JSX.Element {
  const [state, setState] = useState<ViewerState | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rasterizerRef = useRef<PageRasterizer | null>(null);
  const renderAbortRef = useRef<AbortController | null>(null);
  // Object URL vigente, en un ref para poder revocarla al sustituirla o cerrar
  // sin depender del ciclo de render de React. (R15)
  const imageUrlRef = useRef<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const currentPage = state?.currentPage;
  const scale = state?.scale;

  // Carga del documento al montar. Lee los bytes del `File` local (sin red) y
  // crea el rasterizador. Al cerrar/desmontar: aborta el render en curso (R14),
  // libera el documento (R13) y revoca la object URL vigente (R15).
  useEffect(() => {
    let cancelled = false;

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
        // pdf.js parsea en su propio worker; si el PDF no abre, rechaza. (R11)
        const rasterizer = await createRasterizer(bytes);
        if (cancelled) {
          rasterizer.destroy();
          return;
        }
        rasterizerRef.current = rasterizer;
        setState(createViewerState(rasterizer.pageCount()));
      } catch {
        // PDF inválido: error accesible y ninguna página rasterizada. (R12a, R12b)
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

  // Render LAZY de solo la página `currentPage`. Al cambiar `currentPage`/`scale`
  // la limpieza aborta el render anterior antes de iniciar el nuevo (R10) y se
  // revoca la object URL previa (R15). Solo se rasteriza la página visible (R9).
  useEffect(() => {
    if (currentPage === undefined || scale === undefined) {
      return;
    }
    const rasterizer = rasterizerRef.current;
    if (!rasterizer) {
      return;
    }

    const controller = new AbortController();
    renderAbortRef.current = controller;

    void (async (): Promise<void> => {
      try {
        // Índice 0-indexado de la única página que se rasteriza. (R9)
        const blob = await rasterizer.renderPage(
          currentPage - 1,
          { format: "png", scale },
          controller.signal,
        );
        if (controller.signal.aborted) {
          return;
        }
        // Object URL local desde el Blob en memoria; sin red. (R11)
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
  }, [currentPage, scale]);

  // Trasladar el foco a un elemento dentro del visor al abrir. (R20)
  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    // Cerrar con Escape. (R21)
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    // Focus trap: el foco no sale del contenedor con Tab/Shift+Tab. (R22)
    if (event.key !== "Tab") {
      return;
    }
    const container = dialogRef.current;
    if (!container) {
      return;
    }
    const focusables = Array.from(
      container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    );
    if (focusables.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (event.shiftKey) {
      if (active === first || !container.contains(active)) {
        event.preventDefault();
        last.focus();
      }
    } else if (active === last || !container.contains(active)) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleNext(): void {
    setState((prev) => (prev ? nextPage(prev) : prev));
  }
  function handlePrev(): void {
    setState((prev) => (prev ? prevPage(prev) : prev));
  }
  function handleGoTo(value: number): void {
    if (Number.isNaN(value)) {
      return;
    }
    setState((prev) => (prev ? goToPage(prev, value) : prev));
  }
  function handleZoomIn(): void {
    setState((prev) => (prev ? zoomIn(prev) : prev));
  }
  function handleZoomOut(): void {
    setState((prev) => (prev ? zoomOut(prev) : prev));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Vista previa de ${file.name}`}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-full w-full max-w-4xl flex-col gap-4 rounded-2xl bg-surface p-6 shadow-md motion-reduce:transition-none"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="truncate text-lg font-semibold text-text">
            {file.name}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar vista previa"
            className="rounded-md px-2 py-1 text-text-muted transition hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
          >
            ✕
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-danger/40 bg-danger/5 p-4 text-sm text-danger"
          >
            {error}
          </div>
        )}

        {!error && state && (
          <>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={handlePrev}
                disabled={state.currentPage <= 1}
                aria-label="Página anterior"
                className="rounded-md px-3 py-1.5 text-sm font-medium text-text transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40 motion-reduce:transition-none"
              >
                ‹
              </button>
              <span className="text-sm text-text-muted" aria-live="polite">
                {state.currentPage} de {state.pageCount}
              </span>
              <button
                type="button"
                onClick={handleNext}
                disabled={state.currentPage >= state.pageCount}
                aria-label="Página siguiente"
                className="rounded-md px-3 py-1.5 text-sm font-medium text-text transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40 motion-reduce:transition-none"
              >
                ›
              </button>
              <label className="ml-2 flex items-center gap-2 text-sm text-text-muted">
                Ir a
                <input
                  type="number"
                  min={1}
                  max={state.pageCount}
                  value={state.currentPage}
                  onChange={(event) =>
                    handleGoTo(Number.parseInt(event.target.value, 10))
                  }
                  aria-label="Ir a la página"
                  className="w-16 rounded-md border border-border bg-bg px-2 py-1 text-sm text-text"
                />
              </label>
              <button
                type="button"
                onClick={handleZoomOut}
                aria-label="Reducir zoom"
                className="ml-2 rounded-md px-3 py-1.5 text-sm font-medium text-text transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
              >
                −
              </button>
              <button
                type="button"
                onClick={handleZoomIn}
                aria-label="Aumentar zoom"
                className="rounded-md px-3 py-1.5 text-sm font-medium text-text transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
              >
                +
              </button>
            </div>

            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-xl bg-bg p-2">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={`Página ${state.currentPage} de ${file.name}`}
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <span className="text-sm text-text-muted" aria-live="polite">
                  Cargando página…
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
