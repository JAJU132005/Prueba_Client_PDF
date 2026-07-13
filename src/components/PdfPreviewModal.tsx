import { useEffect, useRef, useState } from "react";

import { PreviewModal } from "@/components/PreviewModal";
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

  // El chrome accesible (overlay, role dialog, focus trap, Escape, botón de
  // cierre, traslado de foco) lo aporta `PreviewModal`; aquí solo el cuerpo
  // pdf-específico (navegación, zoom, render lazy). (R7)
  return (
    <PreviewModal label={file.name} onClose={onClose}>
      {error && (
        <div
          role="alert"
          className="hand rounded-scrap border-[2.5px] border-mk-red p-4 text-[17px] text-mk-red"
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
              className="btn !px-3 !py-1 !text-base"
            >
              ‹
            </button>
            <span className="mono soft text-sm" aria-live="polite">
              {state.currentPage} de {state.pageCount}
            </span>
            <button
              type="button"
              onClick={handleNext}
              disabled={state.currentPage >= state.pageCount}
              aria-label="Página siguiente"
              className="btn !px-3 !py-1 !text-base"
            >
              ›
            </button>
            <label className="hand ml-2 flex items-center gap-2 text-base text-ink-soft">
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
                className="hand w-16 border-0 border-b-[2.5px] border-dashed border-ink bg-paper px-2 py-1 text-base text-ink outline-none"
              />
            </label>
            <button
              type="button"
              onClick={handleZoomOut}
              aria-label="Reducir zoom"
              className="btn ml-2 !px-3 !py-1 !text-base"
            >
              −
            </button>
            <button
              type="button"
              onClick={handleZoomIn}
              aria-label="Aumentar zoom"
              className="btn !px-3 !py-1 !text-base"
            >
              +
            </button>
          </div>

          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded border-[2.5px] border-ink bg-surface p-2 shadow-doodle">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={`Página ${state.currentPage} de ${file.name}`}
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <span className="hand soft text-base" aria-live="polite">
                Cargando página…
              </span>
            )}
          </div>
        </>
      )}
    </PreviewModal>
  );
}
