import { useMemo, useState } from "react";

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
      <ToolPageHeader toolId="compress" />

      <div className="mt-8 flex flex-col gap-6">
        <Dropzone
          files={files}
          onFilesChange={setFiles}
          validation={PDF_VALIDATION}
          multiple={false}
          label="Arrastra tu PDF aquí — ¡prometo no chismosear!"
        />

        <div className="optpanel max-w-[640px]">
          <h3 className="hand mb-2.5 mt-0 text-xl font-normal text-ink">
            Nivel de calidad
          </h3>
          <div
            role="group"
            aria-label="Nivel de calidad"
            className="flex flex-wrap gap-2"
          >
            {COMPRESSION_LEVELS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setLevel(value)}
                aria-pressed={level === value}
                className={`btn ${level === value ? "!bg-hl-red" : ""}`}
              >
                {LEVEL_LABELS[value]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleCompress()}
            disabled={!canCompress}
            className="btn btn-primary lv-pesada"
          >
            Comprimir
          </button>
          {files.length === 0 && (
            <span className="hand soft text-base">
              Selecciona un PDF para comprimir.
            </span>
          )}
        </div>

        {status === "processing" && (
          <div className="flex max-w-[640px] flex-col gap-2.5" aria-live="polite">
            <p className="hand m-0 text-xl text-ink">La prensa panda aprieta la pila… <span className="scrawl soft">¡CRONCH!</span></p>
            <ProgressBar value={progress} />
          </div>
        )}

        {status === "done" && report && resultBlob && (
          <ResultPanel
            fileName="comprimido.pdf"
            onDownload={handleDownload}
            onReset={handleReset}
            costLevel="heavy"
            title="¡Listo! Pila prensada."
          >
            {report.minimalReduction && (
              <p className="postit mt-3 text-ink">
                Este PDF no tiene imágenes recomprimibles, así que la reducción
                será mínima. No vamos a fingir una compresión que no podemos
                hacer sin dañar el documento.
              </p>
            )}
            <dl className="mt-3 flex flex-wrap gap-6">
              <div className="flex flex-col">
                <dt className="hand soft text-base">Tamaño original</dt>
                <dd className="mono m-0 text-lg text-ink">
                  {formatBytes(report.originalSize)}
                </dd>
              </div>
              <span className="hand soft self-center text-2xl" aria-hidden="true">
                →
              </span>
              <div className="flex flex-col">
                <dt className="hand soft text-base">Tamaño comprimido</dt>
                <dd className="mono m-0 text-lg text-ink">
                  {formatBytes(report.compressedSize)}
                </dd>
              </div>
            </dl>
          </ResultPanel>
        )}

        {status === "error" && errorMessage && (
          <ErrorBubble message={errorMessage} />
        )}
      </div>
    </section>
  );
}
