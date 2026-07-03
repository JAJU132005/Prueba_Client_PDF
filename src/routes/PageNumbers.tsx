import { useMemo, useState } from "react";

import { Dropzone } from "@/components/Dropzone";
import { ResourceCostNote } from "@/components/ResourceCostNote";
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
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold text-text md:text-4xl">
            Números de página
          </h1>
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            100% local
          </span>
        </div>
        <p className="max-w-2xl text-base text-text-muted">
          Añade un número a cada página de tu PDF, eligiendo la posición, el
          formato, el número de inicio y el tamaño de fuente. Tu archivo se
          procesa en tu navegador y nunca se sube a ningún servidor.
        </p>
        <ResourceCostNote toolId="page-numbers" />
      </header>

      <div className="mt-8 flex flex-col gap-6">
        <Dropzone
          files={files}
          onFilesChange={handleFilesChange}
          validation={PDF_VALIDATION}
          multiple={false}
          label="Arrastra tu PDF o haz clic para seleccionar"
        />

        <div className="flex flex-col gap-2">
          <label
            htmlFor="page-number-position"
            className="text-sm font-medium text-text"
          >
            Posición
          </label>
          <select
            id="page-number-position"
            value={position}
            onChange={(event) =>
              setPosition(event.target.value as PageNumberPosition)
            }
            className="w-full max-w-sm rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {PAGE_NUMBER_POSITIONS.map((value) => (
              <option key={value} value={value}>
                {POSITION_LABELS[value]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="page-number-format"
            className="text-sm font-medium text-text"
          >
            Formato
          </label>
          <select
            id="page-number-format"
            value={format}
            onChange={(event) =>
              setFormat(event.target.value as PageNumberFormat)
            }
            className="w-full max-w-sm rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
            className="text-sm font-medium text-text"
          >
            Número de inicio
          </label>
          <input
            id="page-number-start"
            type="number"
            min={0}
            value={startNumber}
            onChange={(event) => setStartNumber(Number(event.target.value))}
            className="w-full max-w-[8rem] rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="page-number-font-size"
            className="text-sm font-medium text-text"
          >
            Tamaño de fuente
          </label>
          <input
            id="page-number-font-size"
            type="number"
            min={1}
            value={fontSize}
            onChange={(event) => setFontSize(Number(event.target.value))}
            className="w-full max-w-[8rem] rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
          >
            Añadir números
          </button>
          {files.length === 0 && (
            <span className="text-sm text-text-muted">
              Selecciona un PDF para numerar.
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
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </div>
        )}

        {status === "done" && resultBlob && (
          <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6">
            <p className="text-sm font-medium text-text">
              ¡Listo! Tu PDF numerado está preparado.
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
                onClick={handleReset}
                className="rounded-xl border border-border px-5 py-2.5 text-sm font-semibold text-text transition hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
              >
                Numerar otro
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
    </section>
  );
}
