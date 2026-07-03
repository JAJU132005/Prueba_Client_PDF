import { useEffect, useRef, useState } from "react";

import { createPdfjsPageRasterizer } from "@/lib/pdfjsPageRasterizer";
import {
  toPreviewPixels,
  type PreviewOverlay,
  type PreviewPageSize,
} from "@/pdf/previewModel";
import type { PageRasterizer, PageRasterizerFactory } from "@/pdf/rasterize";

/**
 * Ventana de coalescencia de cambios rápidos antes de rasterizar. Los ajustes de
 * `pageIndex`/`scale`/`file` dentro de esta ventana producen una sola
 * rasterización. (R16)
 */
export const PREVIEW_DEBOUNCE_MS = 200;

export interface LivePreviewProps {
  /** PDF fuente; sus bytes se leen frescos (sin red). */
  file: File;
  /** Índice 0-indexado de la única página a previsualizar. */
  pageIndex: number;
  /** Overlays de aproximación calculados por la herramienta con `previewModel`. */
  overlays: PreviewOverlay[];
  /** Escala de render de la página; por defecto 1 (1 punto PDF = 1 px). */
  scale?: number;
  /**
   * Factoría de rasterizador inyectable (tests). Por defecto
   * `createPdfjsPageRasterizer` — mismo mecanismo async cancelable que
   * `PdfPreviewModal` (#18). (R23a)
   */
  createRasterizer?: PageRasterizerFactory;
  /**
   * Notifica el tamaño REAL de la página (puntos PDF) derivado de la imagen
   * rasterizada, para que la herramienta anfitriona derive overlays consistentes
   * con `previewModel`. Opcional; no altera los props obligatorios. (R23a)
   */
  onPageSize?: (size: PreviewPageSize) => void;
  /**
   * Notifica el número de páginas del documento tras cargarlo, para que la
   * herramienta anfitriona derive overlays que dependen del total (p. ej. el
   * formato `n-of-total` de números de página). Opcional. (R23a)
   */
  onPageCount?: (count: number) => void;
}

/**
 * Panel de previsualización en vivo, tool-agnóstico y reutilizable por las
 * herramientas de la plantilla `04-editor-preview`. Rasteriza UNA sola página
 * real con el `PageRasterizer` existente (object URL en memoria) y superpone los
 * `overlays` recibidos por CSS. NO ensambla el PDF final ni importa módulos
 * específicos de una herramienta (`watermark.ts` / `pageNumbers.ts`). (R13–R24,
 * R23a, R23b)
 */
export function LivePreview({
  file,
  pageIndex,
  overlays,
  scale = 1,
  createRasterizer = createPdfjsPageRasterizer,
  onPageSize,
  onPageCount,
}: LivePreviewProps): JSX.Element {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Nº de páginas listo → dispara el efecto de rasterización tras cargar el doc.
  const [ready, setReady] = useState(0);
  // Tamaño real de la página en puntos PDF, derivado de la imagen rasterizada.
  const [pageSize, setPageSize] = useState<PreviewPageSize | null>(null);

  const rasterizerRef = useRef<PageRasterizer | null>(null);
  const renderAbortRef = useRef<AbortController | null>(null);
  // Object URL vigente en un ref para revocarla al sustituirla o al limpiar. (R20)
  const imageUrlRef = useRef<string | null>(null);
  // Callback del recuento de páginas en un ref: evita re-cargar el documento si
  // la herramienta anfitriona pasa una función inline.
  const onPageCountRef = useRef(onPageCount);
  onPageCountRef.current = onPageCount;

  // Carga del documento al montar / cambiar `file`. Lee los bytes del `File`
  // local (sin red) y crea el rasterizador. Cleanup: aborta el render en curso
  // (R17), libera el documento (R19) y revoca la object URL vigente (R20).
  useEffect(() => {
    let cancelled = false;
    setError(null);
    setImageUrl(null);
    setPageSize(null);
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
        // pdf.js parsea en su propio worker; si el PDF no abre, rechaza. (R21)
        const rasterizer = await createRasterizer(bytes);
        if (cancelled) {
          rasterizer.destroy();
          return;
        }
        rasterizerRef.current = rasterizer;
        onPageCountRef.current?.(rasterizer.pageCount());
        setReady((n) => n + 1);
      } catch {
        // PDF inválido: error accesible (R21) y ninguna página rasterizada (R22).
        if (!cancelled) {
          setError("El archivo no es un PDF válido.");
        }
      }
    })();

    return () => {
      cancelled = true;
      renderAbortRef.current?.abort(); // (R17)
      renderAbortRef.current = null;
      rasterizerRef.current?.destroy(); // (R19)
      rasterizerRef.current = null;
      if (imageUrlRef.current) {
        URL.revokeObjectURL(imageUrlRef.current); // (R20)
        imageUrlRef.current = null;
      }
    };
  }, [file, createRasterizer]);

  // Rasterización de SOLO la página `pageIndex`, con debounce. Los cambios de
  // `pageIndex`/`scale` dentro de la ventana se coalescen en una sola llamada
  // (R16); la limpieza aborta el render previo antes del nuevo (R17). (R13, R15)
  useEffect(() => {
    const rasterizer = rasterizerRef.current;
    if (!rasterizer) {
      return;
    }

    setLoading(true);
    const timer = setTimeout(() => {
      const controller = new AbortController();
      renderAbortRef.current = controller;

      void (async (): Promise<void> => {
        try {
          // Índice 0-indexado de la ÚNICA página que se rasteriza. (R15)
          const blob = await rasterizer.renderPage(
            pageIndex,
            { format: "png", scale },
            controller.signal,
          );
          if (controller.signal.aborted) {
            return;
          }
          // Object URL local desde el Blob en memoria; sin red. (R18)
          const url = URL.createObjectURL(blob);
          if (imageUrlRef.current) {
            URL.revokeObjectURL(imageUrlRef.current); // (R20)
          }
          imageUrlRef.current = url;
          setImageUrl(url);
          setLoading(false);
        } catch {
          if (!controller.signal.aborted) {
            setError("No se pudo mostrar la página.");
            setLoading(false);
          }
        }
      })();
    }, PREVIEW_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer); // coalesce cambios rápidos (R16)
      renderAbortRef.current?.abort(); // abortar render previo (R17)
    };
  }, [pageIndex, scale, ready]);

  // Deriva el tamaño real de la página (puntos PDF) del tamaño natural de la
  // imagen rasterizada: naturalPx = puntos * scale.
  function handleImageLoad(event: React.SyntheticEvent<HTMLImageElement>): void {
    const img = event.currentTarget;
    if (img.naturalWidth > 0 && img.naturalHeight > 0 && scale > 0) {
      const size: PreviewPageSize = {
        width: img.naturalWidth / scale,
        height: img.naturalHeight / scale,
      };
      setPageSize(size);
      onPageSize?.(size);
    }
  }

  return (
    <section
      aria-label="Vista previa del resultado"
      className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4 shadow-sm"
    >
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
                alt="Vista previa de la página con los cambios aplicados"
                onLoad={handleImageLoad}
                className="block max-w-full"
              />
              {pageSize &&
                overlays.map((overlay, index) => {
                  const rect = toPreviewPixels(overlay, pageSize, scale);
                  const common: React.CSSProperties = {
                    position: "absolute",
                    left: `${rect.left}px`,
                    top: `${rect.top}px`,
                    width: `${rect.width}px`,
                    height: `${rect.height}px`,
                    opacity: overlay.opacity,
                    transform: `rotate(${-overlay.rotationDegrees}deg)`,
                    transformOrigin: "center",
                    pointerEvents: "none",
                  };
                  if (overlay.content.kind === "text") {
                    return (
                      <span
                        key={index}
                        data-testid="preview-overlay"
                        style={{
                          ...common,
                          fontSize: `${overlay.content.fontSize * scale}px`,
                          lineHeight: `${rect.height}px`,
                          whiteSpace: "nowrap",
                          color: "#111",
                        }}
                      >
                        {overlay.content.text}
                      </span>
                    );
                  }
                  return (
                    <span
                      key={index}
                      data-testid="preview-overlay"
                      style={{
                        ...common,
                        border: "1px dashed currentColor",
                      }}
                    />
                  );
                })}
            </div>
          )}
          {loading && (
            <span
              className="absolute text-sm text-text-muted motion-reduce:animate-none"
              aria-live="polite"
            >
              Generando vista previa…
            </span>
          )}
        </div>
      )}
    </section>
  );
}
