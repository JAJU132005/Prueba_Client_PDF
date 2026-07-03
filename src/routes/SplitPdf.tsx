import { useEffect, useMemo, useRef, useState } from "react";

import { PageRangeSelector } from "@/components/PageRangeSelector";
import { Dropzone } from "@/components/Dropzone";
import { ResourceCostNote } from "@/components/ResourceCostNote";
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
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold text-text md:text-4xl">
            Dividir PDF
          </h1>
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            100% local
          </span>
        </div>
        <p className="max-w-2xl text-base text-text-muted">
          Elige visualmente las páginas a extraer: haz clic en las que quieras o
          usa los atajos. Tu archivo se procesa en tu navegador y nunca se sube a
          ningún servidor.
        </p>
        <ResourceCostNote toolId="split" />
      </header>

      <div className="mt-8 flex flex-col gap-6">
        <Dropzone
          files={files}
          onFilesChange={handleFilesChange}
          validation={PDF_VALIDATION}
          multiple={false}
          label="Arrastra tu PDF o haz clic para seleccionar"
        />

        {selection && pageCount > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-text">
              Páginas a extraer
            </span>
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
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
          >
            Dividir
          </button>
          {(files.length === 0 || rangeSpec.trim() === "") && (
            <span className="text-sm text-text-muted">
              Selecciona un PDF e indica las páginas a extraer.
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
              ¡Listo! Tu PDF con las páginas extraídas está preparado.
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
                Dividir otro
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
