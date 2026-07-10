import { useMemo, useState } from "react";

import { Dropzone } from "@/components/Dropzone";
import { ErrorBubble } from "@/components/ErrorBubble";
import { ProgressBar } from "@/components/ProgressBar";
import { ResultPanel } from "@/components/ResultPanel";
import { ToolPageHeader } from "@/components/ToolPageHeader";
import { downloadBlob, pdfBytesToBlob } from "@/lib/download";
import { getToolSkin } from "@/lib/toolSkin";
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
      <ToolPageHeader toolId="images-to-pdf" />

      <div className="mt-8 flex flex-col gap-6">
        <Dropzone
          files={files}
          onFilesChange={setFiles}
          validation={IMAGE_VALIDATION}
          label="Arrastra tus imágenes aquí — ¡prometo no chismosear!"
        />

        <div className="flex flex-col gap-2">
          <label
            htmlFor="page-size"
            className="hand text-lg text-ink"
          >
            Tamaño de página
          </label>
          <select
            id="page-size"
            value={pageSize}
            onChange={(event) =>
              setPageSize(event.target.value as PageSizeMode)
            }
            className="hand w-full max-w-xs rounded-oval border-[2.5px] border-ink bg-card px-3 py-2 text-base text-ink"
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
            className="btn btn-primary lv-ligera"
          >
            {getToolSkin("images-to-pdf")?.actionLabel}
          </button>
          {files.length < 1 && (
            <span className="hand soft text-base">
              Selecciona al menos una imagen para convertir.
            </span>
          )}
        </div>

        {status === "processing" && (
          <div className="flex max-w-[640px] flex-col gap-2.5" aria-live="polite">
            <p className="hand m-0 text-xl text-ink">
              El panda pega tus fotos en el álbum… <span className="scrawl soft">¡ZAS!</span>
            </p>
            <ProgressBar value={progress} />
          </div>
        )}

        {status === "done" && resultBlob && (
          <ResultPanel
            fileName="imagenes.pdf"
            onDownload={handleDownload}
            onReset={handleReset}
            costLevel="light"
            title="¡Listo! Álbum cerrado con moño."
          />
        )}

        {status === "error" && errorMessage && (
          <ErrorBubble message={errorMessage} />
        )}
      </div>
    </section>
  );
}
