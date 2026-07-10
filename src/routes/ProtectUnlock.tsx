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
      <ToolPageHeader toolId="protect" />

      <div className="mt-8 flex flex-col gap-6">
        <Dropzone
          files={files}
          onFilesChange={setFiles}
          validation={PDF_VALIDATION}
          multiple={false}
          label="Arrastra tu PDF aquí — ¡prometo no chismosear!"
        />

        <fieldset className="optpanel m-0 max-w-[640px] border-[2.5px]">
          <legend className="hand px-1 text-lg text-ink">Operación</legend>
          <div className="flex flex-wrap gap-2">
            {PROTECT_MODES.map((value) => (
              <label
                key={value}
                className={`btn flex cursor-pointer items-center gap-2 !text-base ${
                  mode === value ? "!bg-hl-orange" : ""
                }`}
              >
                <input
                  type="radio"
                  name="protect-mode"
                  value={value}
                  checked={mode === value}
                  onChange={() => setMode(value)}
                  className="h-4 w-4 accent-[var(--mk-orange)]"
                />
                {MODE_LABELS[value]}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="protect-password"
            className="hand text-lg text-ink"
          >
            Contraseña
          </label>
          <input
            id="protect-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            placeholder="escríbela aquí…"
            className="hand w-full max-w-sm border-0 border-b-[2.5px] border-dashed border-ink bg-paper px-1 py-1.5 text-lg text-ink outline-none placeholder:text-ink-soft"
          />
          <p className="hand soft m-0 text-base">
            tu contraseña jamás sale de este navegador, palabra de panda 🤝
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            className="btn btn-primary lv-media"
          >
            {ACTION_LABELS[mode]}
          </button>
          {files.length === 0 && (
            <span className="hand soft text-base">
              Selecciona un PDF para empezar.
            </span>
          )}
        </div>

        {status === "processing" && (
          <div className="flex max-w-[640px] flex-col gap-2.5" aria-live="polite">
            <p className="hand m-0 text-xl text-ink">El panda gira la llavecita del candado… <span className="scrawl soft">¡CLIC!</span></p>
            <ProgressBar value={progress} />
          </div>
        )}

        {status === "done" && resultBlob && (
          <ResultPanel
            fileName={DOWNLOAD_NAMES[resultMode]}
            onDownload={handleDownload}
            onReset={handleReset}
            costLevel="medium"
            title="¡Listo! Candado en su sitio."
          >
            <p className="hand soft mb-0 mt-2 text-base">
              {resultMode === "protect"
                ? "Tu PDF está protegido. Necesitarás la contraseña para abrirlo."
                : "Tu PDF está desbloqueado y ya no requiere contraseña."}
            </p>
          </ResultPanel>
        )}

        {status === "error" && errorMessage && (
          <ErrorBubble message={errorMessage} />
        )}
      </div>
    </section>
  );
}
