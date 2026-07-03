import { useMemo, useState } from "react";

import { Dropzone } from "@/components/Dropzone";
import { ResourceCostNote } from "@/components/ResourceCostNote";
import { downloadBlob, pdfBytesToBlob } from "@/lib/download";
import {
  DEFAULT_MAX_FILE_BYTES,
  type FileValidationConfig,
} from "@/lib/fileValidation";
import { PROTECT_MODES, type ProtectMode } from "@/pdf/protectPdf";
import {
  createPdfClient,
  isPdfWorkerError,
  type PdfClient,
} from "@/workers/pdfClient";

type Status = "idle" | "processing" | "done" | "error";

/** Validación de entrada del Dropzone: un único PDF. (R22) */
export const PDF_VALIDATION: FileValidationConfig = {
  allowedExtensions: [".pdf"],
  allowedMimeTypes: ["application/pdf"],
  maxBytes: DEFAULT_MAX_FILE_BYTES,
};

/** Etiqueta legible de cada modo. (R23) */
const MODE_LABELS: Record<ProtectMode, string> = {
  protect: "Proteger (cifrar)",
  unlock: "Desbloquear (descifrar)",
};

/** Texto del botón de acción según el modo. */
const ACTION_LABELS: Record<ProtectMode, string> = {
  protect: "Proteger",
  unlock: "Desbloquear",
};

/** Nombre del archivo de descarga según el modo. (R28, R29) */
const DOWNLOAD_NAMES: Record<ProtectMode, string> = {
  protect: "protegido.pdf",
  unlock: "desbloqueado.pdf",
};

/** Mapea el `name` estable del error de dominio a un mensaje legible. (R30, R31) */
function messageForError(error: unknown): string {
  if (isPdfWorkerError(error)) {
    switch (error.name) {
      case "IncorrectPasswordError":
        return "La contraseña es incorrecta. Comprueba que sea la correcta e inténtalo de nuevo.";
      case "InvalidPdfError":
        return "El archivo no es un PDF válido.";
      case "ProtectFailedError":
        return "No se pudo proteger o desbloquear el PDF.";
      default:
        break;
    }
  }
  return "Ocurrió un error inesperado al procesar el PDF.";
}

export interface ProtectUnlockProps {
  /** Cliente inyectable (tests). Por defecto se crea uno con worker real. */
  client?: PdfClient;
}

export function ProtectUnlock({ client }: ProtectUnlockProps = {}): JSX.Element {
  // Se crea el cliente (y su worker) una sola vez; si se inyecta, se reutiliza.
  const pdfClient = useMemo(() => client ?? createPdfClient(), [client]);

  const [files, setFiles] = useState<File[]>([]);
  const [mode, setMode] = useState<ProtectMode>("protect");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultMode, setResultMode] = useState<ProtectMode>("protect");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Botón deshabilitado sin PDF, con contraseña vacía o mientras procesa. (R25)
  const canSubmit =
    files.length > 0 && password !== "" && status !== "processing";

  async function handleSubmit(): Promise<void> {
    if (files.length === 0 || password === "") {
      return;
    }
    setStatus("processing");
    setProgress(0);
    setResultBlob(null);
    setErrorMessage(null);

    try {
      // Lee los bytes del PDF y delega cifrado/descifrado en el worker. (R26, R33)
      const buffer = await files[0].arrayBuffer();
      const bytes = await pdfClient.protect(
        new Uint8Array(buffer),
        { mode, password },
        (p) => setProgress(p),
      );
      setResultBlob(pdfBytesToBlob(bytes));
      setResultMode(mode);
      setStatus("done");
    } catch (error) {
      // En fallo no se ofrece descarga; solo mensaje legible. (R30, R30b, R31, R31b)
      setErrorMessage(messageForError(error));
      setStatus("error");
    }
  }

  function handleDownload(): void {
    if (resultBlob) {
      downloadBlob(resultBlob, DOWNLOAD_NAMES[resultMode]);
    }
  }

  function handleReset(): void {
    setFiles([]);
    setMode("protect");
    setPassword("");
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
            Proteger / desbloquear PDF
          </h1>
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            100% local
          </span>
        </div>
        <p className="max-w-2xl text-base text-text-muted">
          Cifra un PDF con una contraseña o desbloquéalo aportando la contraseña
          correcta. Todo ocurre en tu navegador: ni el archivo ni la contraseña
          se suben a ningún servidor.
        </p>
        <ResourceCostNote toolId="protect" />
      </header>

      <div className="mt-8 flex flex-col gap-6">
        <Dropzone
          files={files}
          onFilesChange={setFiles}
          validation={PDF_VALIDATION}
          multiple={false}
          label="Arrastra tu PDF o haz clic para seleccionar"
        />

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-text">Operación</legend>
          <div className="flex flex-wrap gap-4">
            {PROTECT_MODES.map((value) => (
              <label
                key={value}
                className="flex items-center gap-2 text-sm text-text"
              >
                <input
                  type="radio"
                  name="protect-mode"
                  value={value}
                  checked={mode === value}
                  onChange={() => setMode(value)}
                  className="h-4 w-4 accent-primary"
                />
                {MODE_LABELS[value]}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="protect-password"
            className="text-sm font-medium text-text"
          >
            Contraseña
          </label>
          <input
            id="protect-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            className="w-full max-w-sm rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
          >
            {ACTION_LABELS[mode]}
          </button>
          {files.length === 0 && (
            <span className="text-sm text-text-muted">
              Selecciona un PDF para empezar.
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
            <p className="text-sm text-text-muted">
              {resultMode === "protect"
                ? "Tu PDF está protegido. Necesitarás la contraseña para abrirlo."
                : "Tu PDF está desbloqueado y ya no requiere contraseña."}
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
                Procesar otro
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
