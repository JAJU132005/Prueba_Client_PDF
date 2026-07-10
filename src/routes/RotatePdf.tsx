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
  toPageSelection,
  type PageSelectionState,
} from "@/pdf/pageSelection";
import type { RotateOptions } from "@/pdf/rotateOptions";
import { createPdfClient, isPdfWorkerError, type PdfClient } from "@/workers/pdfClient";

type Status = "idle" | "processing" | "done" | "error";
type Angle = 90 | 180 | 270;

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
  /** Contador de páginas inyectable (tests). Por defecto `pdfjsPageCount`. */
  countPages?: PageCounter;
}

export function RotatePdf({ client, countPages }: RotatePdfProps = {}): JSX.Element {
  // Se crea el cliente (y su worker) una sola vez; si se inyecta, se reutiliza.
  const pdfClient = useMemo(() => client ?? createPdfClient(), [client]);
  const counter = countPages ?? pdfjsPageCount;

  const [files, setFiles] = useState<File[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [selection, setSelection] = useState<PageSelectionState | null>(null);
  const [angle, setAngle] = useState<Angle>(90);
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

  // `toPageSelection` devuelve "" cuando no hay páginas seleccionadas. (R37)
  const pages = selection ? toPageSelection(selection) : "";
  const canRotate =
    files.length > 0 && pages !== "" && status !== "processing";

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
    setAngle(90);
    setStatus("idle");
    setProgress(0);
    setResultBlob(null);
    setErrorMessage(null);
    if (next.length > 0) {
      void loadPageCount(next[0]);
    }
  }

  async function handleRotate(): Promise<void> {
    if (files.length === 0 || pages === "") {
      return;
    }
    setStatus("processing");
    setProgress(0);
    setResultBlob(null);
    setErrorMessage(null);

    try {
      // Lee los bytes del PDF y delega la rotación en el worker. (R38)
      const buffer = await files[0].arrayBuffer();
      const options: RotateOptions = { angle, pages };
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
    abortRef.current?.abort();
    setFiles([]);
    setPageCount(0);
    setSelection(null);
    setAngle(90);
    setStatus("idle");
    setProgress(0);
    setResultBlob(null);
    setErrorMessage(null);
  }

  return (
    <section className="py-8">
      <ToolPageHeader toolId="rotate" />

      <div className="mt-8 flex flex-col gap-6">
        <Dropzone
          files={files}
          onFilesChange={handleFilesChange}
          validation={PDF_VALIDATION}
          multiple={false}
          label="Arrastra tu PDF aquí — ¡prometo no chismosear!"
        />

        <div className="optpanel max-w-[420px]">
          <h3 className="hand mb-2.5 mt-0 text-xl font-normal text-ink">
            Ángulo de giro (perilla)
          </h3>
          <div
            role="group"
            aria-label="Ángulo de rotación"
            className="flex flex-wrap gap-2"
          >
            {ANGLES.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setAngle(value)}
                aria-pressed={angle === value}
                className={`btn ${angle === value ? "!bg-hl-green" : ""}`}
              >
                {value}°
              </button>
            ))}
          </div>
          <p className="mono soft mb-0 mt-2.5 text-[11.5px]">
            el panda inclina la cabeza ese mismo ángulo · aplica al rango
            elegido
          </p>
        </div>

        {selection && pageCount > 0 && (
          <div className="flex flex-col gap-2">
            <span className="hand text-lg text-ink">Páginas a rotar</span>
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
            onClick={() => void handleRotate()}
            disabled={!canRotate}
            className="btn btn-primary lv-ligera"
          >
            Girar páginas
          </button>
          {(files.length === 0 || pages === "") && (
            <span className="hand soft text-base">
              Selecciona un PDF e indica las páginas a rotar.
            </span>
          )}
        </div>

        {status === "processing" && (
          <div className="flex max-w-[640px] flex-col gap-2.5" aria-live="polite">
            <p className="hand m-0 text-xl text-ink">El panda tuerce el cuello de tus páginas… <span className="scrawl soft">¡ÑIIIC!</span></p>
            <ProgressBar value={progress} />
          </div>
        )}

        {status === "done" && resultBlob && (
          <ResultPanel
            fileName="rotado.pdf"
            onDownload={handleDownload}
            onReset={handleReset}
            costLevel="light"
            title="¡Listo! Cuello (y páginas) en su sitio."
          />
        )}

        {status === "error" && errorMessage && (
          <ErrorBubble message={errorMessage} />
        )}
      </div>
    </section>
  );
}
