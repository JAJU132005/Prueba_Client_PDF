import { useEffect, useMemo, useRef, useState } from "react";

import { PageRangeSelector } from "@/components/PageRangeSelector";
import { Dropzone } from "@/components/Dropzone";
import { ErrorBubble } from "@/components/ErrorBubble";
import { ProgressBar } from "@/components/ProgressBar";
import { ResultPanel } from "@/components/ResultPanel";
import { ToolPageHeader } from "@/components/ToolPageHeader";
import { downloadBlob, pdfBytesToBlob } from "@/lib/download";
import {
  DEFAULT_MAX_FILE_BYTES,
  type FileValidationConfig,
} from "@/lib/fileValidation";
import { createPdfjsThumbnailRenderer } from "@/lib/pdfjsThumbnailRenderer";
import {
  applySelection,
  createOrganizeModel,
  movePage,
  remainingCount,
  resolvePageOrder,
  toggleRemoved,
  type OrganizeModel,
} from "@/pdf/organizeModel";
import type { PageSelectionState } from "@/pdf/pageSelection";
import {
  renderThumbnails,
  type ThumbnailRenderer,
  type ThumbnailRendererFactory,
} from "@/pdf/thumbnails";
import {
  createPdfClient,
  isPdfWorkerError,
  type PdfClient,
} from "@/workers/pdfClient";

type Status = "idle" | "processing" | "done" | "error";

const PDF_VALIDATION: FileValidationConfig = {
  allowedExtensions: [".pdf"],
  allowedMimeTypes: ["application/pdf"],
  maxBytes: DEFAULT_MAX_FILE_BYTES,
};

/** Mapea el `name` estable del error de dominio a un mensaje legible. (R54) */
function messageForError(error: unknown): string {
  if (isPdfWorkerError(error)) {
    switch (error.name) {
      case "InvalidPdfError":
        return "El archivo no es un PDF válido.";
      case "OrganizeFailedError":
        return "No se pudo organizar el PDF.";
      case "InvalidPageOrderError":
        return "El orden de páginas no es válido.";
      default:
        break;
    }
  }
  return "Ocurrió un error inesperado al organizar el PDF.";
}

export interface OrganizePagesProps {
  /** Cliente inyectable (tests). Por defecto se crea uno con worker real. */
  client?: PdfClient;
  /**
   * Factoría de renderer inyectable (tests). Por defecto
   * `createPdfjsThumbnailRenderer` (pdf.js). (R46)
   */
  createRenderer?: ThumbnailRendererFactory;
}

export function OrganizePages(props?: OrganizePagesProps): JSX.Element {
  const client = props?.client;
  const createRenderer = props?.createRenderer ?? createPdfjsThumbnailRenderer;

  // El cliente (y su worker) se crea una sola vez; si se inyecta, se reutiliza.
  const pdfClient = useMemo(() => client ?? createPdfClient(), [client]);

  const [files, setFiles] = useState<File[]>([]);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [model, setModel] = useState<OrganizeModel>([]);
  const [thumbnails, setThumbnails] = useState<Record<number, string>>({});
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  const rendererRef = useRef<ThumbnailRenderer | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const dragPositionRef = useRef<number | null>(null);

  /** Aborta el render en curso y libera el renderer activo. (R47) */
  function teardownRenderer(): void {
    abortRef.current?.abort();
    abortRef.current = null;
    rendererRef.current?.destroy();
    rendererRef.current = null;
  }

  // Limpieza al desmontar: aborta el render y libera el renderer. (R47)
  useEffect(() => {
    return () => {
      teardownRenderer();
    };
  }, []);

  function resetResultState(): void {
    setStatus("idle");
    setProgress(0);
    setResultBlob(null);
    setErrorMessage(null);
  }

  async function loadFile(file: File): Promise<void> {
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const buffer = await file.arrayBuffer();
      const input = new Uint8Array(buffer);
      // pdf.js transfiere y detacha el ArrayBuffer de los bytes que recibe en
      // `getDocument({ data })`. Le entregamos una COPIA desechable y guardamos
      // `input` pristino para la exportación, de modo que su buffer no quede
      // detached al cruzar Comlink hacia el worker. (R1, R3)
      const renderer = await createRenderer(input.slice());
      if (controller.signal.aborted) {
        renderer.destroy();
        return;
      }
      rendererRef.current = renderer;
      setBytes(input);
      setModel(createOrganizeModel(renderer.pageCount()));
      // Render incremental: pinta una miniatura por página a medida que completa. (R45)
      await renderThumbnails(
        renderer,
        (index, url) =>
          setThumbnails((prev) => ({ ...prev, [index]: url })),
        controller.signal,
      );
    } catch {
      // No se pudo abrir/renderizar el PDF: mensaje de error y sin miniaturas. (R55)
      if (!controller.signal.aborted) {
        setRenderError("No se pudo abrir el PDF para mostrar las miniaturas.");
      }
    }
  }

  function handleFilesChange(next: File[]): void {
    // Cambio/limpieza de archivo: aborta el render previo y libera recursos. (R47)
    teardownRenderer();
    setFiles(next);
    setBytes(null);
    setModel([]);
    setThumbnails({});
    setRenderError(null);
    resetResultState();
    if (next.length > 0) {
      void loadFile(next[0]);
    }
  }

  const remaining = remainingCount(model);
  const canExport =
    bytes !== null &&
    model.length > 0 &&
    remaining > 0 &&
    status !== "processing";

  async function handleExport(): Promise<void> {
    if (bytes === null || remaining === 0) {
      return;
    }
    setStatus("processing");
    setProgress(0);
    setResultBlob(null);
    setErrorMessage(null);
    try {
      const pageOrder = resolvePageOrder(model);
      // El trabajo pesado (pdf-lib) corre en el worker; aquí solo se delega. (R51)
      const out = await pdfClient.organize(bytes, pageOrder, (p) =>
        setProgress(p),
      );
      // El Blob proviene de los bytes DEVUELTOS por organize, no del original. (R53)
      setResultBlob(pdfBytesToBlob(out));
      setStatus("done");
    } catch (error) {
      setErrorMessage(messageForError(error));
      setStatus("error");
    }
  }

  function handleDownload(): void {
    if (resultBlob) {
      // Descarga local vía URL de objeto; sin red. (R53)
      downloadBlob(resultBlob, "organizado.pdf");
    }
  }

  function handleReset(): void {
    teardownRenderer();
    setFiles([]);
    setBytes(null);
    setModel([]);
    setThumbnails({});
    setRenderError(null);
    resetResultState();
  }

  function handleDragStart(position: number): void {
    dragPositionRef.current = position;
  }

  function handleDrop(position: number): void {
    const from = dragPositionRef.current;
    dragPositionRef.current = null;
    if (from === null || from === position) {
      return;
    }
    // Reordena el modelo por drag&drop. (R48)
    setModel((prev) => movePage(prev, from, position));
  }

  function handleToggleRemoved(position: number): void {
    // Marca/desmarca la página para eliminar. (R49)
    setModel((prev) => toggleRemoved(prev, position));
  }

  // El OrganizeModel es la única fuente de verdad: la selección del selector es
  // una PROYECCIÓN derivada (páginas conservadas por `originalIndex`). (R28)
  const selectorValue: PageSelectionState = {
    pageCount: model.length,
    selected: new Set(
      model.filter((item) => !item.removed).map((item) => item.originalIndex),
    ),
  };

  function handleSelectionChange(next: PageSelectionState): void {
    // Se escribe de vuelta al modelo preservando el orden actual. (R28, R30)
    setModel((prev) => applySelection(prev, next.selected));
  }

  return (
    <section className="py-8">
      <ToolPageHeader toolId="organize" />

      <div className="mt-8 flex flex-col gap-6">
        <Dropzone
          files={files}
          onFilesChange={handleFilesChange}
          validation={PDF_VALIDATION}
          multiple={false}
          label="Arrastra tu PDF aquí — ¡prometo no chismosear!"
        />

        {renderError && <ErrorBubble message={renderError} />}

        {model.length > 0 && (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {model.map((item, position) => {
              const url = thumbnails[item.originalIndex];
              return (
                <li
                  key={item.originalIndex}
                  draggable
                  onDragStart={() => handleDragStart(position)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    handleDrop(position);
                  }}
                  data-testid={`page-${position}`}
                  className={`relative flex cursor-move flex-col gap-2 border-[2.2px] border-ink bg-white p-2 shadow-doodle transition ${
                    position % 2 === 0 ? "-rotate-1" : "rotate-1"
                  } ${item.removed ? "opacity-50" : ""}`}
                >
                  <span className="pin !left-1/2 -translate-x-1/2" aria-hidden="true" />
                  <div className="flex aspect-[3/4] items-center justify-center overflow-hidden bg-[#cfc9bb]">
                    {url ? (
                      <img
                        src={url}
                        alt={`Miniatura de la página ${item.originalIndex + 1}`}
                        className={`h-full w-full object-contain ${
                          item.removed ? "line-through" : ""
                        }`}
                      />
                    ) : (
                      <span className="hand soft text-sm">Cargando…</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="hand soft text-sm">
                      Página {item.originalIndex + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleToggleRemoved(position)}
                      aria-pressed={item.removed}
                      aria-label={
                        item.removed
                          ? `Conservar la página ${item.originalIndex + 1}`
                          : `Marcar la página ${item.originalIndex + 1} para eliminar`
                      }
                      className={`hand cursor-pointer border-none bg-transparent px-2 py-1 text-base ${
                        item.removed ? "text-mk-green" : "text-mk-red"
                      }`}
                    >
                      {item.removed ? "Conservar" : "Eliminar"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {model.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="hand text-lg text-ink">
              Seleccionar páginas a conservar
            </span>
            <PageRangeSelector
              pageCount={model.length}
              value={selectorValue}
              onChange={handleSelectionChange}
              thumbnails={thumbnails}
            />
          </div>
        )}

        {model.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void handleExport()}
              disabled={!canExport}
              className="btn btn-primary lv-media"
            >
              Exportar
            </button>
            {remaining === 0 && (
              <span className="hand text-base text-mk-red">
                No se pueden eliminar todas las páginas.
              </span>
            )}
          </div>
        )}

        {status === "processing" && (
          <div className="flex max-w-[640px] flex-col gap-2.5" aria-live="polite">
            <p className="hand m-0 text-xl text-ink">El panda despincha y repincha tus polaroids… <span className="scrawl soft">¡PLOP!</span></p>
            <ProgressBar value={progress} />
          </div>
        )}

        {status === "done" && resultBlob && (
          <ResultPanel
            fileName="organizado.pdf"
            onDownload={handleDownload}
            onReset={handleReset}
            costLevel="medium"
            title="¡Listo! Tablón ordenado y caja cerrada."
          />
        )}

        {status === "error" && errorMessage && (
          <ErrorBubble message={errorMessage} />
        )}
      </div>
    </section>
  );
}
