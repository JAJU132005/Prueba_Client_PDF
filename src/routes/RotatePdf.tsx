import { useMemo, useState } from "react";

import { Dropzone } from "@/components/Dropzone";
import { downloadBlob, pdfBytesToBlob } from "@/lib/download";
import {
  DEFAULT_MAX_FILE_BYTES,
  type FileValidationConfig,
} from "@/lib/fileValidation";
import type { RotateOptions } from "@/pdf/rotateOptions";
import { createPdfClient, isPdfWorkerError, type PdfClient } from "@/workers/pdfClient";

type Status = "idle" | "processing" | "done" | "error";
type Angle = 90 | 180 | 270;
type Mode = "all" | "subset";

const PDF_VALIDATION: FileValidationConfig = {
  allowedExtensions: [".pdf"],
  allowedMimeTypes: ["application/pdf"],
  maxBytes: DEFAULT_MAX_FILE_BYTES,
};

const ANGLES: readonly Angle[] = [90, 180, 270];

/** Mapea el `name` estable del error de dominio a un mensaje legible. (R42) */
function messageForError(error: unknown): string {
  if (isPdfWorkerError(error)) {
    switch (error.name) {
      case "InvalidPdfError":
        return "El archivo no es un PDF válido.";
      case "InvalidRotationError":
        return "El ángulo de rotación no es válido.";
      case "InvalidRangeError":
        return "El rango de páginas no es válido.";
      case "RotateFailedError":
        return "No se pudo rotar el PDF.";
      default:
        break;
    }
  }
  return "Ocurrió un error inesperado al rotar el PDF.";
}

export interface RotatePdfProps {
  /** Cliente inyectable (tests). Por defecto se crea uno con worker real. */
  client?: PdfClient;
}

export function RotatePdf({ client }: RotatePdfProps = {}): JSX.Element {
  // Se crea el cliente (y su worker) una sola vez; si se inyecta, se reutiliza.
  const pdfClient = useMemo(() => client ?? createPdfClient(), [client]);

  const [files, setFiles] = useState<File[]>([]);
  const [angle, setAngle] = useState<Angle>(90);
  const [mode, setMode] = useState<Mode>("all");
  const [rangeSpec, setRangeSpec] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // El botón se habilita con un PDF y, en modo subconjunto, un rango no vacío. La
  // validación real (ángulo y rango) la hace el dominio en el worker. (R37)
  const canRotate =
    files.length > 0 &&
    !(mode === "subset" && rangeSpec.trim() === "") &&
    status !== "processing";

  async function handleRotate(): Promise<void> {
    if (files.length === 0 || (mode === "subset" && rangeSpec.trim() === "")) {
      return;
    }
    setStatus("processing");
    setProgress(0);
    setResultBlob(null);
    setErrorMessage(null);

    try {
      // Lee los bytes del PDF y delega la rotación en el worker. (R38)
      const buffer = await files[0].arrayBuffer();
      const options: RotateOptions = {
        angle,
        pages: mode === "all" ? "all" : rangeSpec,
      };
      const bytes = await pdfClient.rotate(
        new Uint8Array(buffer),
        options,
        (p) => setProgress(p),
      );
      setResultBlob(pdfBytesToBlob(bytes));
      setStatus("done");
    } catch (error) {
      // En fallo no se ofrece descarga; solo mensaje legible. (R42)
      setErrorMessage(messageForError(error));
      setStatus("error");
    }
  }

  function handleDownload(): void {
    if (resultBlob) {
      downloadBlob(resultBlob, "rotado.pdf");
    }
  }

  function handleReset(): void {
    setFiles([]);
    setAngle(90);
    setMode("all");
    setRangeSpec("");
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
            Rotar PDF
          </h1>
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            100% local
          </span>
        </div>
        <p className="max-w-2xl text-base text-text-muted">
          Gira todas las páginas o solo las que elijas en múltiplos de 90°. Tu
          archivo se procesa en tu navegador y nunca se sube a ningún servidor.
        </p>
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
          <label htmlFor="rotate-angle" className="text-sm font-medium text-text">
            Ángulo de rotación
          </label>
          <select
            id="rotate-angle"
            value={angle}
            onChange={(event) => setAngle(Number(event.target.value) as Angle)}
            aria-label="Ángulo de rotación"
            className="w-full max-w-sm rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {ANGLES.map((value) => (
              <option key={value} value={value}>
                {value}°
              </option>
            ))}
          </select>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-text">
            Páginas a rotar
          </legend>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-text">
              <input
                type="radio"
                name="rotate-mode"
                value="all"
                checked={mode === "all"}
                onChange={() => setMode("all")}
              />
              Todas las páginas
            </label>
            <label className="flex items-center gap-2 text-sm text-text">
              <input
                type="radio"
                name="rotate-mode"
                value="subset"
                checked={mode === "subset"}
                onChange={() => setMode("subset")}
              />
              Solo algunas
            </label>
          </div>
          {mode === "subset" && (
            <input
              id="rotate-range"
              type="text"
              value={rangeSpec}
              onChange={(event) => setRangeSpec(event.target.value)}
              placeholder="1-3,5"
              aria-label="Rangos de páginas a rotar"
              className="mt-1 w-full max-w-sm rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-text placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          )}
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleRotate()}
            disabled={!canRotate}
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
          >
            Rotar
          </button>
          {(files.length === 0 ||
            (mode === "subset" && rangeSpec.trim() === "")) && (
            <span className="text-sm text-text-muted">
              Selecciona un PDF
              {mode === "subset" ? " e indica las páginas a rotar." : "."}
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
              ¡Listo! Tu PDF con las páginas rotadas está preparado.
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
                Rotar otro
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
