import { useEffect, useMemo, useRef, useState } from "react";

import { PageRangeSelector } from "@/components/PageRangeSelector";
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
import { pdfjsPageCount } from "@/lib/pdfjsPageCounter";
import { countPdfPages, type PageCounter } from "@/pdf/pageCount";
import {
  createSelection,
  toRangeSpec,
  type PageSelectionState,
} from "@/pdf/pageSelection";
import { createPdfClient, isPdfWorkerError, type PdfClient } from "@/workers/pdfClient";

type Status = "idle" | "processing" | "done" | "error";

const PDF_VALIDATION: FileValidationConfig = {
  allowedExtensions: [".pdf"],
  allowedMimeTypes: ["application/pdf"],
  maxBytes: DEFAULT_MAX_FILE_BYTES,
};

/** Mapea el `name` estable del error de dominio a un mensaje legible. (R39) */
function messageForError(error: unknown): string {
  if (isPdfWorkerError(error)) {
    switch (error.name) {
      case "InvalidPdfError":
        return "El archivo no es un PDF válido.";
      case "InvalidRangeError":
        return "El rango de páginas no es válido.";
      case "SplitFailedError":
        return "No se pudo dividir el PDF.";
      default:
        break;
    }
  }
  return "Ocurrió un error inesperado al dividir el PDF.";
}

export interface SplitPdfProps {
  /** Cliente inyectable (tests). Por defecto se crea uno con worker real. */
  client?: PdfClient;
  /** Contador de páginas inyectable (tests). Por defecto `pdfjsPageCount`. */
  countPages?: PageCounter;
}

export function SplitPdf({ client, countPages }: SplitPdfProps = {}): JSX.Element {
  // Se crea el cliente (y su worker) una sola vez; si se inyecta, se reutiliza.
  const pdfClient = useMemo(() => client ?? createPdfClient(), [client]);
  const counter = countPages ?? pdfjsPageCount;

  const [files, setFiles] = useState<File[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [selection, setSelection] = useState<PageSelectionState | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // El botón se habilita solo con un PDF y una selección no vacía; `toRangeSpec`
  // devuelve "" cuando no hay páginas. La validación real la hace el dominio. (R34)
  const rangeSpec = selection ? toRangeSpec(selection) : "";
  const canSplit =
    files.length > 0 && rangeSpec.trim() !== "" && status !== "processing";

  async function loadPageCount(file: File): Promise<void> {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const buffer = await file.arrayBuffer();
    const result = await countPdfPages(
      new Uint8Array(buffer),
      counter,
      controller.signal,
    );
    if (controller.signal.aborted) return;
    if (result.status === "counted") {
      setPageCount(result.pages);
      setSelection(createSelection(result.pages));
    } else {
      setPageCount(0);
      setSelection(null);
    }
  }

  function handleFilesChange(next: File[]): void {
    abortRef.current?.abort();
    setFiles(next);
    setPageCount(0);
    setSelection(null);
    setStatus("idle");
    setProgress(0);
    setResultBlob(null);
    setErrorMessage(null);
    if (next.length > 0) {
      void loadPageCount(next[0]);
    }
  }

  async function handleSplit(): Promise<void> {
    if (files.length === 0 || rangeSpec.trim() === "") {
      return;
    }
    setStatus("processing");
    setProgress(0);
    setResultBlob(null);
    setErrorMessage(null);

    try {
      // Lee los bytes del PDF y delega la división en el worker. (R35)
      const buffer = await files[0].arrayBuffer();
      const bytes = await pdfClient.split(
        new Uint8Array(buffer),
        rangeSpec,
        (p) => setProgress(p),
      );
      setResultBlob(pdfBytesToBlob(bytes));
      setStatus("done");
    } catch (error) {
      // En fallo no se ofrece descarga; solo mensaje legible. (R39)
      setErrorMessage(messageForError(error));
      setStatus("error");
    }
  }

  function handleDownload(): void {
    if (resultBlob) {
      downloadBlob(resultBlob, "dividido.pdf");
    }
  }

  function handleReset(): void {
    abortRef.current?.abort();
    setFiles([]);
    setPageCount(0);
    setSelection(null);
    setStatus("idle");
    setProgress(0);
    setResultBlob(null);
    setErrorMessage(null);
  }

  return (
    <section className="py-8">
      <ToolPageHeader toolId="split" />

      <div className="mt-8 flex flex-col gap-6">
        <Dropzone
          files={files}
          onFilesChange={handleFilesChange}
          validation={PDF_VALIDATION}
          multiple={false}
          label="Arrastra tu PDF aquí — ¡prometo no chismosear!"
        />

        {selection && pageCount > 0 && (
          <div className="flex flex-col gap-2">
            <span className="hand text-lg text-ink">Páginas a extraer</span>
            <PageRangeSelector
              pageCount={pageCount}
              value={selection}
              onChange={setSelection}
              showAdvanced
            />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleSplit()}
            disabled={!canSplit}
            className="btn btn-primary lv-ligera"
          >
            Cortar por la línea punteada
          </button>
          {(files.length === 0 || rangeSpec.trim() === "") && (
            <span className="hand soft text-base">
              Selecciona un PDF e indica las páginas a extraer.
            </span>
          )}
        </div>

        {status === "processing" && (
          <div className="flex max-w-[640px] flex-col gap-2.5" aria-live="polite">
            <p className="hand m-0 text-xl text-ink">Las tijeras siguen la línea punteada… <span className="scrawl soft">✂ ¡RAS!</span></p>
            <ProgressBar value={progress} />
          </div>
        )}

        {status === "done" && resultBlob && (
          <ResultPanel
            fileName="dividido.pdf"
            onDownload={handleDownload}
            onReset={handleReset}
            costLevel="light"
            title="¡Listo! Recorte limpio."
          />
        )}

        {status === "error" && errorMessage && (
          <ErrorBubble message={errorMessage} />
        )}
      </div>
    </section>
  );
}
