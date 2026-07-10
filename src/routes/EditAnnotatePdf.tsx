import { useEffect, useMemo, useRef, useState } from "react";

import { AnnotationEditor } from "@/components/AnnotationEditor";
import { Dropzone } from "@/components/Dropzone";
import { ErrorBubble } from "@/components/ErrorBubble";
import { ProgressBar } from "@/components/ProgressBar";
import { ResultPanel } from "@/components/ResultPanel";
import { ToolPageHeader } from "@/components/ToolPageHeader";
import { LivePreview } from "@/components/LivePreview";
import { PdfPreviewModal } from "@/components/PdfPreviewModal";
import { downloadBlob, pdfBytesToBlob } from "@/lib/download";
import {
  DEFAULT_MAX_FILE_BYTES,
  type FileValidationConfig,
} from "@/lib/fileValidation";
import { pdfjsPageCount } from "@/lib/pdfjsPageCounter";
import type { Annotation } from "@/pdf/annotate";
import {
  DEFAULT_TOOL_SETTINGS,
  approxTextSize,
  type ToolSettings,
} from "@/pdf/annotationInteraction";
import {
  addAnnotation,
  createAnnotationState,
  removeAnnotation,
  selectAnnotation,
  updateAnnotation,
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
  const [settings, setSettings] = useState<ToolSettings>(DEFAULT_TOOL_SETTINGS);
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
          width: approxTextSize(annotation.text, annotation.fontSize).width,
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

  function handleUpdateAnnotation(annotation: Annotation): void {
    setEditorState((prev) => updateAnnotation(prev, annotation));
  }

  function handleRemoveAnnotation(id: string): void {
    setEditorState((prev) => removeAnnotation(prev, id));
  }

  function handleSelectionChange(id: string | null): void {
    setEditorState((prev) => selectAnnotation(prev, id));
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
      <ToolPageHeader toolId="annotate" />

      {/* Aviso de capa, no reescritura (R3; texto ÍNTEGRO, #28 R37) */}
      <div role="note" className="postit mt-4 max-w-xl text-ink">
        {LAYER_NOTICE}
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
          <>
            <div className="flex flex-col gap-2">
              <span className="hand text-lg text-ink">
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
              onUpdateAnnotation={handleUpdateAnnotation}
              onRemoveAnnotation={handleRemoveAnnotation}
              selectedId={editorState.selectedId}
              onSelectionChange={handleSelectionChange}
              settings={settings}
              onSettingsChange={setSettings}
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
            className="btn btn-primary lv-pesada"
          >
            Exportar PDF anotado
          </button>
          {files.length === 0 && (
            <span className="hand soft text-base">
              Selecciona un PDF para anotar.
            </span>
          )}
          {files.length > 0 && annotations.length === 0 && (
            <span className="hand soft text-base">
              Añade al menos una anotación con las herramientas.
            </span>
          )}
        </div>

        {status === "processing" && (
          <div className="flex max-w-[640px] flex-col gap-2.5" aria-live="polite">
            <p className="hand m-0 text-xl text-ink">El panda plancha tus capas de anotación… <span className="scrawl soft">¡PSSSH!</span></p>
            <ProgressBar value={progress} />
          </div>
        )}

        {status === "done" && resultBlob && (
          <ResultPanel
            fileName="anotado.pdf"
            onDownload={handleDownload}
            onReset={handleReset}
            costLevel="heavy"
            title="¡Listo! Capas planchadas."
          >
            <button
              type="button"
              onClick={() => setShowPreview(true)}
              className="btn mt-3"
            >
              Previsualizar
            </button>
          </ResultPanel>
        )}

        {status === "error" && errorMessage && (
          <ErrorBubble message={errorMessage} />
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
