import { useMemo, useState } from "react";

import { Dropzone } from "@/components/Dropzone";
import { ResourceCostNote } from "@/components/ResourceCostNote";
import { downloadBlob, pdfBytesToBlob } from "@/lib/download";
import {
  DEFAULT_MAX_FILE_BYTES,
  type FileValidationConfig,
} from "@/lib/fileValidation";
import { formatBytes } from "@/lib/formatBytes";
import {
  COMPRESSION_LEVELS,
  type CompressionLevel,
  type CompressionReport,
} from "@/pdf/compressPdf";
import {
  createPdfClient,
  isPdfWorkerError,
  type PdfClient,
} from "@/workers/pdfClient";

type Status = "idle" | "processing" | "done" | "error";

/** Validación de entrada del Dropzone: un único PDF. (R27) */
export const PDF_VALIDATION: FileValidationConfig = {
  allowedExtensions: [".pdf"],
  allowedMimeTypes: ["application/pdf"],
  maxBytes: DEFAULT_MAX_FILE_BYTES,
};

/** Etiqueta legible de cada nivel de calidad. (R28) */
const LEVEL_LABELS: Record<CompressionLevel, string> = {
  low: "Máxima compresión",
  medium: "Equilibrada",
  high: "Máxima calidad",
};

/** Mapea el `name` estable del error de dominio a un mensaje legible. (R33) */
function messageForError(error: unknown): string {
  if (isPdfWorkerError(error)) {
    switch (error.name) {
      case "InvalidPdfError":
        return "El archivo no es un PDF válido.";
      case "CompressFailedError":
        return "No se pudo comprimir el PDF.";
      default:
        break;
    }
  }
  return "Ocurrió un error inesperado al comprimir el PDF.";
}

export interface CompressPdfProps {
  /** Cliente inyectable (tests). Por defecto se crea uno con worker real. (R35) */
  client?: PdfClient;
}

export function CompressPdf({ client }: CompressPdfProps = {}): JSX.Element {
  // Se crea el cliente (y su worker) una sola vez; si se inyecta, se reutiliza.
  const pdfClient = useMemo(() => client ?? createPdfClient(), [client]);

  const [files, setFiles] = useState<File[]>([]);
  const [level, setLevel] = useState<CompressionLevel>("medium");
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [report, setReport] = useState<CompressionReport | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canCompress = files.length > 0 && status !== "processing";

  async function handleCompress(): Promise<void> {
    if (files.length === 0) {
      return;
    }
    setStatus("processing");
    setProgress(0);
    setReport(null);
    setResultBlob(null);
    setErrorMessage(null);

    try {
      // Lee los bytes del PDF y delega la compresión en el worker. (R29, R35)
      const buffer = await files[0].arrayBuffer();
      const result = await pdfClient.compress(
        new Uint8Array(buffer),
        { level },
        (p) => setProgress(p),
      );
      setReport(result.report);
      setResultBlob(pdfBytesToBlob(result.bytes));
      setStatus("done");
    } catch (error) {
      // En fallo no se ofrece descarga; solo mensaje legible. (R33)
      setErrorMessage(messageForError(error));
      setStatus("error");
    }
  }

  function handleDownload(): void {
    if (resultBlob) {
      downloadBlob(resultBlob, "comprimido.pdf");
    }
  }

  function handleReset(): void {
    setFiles([]);
    setLevel("medium");
    setStatus("idle");
    setProgress(0);
    setReport(null);
    setResultBlob(null);
    setErrorMessage(null);
  }

  return (
    <section className="py-8">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold text-text md:text-4xl">
            Comprimir PDF
          </h1>
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            100% local
          </span>
        </div>
        <p className="max-w-2xl text-base text-text-muted">
          Reduce el tamaño de tu PDF recomprimiendo sus imágenes. Compresión
          honesta: si no hay imágenes recomprimibles, te lo decimos en vez de
          fingirlo. Tu archivo se procesa en tu navegador y nunca se sube a
          ningún servidor.
        </p>
        <ResourceCostNote toolId="compress" />
      </header>

      <div className="mt-8 flex flex-col gap-6">
        <Dropzone
          files={files}
          onFilesChange={setFiles}
          validation={PDF_VALIDATION}
          multiple={false}
          label="Arrastra tu PDF o haz clic para seleccionar"
        />

        <div className="flex flex-col gap-2">
          <label htmlFor="compress-level" className="text-sm font-medium text-text">
            Nivel de calidad
          </label>
          <select
            id="compress-level"
            value={level}
            onChange={(event) =>
              setLevel(event.target.value as CompressionLevel)
            }
            className="w-full max-w-sm rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {COMPRESSION_LEVELS.map((value) => (
              <option key={value} value={value}>
                {LEVEL_LABELS[value]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleCompress()}
            disabled={!canCompress}
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
          >
            Comprimir
          </button>
          {files.length === 0 && (
            <span className="text-sm text-text-muted">
              Selecciona un PDF para comprimir.
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

        {status === "done" && report && resultBlob && (
          <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6">
            {report.minimalReduction && (
              <p className="rounded-xl border border-border bg-bg p-3 text-sm text-text-muted">
                Este PDF no tiene imágenes recomprimibles, así que la reducción
                será mínima. No vamos a fingir una compresión que no podemos
                hacer sin dañar el documento.
              </p>
            )}
            <dl className="flex flex-wrap gap-6 text-sm">
              <div className="flex flex-col">
                <dt className="text-text-muted">Tamaño original</dt>
                <dd className="font-medium text-text">
                  {formatBytes(report.originalSize)}
                </dd>
              </div>
              <div className="flex flex-col">
                <dt className="text-text-muted">Tamaño comprimido</dt>
                <dd className="font-medium text-text">
                  {formatBytes(report.compressedSize)}
                </dd>
              </div>
            </dl>
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
                Comprimir otro
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
