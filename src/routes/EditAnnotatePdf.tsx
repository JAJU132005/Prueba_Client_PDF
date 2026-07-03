import { useEffect, useMemo, useRef, useState } from "react";

import { AnnotationEditor } from "@/components/AnnotationEditor";
import { Dropzone } from "@/components/Dropzone";
import { LivePreview } from "@/components/LivePreview";
import { PdfPreviewModal } from "@/components/PdfPreviewModal";
import { ResourceCostNote } from "@/components/ResourceCostNote";
import { downloadBlob, pdfBytesToBlob } from "@/lib/download";
import {
  DEFAULT_MAX_FILE_BYTES,
  type FileValidationConfig,
} from "@/lib/fileValidation";
import { pdfjsPageCount } from "@/lib/pdfjsPageCounter";
import type { Annotation } from "@/pdf/annotate";
import {
  addAnnotation,
  createAnnotationState,
  type AnnotationTool,
} from "@/pdf/annotationModel";
import { countPdfPages, type PageCounter } from "@/pdf/pageCount";
import type { PreviewOverlay } from "@/pdf/previewModel";
import type { PageRasterizerFactory } from "@/pdf/rasterize";
import {
  createPdfClient,
  isPdfWorkerError,
  type PdfClient,
} from "@/workers/pdfClient";

type Status = "idle" | "processing" | "done" | "error";

/** Validación del Dropzone del PDF: un único PDF. */
export const PDF_VALIDATION: FileValidationConfig = {
  allowedExtensions: [".pdf"],
  allowedMimeTypes: ["application/pdf"],
  maxBytes: DEFAULT_MAX_FILE_BYTES,
};

/** Validación del Dropzone de imagen de anotación: JPG/PNG. */
export const IMAGE_VALIDATION: FileValidationConfig = {
  allowedExtensions: [".jpg", ".jpeg", ".png"],
  allowedMimeTypes: ["image/jpeg", "image/png"],
  maxBytes: DEFAULT_MAX_FILE_BYTES,
};

/** Aviso visible: se añade una capa, no se reescribe el texto original. (R3) */
export const LAYER_NOTICE =
  "Se añade una capa de anotación encima del documento; no se reescribe el texto original del PDF.";

/** Mapea el `name` estable del error de dominio a un mensaje legible. */
function messageForError(error: unknown): string {
  if (isPdfWorkerError(error)) {
    switch (error.name) {
      case "InvalidPdfError":
        return "El archivo no es un PDF válido.";
      case "InvalidImageError":
        return "Una de las imágenes de anotación no es un JPG o PNG válido.";
      case "AnnotateFailedError":
        return "No se pudo aplanar las anotaciones en el PDF.";
      default:
        break;
    }
  }
  return "Ocurrió un error inesperado al anotar el PDF.";
}

/** Ancho aproximado del texto en puntos PDF para el overlay de vista previa. */
function approxTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.6;
}

export interface EditAnnotatePdfProps {
  /** Cliente inyectable (tests). Por defecto se crea uno con worker real. */
  client?: PdfClient;
  /** Contador de páginas inyectable (tests). Por defecto `pdfjsPageCount`. */
  countPages?: PageCounter;
  /** Factoría de rasterizador para el editor/preview (tests). */
  createRasterizer?: PageRasterizerFactory;
  /** Generador de ids inyectable (tests deterministas). */
  createId?: () => string;
}

/**
 * Herramienta "Editar y anotar PDF" (#23). Dropzone (1 PDF) → editor de capa de
 * anotaciones → exporta llamando `pdfClient.annotate` (aplanado en el worker) →
 * descarga local del Blob y previsualización opcional del PDF exportado. Aclara
 * que se añade una CAPA, no se reescribe el texto original (R3). Cero red. La
 * UI no contiene lógica de PDF: delega en el dominio y el worker.
 */
export function EditAnnotatePdf({
  client,
  countPages,
  createRasterizer,
  createId,
}: EditAnnotatePdfProps = {}): JSX.Element {
  const pdfClient = useMemo(() => client ?? createPdfClient(), [client]);
  const counter = countPages ?? pdfjsPageCount;

  const [files, setFiles] = useState<File[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [editorState, setEditorState] = useState(createAnnotationState());
  const [activeTool, setActiveTool] = useState<AnnotationTool | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imageData, setImageData] = useState<Uint8Array | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Carga los bytes de la imagen de anotación cuando cambia el archivo elegido.
  useEffect(() => {
    if (imageFiles.length === 0) {
      setImageData(null);
      return;
    }
    let cancelled = false;
    void (async (): Promise<void> => {
      const bytes = new Uint8Array(await imageFiles[0].arrayBuffer());
      if (!cancelled) {
        setImageData(bytes);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [imageFiles]);

  const annotations = editorState.annotations;

  // Overlays de sólo lectura para LivePreview: únicamente texto e imagen (los
  // tipos representables por `PreviewContent`); los geométricos se ven en el
  // lienzo del editor. Se filtran por la página activa. (T14, R24)
  const previewOverlays: PreviewOverlay[] = useMemo(() => {
    const result: PreviewOverlay[] = [];
    for (const annotation of annotations) {
      if (annotation.pageIndex !== activePageIndex) {
        continue;
      }
      if (annotation.kind === "text") {
        result.push({
          x: annotation.at.x,
          y: annotation.at.y,
          width: approxTextWidth(annotation.text, annotation.fontSize),
          height: annotation.fontSize,
          opacity: 1,
          rotationDegrees: 0,
          content: {
            kind: "text",
            text: annotation.text,
            fontSize: annotation.fontSize,
          },
        });
      } else if (annotation.kind === "image") {
        result.push({
          x: annotation.at.x,
          y: annotation.at.y,
          width: annotation.width,
          height: annotation.height,
          opacity: 1,
          rotationDegrees: 0,
          content: { kind: "image" },
        });
      }
    }
    return result;
  }, [annotations, activePageIndex]);

  const canExport =
    files.length > 0 && annotations.length > 0 && status !== "processing";

  async function loadPageCount(file: File): Promise<void> {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const buffer = await file.arrayBuffer();
    const result = await countPdfPages(
      new Uint8Array(buffer),
      counter,
      controller.signal,
    );
    if (controller.signal.aborted) return;
    if (result.status === "counted") {
      setPageCount(result.pages);
      setActivePageIndex(0);
    } else {
      setPageCount(0);
    }
  }

  function handleFilesChange(next: File[]): void {
    abortRef.current?.abort();
    setFiles(next);
    setPageCount(0);
    setActivePageIndex(0);
    setEditorState(createAnnotationState());
    setActiveTool(null);
    setStatus("idle");
    setProgress(0);
    setResultBlob(null);
    setErrorMessage(null);
    setShowPreview(false);
    if (next.length > 0) {
      void loadPageCount(next[0]);
    }
  }

  function handleAddAnnotation(annotation: Annotation): void {
    setEditorState((prev) => addAnnotation(prev, annotation));
  }

  async function handleExport(): Promise<void> {
    if (files.length === 0 || annotations.length === 0) {
      return;
    }
    setStatus("processing");
    setProgress(0);
    setResultBlob(null);
    setErrorMessage(null);

    try {
      const buffer = await files[0].arrayBuffer();
      const bytes = await pdfClient.annotate(
        new Uint8Array(buffer),
        annotations,
        (p) => setProgress(p),
      );
      setResultBlob(pdfBytesToBlob(bytes));
      setStatus("done");
    } catch (error) {
      setErrorMessage(messageForError(error));
      setStatus("error");
    }
  }

  function handleDownload(): void {
    if (resultBlob) {
      downloadBlob(resultBlob, "anotado.pdf");
    }
  }

  function handleReset(): void {
    abortRef.current?.abort();
    setFiles([]);
    setPageCount(0);
    setActivePageIndex(0);
    setEditorState(createAnnotationState());
    setActiveTool(null);
    setImageFiles([]);
    setImageData(null);
    setStatus("idle");
    setProgress(0);
    setResultBlob(null);
    setErrorMessage(null);
    setShowPreview(false);
  }

  const resultFile = useMemo(
    () => (resultBlob ? new File([resultBlob], "anotado.pdf", { type: "application/pdf" }) : null),
    [resultBlob],
  );

  return (
    <section className="py-8">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold text-text md:text-4xl">
            Editar y anotar PDF
          </h1>
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            100% local
          </span>
        </div>
        <p className="max-w-2xl text-base text-text-muted">
          Añade cajas de texto, resaltados, dibujos, líneas, rectángulos e
          imágenes sobre las páginas que elijas. Tu archivo se procesa en tu
          navegador y nunca se sube a ningún servidor.
        </p>
        <ResourceCostNote toolId="annotate" />
        {/* Aviso de capa, no reescritura (R3) */}
        <div
          role="note"
          className="rounded-xl border border-border bg-primary/5 p-3 text-sm text-text-muted"
        >
          {LAYER_NOTICE}
        </div>
      </header>

      <div className="mt-8 flex flex-col gap-6">
        <Dropzone
          files={files}
          onFilesChange={handleFilesChange}
          validation={PDF_VALIDATION}
          multiple={false}
          label="Arrastra tu PDF o haz clic para seleccionar"
        />

        {files.length > 0 && pageCount > 0 && (
          <>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-text">
                Imagen para la herramienta de imagen (opcional)
              </span>
              <Dropzone
                files={imageFiles}
                onFilesChange={setImageFiles}
                validation={IMAGE_VALIDATION}
                multiple={false}
                label="Arrastra una imagen (JPG o PNG) o haz clic para seleccionar"
              />
            </div>

            <AnnotationEditor
              file={files[0]}
              pageCount={pageCount}
              annotations={annotations}
              activePageIndex={activePageIndex}
              onActivePageChange={setActivePageIndex}
              activeTool={activeTool}
              onToolChange={setActiveTool}
              onAddAnnotation={handleAddAnnotation}
              imageData={imageData}
              createId={createId}
              createRasterizer={createRasterizer}
            />

            <LivePreview
              file={files[0]}
              pageIndex={activePageIndex}
              overlays={previewOverlays}
              createRasterizer={createRasterizer}
            />
          </>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={!canExport}
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
          >
            Exportar PDF anotado
          </button>
          {files.length === 0 && (
            <span className="text-sm text-text-muted">
              Selecciona un PDF para anotar.
            </span>
          )}
          {files.length > 0 && annotations.length === 0 && (
            <span className="text-sm text-text-muted">
              Añade al menos una anotación con las herramientas.
            </span>
          )}
        </div>

        {status === "processing" && (
          <div className="flex flex-col gap-2" aria-live="polite">
            <div className="flex items-center justify-between text-sm text-text-muted">
              <span>Procesando localmente…</span>
              <span>{Math.round(progress * 100)}%</span>
            </div>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={1}
              aria-valuenow={progress}
              className="h-2 w-full overflow-hidden rounded-full bg-border"
            >
              <div
                className="h-full bg-primary transition-[width] duration-150 ease-out motion-reduce:transition-none"
                style={{ width: `${String(progress * 100)}%` }}
              />
            </div>
          </div>
        )}

        {status === "done" && resultBlob && (
          <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6">
            <p className="text-sm font-medium text-text">
              ¡Listo! Tu PDF anotado está preparado.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleDownload}
                className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg motion-reduce:transition-none"
              >
                Descargar
              </button>
              <button
                type="button"
                onClick={() => setShowPreview(true)}
                className="rounded-xl border border-border px-5 py-2.5 text-sm font-semibold text-text transition hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
              >
                Previsualizar
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="rounded-xl border border-border px-5 py-2.5 text-sm font-semibold text-text transition hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
              >
                Anotar otro
              </button>
            </div>
          </div>
        )}

        {status === "error" && errorMessage && (
          <div
            role="alert"
            className="rounded-2xl border border-danger/40 bg-danger/5 p-4 text-sm text-danger"
          >
            {errorMessage}
          </div>
        )}
      </div>

      {showPreview && resultFile && (
        <PdfPreviewModal
          file={resultFile}
          onClose={() => setShowPreview(false)}
          createRasterizer={createRasterizer}
        />
      )}
    </section>
  );
}
