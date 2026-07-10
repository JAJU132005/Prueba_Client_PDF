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
import { createPdfClient, isPdfWorkerError, type PdfClient } from "@/workers/pdfClient";

type Status = "idle" | "processing" | "done" | "error";

const PDF_VALIDATION: FileValidationConfig = {
  allowedExtensions: [".pdf"],
  allowedMimeTypes: ["application/pdf"],
  maxBytes: DEFAULT_MAX_FILE_BYTES,
};

/** Mapea el `name` estable del error de dominio a un mensaje legible. (R28) */
function messageForError(error: unknown): string {
  if (isPdfWorkerError(error)) {
    switch (error.name) {
      case "InvalidPdfError":
        return "Uno de los archivos no es un PDF válido.";
      case "MergeFailedError":
        return "No se pudo unir los PDFs.";
      default:
        break;
    }
  }
  return "Ocurrió un error inesperado al unir los PDFs.";
}

export interface MergePdfProps {
  /** Cliente inyectable (tests). Por defecto se crea uno con worker real. */
  client?: PdfClient;
}

export function MergePdf({ client }: MergePdfProps = {}): JSX.Element {
  // Se crea el cliente (y su worker) una sola vez; si se inyecta, se reutiliza.
  const pdfClient = useMemo(() => client ?? createPdfClient(), [client]);

  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canMerge = files.length >= 2 && status !== "processing";

  async function handleMerge(): Promise<void> {
    if (files.length < 2) {
      return;
    }
    setStatus("processing");
    setProgress(0);
    setResultBlob(null);
    setErrorMessage(null);

    try {
      // Lee los bytes en el orden mostrado y delega la unión en el worker. (R24)
      const inputs: Uint8Array[] = [];
      for (const file of files) {
        const buffer = await file.arrayBuffer();
        inputs.push(new Uint8Array(buffer));
      }

      const bytes = await pdfClient.merge(inputs, (p) => setProgress(p));
      setResultBlob(pdfBytesToBlob(bytes));
      setStatus("done");
    } catch (error) {
      // En fallo no se ofrece descarga; solo mensaje legible. (R28)
      setErrorMessage(messageForError(error));
      setStatus("error");
    }
  }

  function handleDownload(): void {
    if (resultBlob) {
      downloadBlob(resultBlob, "unido.pdf");
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
      <ToolPageHeader toolId="merge" />

      <div className="mt-8 flex flex-col gap-6">
        <Dropzone
          files={files}
          onFilesChange={setFiles}
          validation={PDF_VALIDATION}
          label="Arrastra tus PDF aquí — ¡prometo no chismosear!"
        />

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleMerge()}
            disabled={!canMerge}
            className="btn btn-primary lv-ligera"
          >
            {getToolSkin("merge")?.actionLabel}
          </button>
          {files.length < 2 && (
            <span className="hand soft text-base">
              Selecciona al menos 2 PDF para unir.
            </span>
          )}
        </div>

        {status === "processing" && (
          <div className="flex max-w-[640px] flex-col gap-2.5" aria-live="polite">
            <p className="hand m-0 text-xl text-ink">
              El panda alinea tus hojas y aprieta la grapadora…{" "}
              <span className="scrawl soft">¡CLACK!</span>
            </p>
            <ProgressBar value={progress} />
          </div>
        )}

        {status === "done" && resultBlob && (
          <ResultPanel
            fileName="unido.pdf"
            onDownload={handleDownload}
            onReset={handleReset}
            costLevel="light"
            title="¡Listo! Hojas grapadas."
          />
        )}

        {status === "error" && errorMessage && (
          <ErrorBubble message={errorMessage} />
        )}
      </div>
    </section>
  );
}
