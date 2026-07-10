import { useMemo, useState } from "react";

import { Dropzone } from "@/components/Dropzone";
import { ErrorBubble } from "@/components/ErrorBubble";
import { ProgressBar } from "@/components/ProgressBar";
import { ResultPanel } from "@/components/ResultPanel";
import { ToolPageHeader } from "@/components/ToolPageHeader";
import { LivePreview } from "@/components/LivePreview";
import { downloadBlob, pdfBytesToBlob } from "@/lib/download";
import {
  DEFAULT_MAX_FILE_BYTES,
  type FileValidationConfig,
} from "@/lib/fileValidation";
import {
  DEFAULT_PAGE_NUMBER_FONT_SIZE,
  formatPageNumber,
  PAGE_NUMBER_FORMATS,
  PAGE_NUMBER_POSITIONS,
  type PageNumberFormat,
  type PageNumberPosition,
  type PageNumbersOptions,
} from "@/pdf/pageNumbers";
import {
  buildPageNumbersOverlay,
  type ContentSize,
  type PreviewOverlay,
  type PreviewPageSize,
} from "@/pdf/previewModel";
import type { PageRasterizerFactory } from "@/pdf/rasterize";
import {
  createPdfClient,
  isPdfWorkerError,
  type PdfClient,
} from "@/workers/pdfClient";

type Status = "idle" | "processing" | "done" | "error";

/** Validación de entrada del Dropzone: un único PDF. (R36, R37, R38) */
export const PDF_VALIDATION: FileValidationConfig = {
  allowedExtensions: [".pdf"],
  allowedMimeTypes: ["application/pdf"],
  maxBytes: DEFAULT_MAX_FILE_BYTES,
};

/** Etiqueta legible de cada posición. (R39) */
const POSITION_LABELS: Record<PageNumberPosition, string> = {
  "bottom-left": "Abajo izquierda",
  "bottom-center": "Abajo centro",
  "bottom-right": "Abajo derecha",
  "top-left": "Arriba izquierda",
  "top-center": "Arriba centro",
  "top-right": "Arriba derecha",
};

/** Etiqueta legible de cada formato. (R40) */
const FORMAT_LABELS: Record<PageNumberFormat, string> = {
  n: "Número (3)",
  "n-of-total": "Número de total (3 / 7)",
  "page-n": "Página N (Página 3)",
};

/** Mapea el `name` estable del error de dominio a un mensaje legible. (R46) */
function messageForError(error: unknown): string {
  if (isPdfWorkerError(error)) {
    switch (error.name) {
      case "InvalidPdfError":
        return "El archivo no es un PDF válido.";
      case "PageNumbersFailedError":
        return "No se pudo añadir la numeración al PDF.";
      default:
        break;
    }
  }
  return "Ocurrió un error inesperado al numerar el PDF.";
}

export interface PageNumbersProps {
  /** Cliente inyectable (tests). Por defecto se crea uno con worker real. (R48) */
  client?: PdfClient;
  /**
   * Factoría de rasterizador para la vista previa (tests). Por defecto la del
   * panel `LivePreview` (`createPdfjsPageRasterizer`). No es una estructura de
   * opciones de la herramienta; solo plumbing de render (R25b).
   */
  createRasterizer?: PageRasterizerFactory;
}

/**
 * Ancho aproximado del texto en puntos PDF para posicionar el overlay de la
 * vista previa. Aproximación tipográfica (sin DOM); el modelo puro solo coloca.
 */
function approxTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.6;
}

export function PageNumbers({
  client,
  createRasterizer,
}: PageNumbersProps = {}): JSX.Element {
  // Se crea el cliente (y su worker) una sola vez; si se inyecta, se reutiliza.
  const pdfClient = useMemo(() => client ?? createPdfClient(), [client]);

  const [files, setFiles] = useState<File[]>([]);
  const [position, setPosition] =
    useState<PageNumberPosition>("bottom-center");
  const [format, setFormat] = useState<PageNumberFormat>("n");
  const [startNumber, setStartNumber] = useState(1);
  const [fontSize, setFontSize] = useState(DEFAULT_PAGE_NUMBER_FONT_SIZE);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Tamaño real de la página (puntos PDF) y recuento de páginas que reporta el
  // panel al cargar el documento; alimentan `previewModel`.
  const [previewPageSize, setPreviewPageSize] =
    useState<PreviewPageSize | null>(null);
  const [totalPages, setTotalPages] = useState(1);

  const canNumber = files.length > 0 && status !== "processing";

  // Overlay de aproximación de la página 0, derivado de las opciones de dominio
  // EXISTENTES (`PageNumbersOptions`) mediante `previewModel`; sin estructuras
  // nuevas. La vista previa muestra siempre la página de índice 0. (R25a, R25b, R29)
  const overlays: PreviewOverlay[] = useMemo(() => {
    if (!previewPageSize) {
      return [];
    }
    const options: PageNumbersOptions = {
      position,
      format,
      startNumber,
      fontSize,
    };
    const text = formatPageNumber(
      options.format,
      options.startNumber,
      options.startNumber + totalPages - 1,
    );
    const content: ContentSize = {
      width: approxTextWidth(text, fontSize),
      height: fontSize,
    };
    return [
      buildPageNumbersOverlay(options, previewPageSize, content, 0, totalPages),
    ];
  }, [previewPageSize, totalPages, position, format, startNumber, fontSize]);

  async function handleAddNumbers(): Promise<void> {
    if (files.length === 0) {
      return;
    }
    setStatus("processing");
    setProgress(0);
    setResultBlob(null);
    setErrorMessage(null);

    try {
      // Lee los bytes del PDF y delega la numeración en el worker. (R43)
      const buffer = await files[0].arrayBuffer();
      const bytes = await pdfClient.addPageNumbers(
        new Uint8Array(buffer),
        { position, format, startNumber, fontSize },
        (p) => setProgress(p),
      );
      setResultBlob(pdfBytesToBlob(bytes));
      setStatus("done");
    } catch (error) {
      // En fallo no se ofrece descarga; solo mensaje legible. (R46, R47)
      setErrorMessage(messageForError(error));
      setStatus("error");
    }
  }

  function handleFilesChange(next: File[]): void {
    setFiles(next);
    setStatus("idle");
    setProgress(0);
    setResultBlob(null);
    setErrorMessage(null);
    setPreviewPageSize(null);
    setTotalPages(1);
  }

  function handleDownload(): void {
    if (resultBlob) {
      downloadBlob(resultBlob, "numerado.pdf");
    }
  }

  function handleReset(): void {
    setFiles([]);
    setPosition("bottom-center");
    setFormat("n");
    setStartNumber(1);
    setFontSize(DEFAULT_PAGE_NUMBER_FONT_SIZE);
    setStatus("idle");
    setProgress(0);
    setResultBlob(null);
    setErrorMessage(null);
    setPreviewPageSize(null);
    setTotalPages(1);
  }

  return (
    <section className="py-8">
      <ToolPageHeader toolId="page-numbers" />

      <div className="mt-8 flex flex-col gap-6">
        <Dropzone
          files={files}
          onFilesChange={handleFilesChange}
          validation={PDF_VALIDATION}
          multiple={false}
          label="Arrastra tu PDF aquí — ¡prometo no chismosear!"
        />

        <div className="flex flex-col gap-2">
          <span className="hand text-lg text-ink">
            Posición (toca un post-it)
          </span>
          <div
            role="group"
            aria-label="Posición"
            className="grid w-fit grid-cols-3 gap-2.5"
          >
            {PAGE_NUMBER_POSITIONS.map((value, index) => (
              <button
                key={value}
                type="button"
                onClick={() => setPosition(value)}
                aria-pressed={position === value}
                className={`hand h-11 cursor-pointer border-2 border-black/25 px-2 text-base text-ink shadow-[2px_3px_0_var(--shadow)] ${
                  index % 2 === 0 ? "-rotate-2" : "rotate-2"
                } ${position === value ? "bg-hl-green" : "bg-postit"}`}
              >
                {POSITION_LABELS[value]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="page-number-format"
            className="hand text-lg text-ink"
          >
            Formato
          </label>
          <select
            id="page-number-format"
            value={format}
            onChange={(event) =>
              setFormat(event.target.value as PageNumberFormat)
            }
            className="hand w-full max-w-sm border-0 border-b-[2.5px] border-dashed border-ink bg-paper px-2 py-1.5 text-lg text-ink outline-none"
          >
            {PAGE_NUMBER_FORMATS.map((value) => (
              <option key={value} value={value}>
                {FORMAT_LABELS[value]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="page-number-start"
            className="hand text-lg text-ink"
          >
            Número de inicio
          </label>
          <input
            id="page-number-start"
            type="number"
            min={0}
            value={startNumber}
            onChange={(event) => setStartNumber(Number(event.target.value))}
            className="hand w-full max-w-[8rem] border-0 border-b-[2.5px] border-dashed border-ink bg-paper px-2 py-1.5 text-lg text-ink outline-none"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="page-number-font-size"
            className="hand text-lg text-ink"
          >
            Tamaño de fuente
          </label>
          <input
            id="page-number-font-size"
            type="number"
            min={1}
            value={fontSize}
            onChange={(event) => setFontSize(Number(event.target.value))}
            className="hand w-full max-w-[8rem] border-0 border-b-[2.5px] border-dashed border-ink bg-paper px-2 py-1.5 text-lg text-ink outline-none"
          />
        </div>

        {files.length > 0 && (
          <LivePreview
            file={files[0]}
            pageIndex={0}
            overlays={overlays}
            onPageSize={setPreviewPageSize}
            onPageCount={setTotalPages}
            createRasterizer={createRasterizer}
          />
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleAddNumbers()}
            disabled={!canNumber}
            className="btn btn-primary lv-ligera"
          >
            Añadir números
          </button>
          {files.length === 0 && (
            <span className="hand soft text-base">
              Selecciona un PDF para numerar.
            </span>
          )}
        </div>

        {status === "processing" && (
          <div className="flex max-w-[640px] flex-col gap-2.5" aria-live="polite">
            <p className="hand m-0 text-xl text-ink">El sello numerador recorre tus páginas… <span className="scrawl soft">¡KA-CHUNK!</span></p>
            <ProgressBar value={progress} />
          </div>
        )}

        {status === "done" && resultBlob && (
          <ResultPanel
            fileName="numerado.pdf"
            onDownload={handleDownload}
            onReset={handleReset}
            costLevel="light"
            title="¡Listo! Páginas selladas."
          />
        )}

        {status === "error" && errorMessage && (
          <ErrorBubble message={errorMessage} />
        )}
      </div>
    </section>
  );
}
