import { useMemo, useState } from "react";

import { Dropzone } from "@/components/Dropzone";
import { downloadBlob, pdfBytesToBlob } from "@/lib/download";
import {
  DEFAULT_MAX_FILE_BYTES,
  type FileValidationConfig,
} from "@/lib/fileValidation";
import { PAGE_SIZE_MODES, type PageSizeMode } from "@/pdf/imagesToPdf";
import {
  createPdfClient,
  isPdfWorkerError,
  type PdfClient,
} from "@/workers/pdfClient";

type Status = "idle" | "processing" | "done" | "error";

/** Validación de entrada del Dropzone: JPG/PNG por extensión y MIME. (R41, R42) */
export const IMAGE_VALIDATION: FileValidationConfig = {
  allowedExtensions: [".jpg", ".jpeg", ".png"],
  allowedMimeTypes: ["image/jpeg", "image/png"],
  maxBytes: DEFAULT_MAX_FILE_BYTES,
};

/** Etiqueta legible de cada modo de tamaño de página. (R44) */
const PAGE_SIZE_LABELS: Record<PageSizeMode, string> = {
  fit: "Ajustar a la imagen",
  a4: "A4 vertical",
};

/** Mapea el `name` estable del error de dominio a un mensaje legible. (R48) */
function messageForError(error: unknown): string {
  if (isPdfWorkerError(error)) {
    switch (error.name) {
      case "InvalidImageError":
        return "Una de las imágenes no es un JPG o PNG válido.";
      case "ImagesToPdfFailedError":
        return "No se pudo crear el PDF a partir de las imágenes.";
      default:
        break;
    }
  }
  return "Ocurrió un error inesperado al crear el PDF.";
}

export interface ImagesToPdfProps {
  /** Cliente inyectable (tests). Por defecto se crea uno con worker real. (R50) */
  client?: PdfClient;
}

export function ImagesToPdf({ client }: ImagesToPdfProps = {}): JSX.Element {
  // Se crea el cliente (y su worker) una sola vez; si se inyecta, se reutiliza.
  const pdfClient = useMemo(() => client ?? createPdfClient(), [client]);

  const [files, setFiles] = useState<File[]>([]);
  const [pageSize, setPageSize] = useState<PageSizeMode>("fit");
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canConvert = files.length >= 1 && status !== "processing";

  async function handleConvert(): Promise<void> {
    if (files.length < 1) {
      return;
    }
    setStatus("processing");
    setProgress(0);
    setResultBlob(null);
    setErrorMessage(null);

    try {
      // Lee los bytes en el orden mostrado y delega la conversión en el worker.
      const inputs: Uint8Array[] = [];
      for (const file of files) {
        const buffer = await file.arrayBuffer();
        inputs.push(new Uint8Array(buffer));
      }

      const bytes = await pdfClient.imagesToPdf(
        inputs,
        { pageSize },
        (p) => setProgress(p),
      );
      setResultBlob(pdfBytesToBlob(bytes));
      setStatus("done");
    } catch (error) {
      // En fallo no se ofrece descarga; solo mensaje legible. (R48, R49)
      setErrorMessage(messageForError(error));
      setStatus("error");
    }
  }

  function handleDownload(): void {
    if (resultBlob) {
      downloadBlob(resultBlob, "imagenes.pdf");
    }
  }

  function handleReset(): void {
    setFiles([]);
    setStatus("idle");
    setProgress(0);
    setResultBlob(null);
    setErrorMessage(null);
  }

  return (
    <section className="py-8">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold text-text md:text-4xl">
            Imágenes a PDF
          </h1>
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            100% local
          </span>
        </div>
        <p className="max-w-2xl text-base text-text-muted">
          Combina tus imágenes JPG y PNG en un único PDF, una imagen por página y
          en el orden que elijas. Tus archivos se procesan en tu navegador y
          nunca se suben a ningún servidor.
        </p>
      </header>

      <div className="mt-8 flex flex-col gap-6">
        <Dropzone
          files={files}
          onFilesChange={setFiles}
          validation={IMAGE_VALIDATION}
          label="Arrastra tus imágenes o haz clic para seleccionar"
        />

        <div className="flex flex-col gap-2">
          <label
            htmlFor="page-size"
            className="text-sm font-medium text-text"
          >
            Tamaño de página
          </label>
          <select
            id="page-size"
            value={pageSize}
            onChange={(event) =>
              setPageSize(event.target.value as PageSizeMode)
            }
            className="w-full max-w-xs rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {PAGE_SIZE_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {PAGE_SIZE_LABELS[mode]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleConvert()}
            disabled={!canConvert}
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
          >
            Convertir
          </button>
          {files.length < 1 && (
            <span className="text-sm text-text-muted">
              Selecciona al menos una imagen para convertir.
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
              ¡Listo! Tu PDF está preparado.
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
                Convertir otras
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
