import { useMemo, useState } from "react";

import { Dropzone } from "@/components/Dropzone";
import { ResourceCostNote } from "@/components/ResourceCostNote";
import { downloadBlob, pdfBytesToBlob } from "@/lib/download";
import {
  DEFAULT_MAX_FILE_BYTES,
  type FileValidationConfig,
} from "@/lib/fileValidation";
import {
  OCR_LARGE_FILE_MOBILE_WARNING,
  shouldWarnLargeFileOnMobile,
} from "@/lib/ocrMemory";
import { createPdfjsPageRasterizer } from "@/lib/pdfjsPageRasterizer";
import { useIsMobile } from "@/lib/useIsMobile";
import {
  OCR_LANGUAGES,
  ocrLanguageLabel,
  type OcrLanguage,
  type OcrOutput,
} from "@/pdf/ocrPdf";
import {
  rasterizePages,
  type PageRasterizerFactory,
  type RasterizedPage,
} from "@/pdf/rasterize";
import type { OcrImageInput, OcrResult } from "@/workers/contract";
import {
  createPdfClient,
  isPdfWorkerError,
  type PdfClient,
} from "@/workers/pdfClient";

type Status = "idle" | "processing" | "done" | "error";

/** Validación de entrada del Dropzone: un único PDF. (R29) */
export const PDF_VALIDATION: FileValidationConfig = {
  allowedExtensions: [".pdf"],
  allowedMimeTypes: ["application/pdf"],
  maxBytes: DEFAULT_MAX_FILE_BYTES,
};

/** Escala de render para OCR: más resolución mejora el reconocimiento. */
const OCR_RENDER_SCALE = 2;

/** Etiquetas legibles del control de salida. (R31) */
const OUTPUT_LABELS: Record<OcrOutput, string> = {
  text: "Solo texto (.txt)",
  "searchable-pdf": "PDF con texto buscable",
  both: "Texto y PDF buscable",
};

const OUTPUT_OPTIONS: readonly OcrOutput[] = ["text", "searchable-pdf", "both"];

/** Mapea el `name` estable del error de dominio a un mensaje legible. (R36) */
function messageForError(error: unknown): string {
  if (isPdfWorkerError(error)) {
    switch (error.name) {
      case "InvalidPdfError":
        return "El archivo no es un PDF válido.";
      case "OcrFailedError":
        return "No se pudo reconocer el texto del PDF.";
      default:
        break;
    }
  }
  return "Ocurrió un error inesperado al reconocer el texto.";
}

export interface OcrProps {
  /**
   * Factoría de rasterizador inyectable (tests). Por defecto
   * `createPdfjsPageRasterizer` (pdf.js). (R32)
   */
  createRasterizer?: PageRasterizerFactory;
  /** Cliente inyectable (tests). Por defecto se crea uno con worker real. (R32) */
  client?: PdfClient;
  /** Inyección para tests deterministas del aviso de memoria (A4). */
  isMobile?: boolean;
}

export function Ocr(props?: OcrProps): JSX.Element {
  const createRasterizer =
    props?.createRasterizer ?? createPdfjsPageRasterizer;
  const pdfClient = useMemo(
    () => props?.client ?? createPdfClient(),
    [props?.client],
  );
  const detectedMobile = useIsMobile();
  const isMobile = props?.isMobile ?? detectedMobile;

  const [files, setFiles] = useState<File[]>([]);
  const [language, setLanguage] = useState<OcrLanguage>("spa");
  const [output, setOutput] = useState<OcrOutput>("text");
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<OcrResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileBytes = files.length > 0 ? files[0].size : 0;
  const showMemoryWarning = shouldWarnLargeFileOnMobile(isMobile, fileBytes);
  const canRecognize = files.length > 0 && status !== "processing";

  function handleFilesChange(next: File[]): void {
    setFiles(next);
    setStatus("idle");
    setProgress(0);
    setResult(null);
    setErrorMessage(null);
  }

  async function handleRecognize(): Promise<void> {
    if (files.length === 0) {
      return;
    }
    setStatus("processing");
    setProgress(0);
    setResult(null);
    setErrorMessage(null);

    let rasterizer;
    try {
      const buffer = await files[0].arrayBuffer();
      const input = new Uint8Array(buffer);
      // Rasteriza cada página con el rasterizador reutilizado (#9). (R32)
      rasterizer = await createRasterizer(input);
      const controller = new AbortController();
      const collected: RasterizedPage[] = [];
      await rasterizePages(
        rasterizer,
        { format: "png", scale: OCR_RENDER_SCALE },
        (page) => {
          collected.push(page);
        },
        controller.signal,
      );
      const images: OcrImageInput[] = await Promise.all(
        collected.map(async (page) => ({
          bytes: new Uint8Array(await page.blob.arrayBuffer()),
          mimeType: "image/png",
        })),
      );
      // El OCR (WASM) y el ensamblado corren en el worker; progreso REAL. (R32, R33)
      const ocrResult = await pdfClient.ocr(
        images,
        { language, output },
        (p) => setProgress(p),
      );
      setResult(ocrResult);
      setStatus("done");
    } catch (error) {
      setErrorMessage(messageForError(error));
      setStatus("error");
    } finally {
      rasterizer?.destroy();
    }
  }

  function handleDownloadText(): void {
    if (result) {
      const blob = new Blob([result.text], { type: "text/plain" });
      downloadBlob(blob, "texto-reconocido.txt");
    }
  }

  function handleDownloadPdf(): void {
    if (result?.pdfBytes) {
      downloadBlob(pdfBytesToBlob(result.pdfBytes), "buscable.pdf");
    }
  }

  return (
    <section className="py-8">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold text-text md:text-4xl">
            Reconocer texto (OCR)
          </h1>
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            100% local
          </span>
        </div>
        <p className="max-w-2xl text-base text-text-muted">
          Extrae el texto de un PDF escaneado con reconocimiento óptico de
          caracteres. Obtienes siempre el texto en un archivo `.txt` y, si lo
          eliges, un PDF con una capa de texto invisible buscable. Todo el
          proceso ocurre en tu navegador; tu archivo nunca se sube a ningún
          servidor.
        </p>
        <ResourceCostNote toolId="ocr" isMobile={props?.isMobile} />
      </header>

      <div className="mt-8 flex flex-col gap-6">
        <Dropzone
          files={files}
          onFilesChange={handleFilesChange}
          validation={PDF_VALIDATION}
          multiple={false}
          label="Arrastra tu PDF escaneado o haz clic para seleccionar"
        />

        {showMemoryWarning && (
          <p
            role="note"
            className="rounded-xl border border-danger/40 bg-danger/5 p-3 text-sm text-danger"
          >
            {OCR_LARGE_FILE_MOBILE_WARNING}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <label htmlFor="ocr-language" className="text-sm font-medium text-text">
            Idioma del documento
          </label>
          <select
            id="ocr-language"
            value={language}
            onChange={(event) =>
              setLanguage(event.target.value as OcrLanguage)
            }
            className="w-full max-w-sm rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {OCR_LANGUAGES.map((value) => (
              <option key={value} value={value}>
                {ocrLanguageLabel(value)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="ocr-output" className="text-sm font-medium text-text">
            Formato de salida
          </label>
          <select
            id="ocr-output"
            value={output}
            onChange={(event) => setOutput(event.target.value as OcrOutput)}
            className="w-full max-w-sm rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {OUTPUT_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {OUTPUT_LABELS[value]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleRecognize()}
            disabled={!canRecognize}
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
          >
            Reconocer texto
          </button>
          {files.length === 0 && (
            <span className="text-sm text-text-muted">
              Selecciona un PDF para reconocer su texto.
            </span>
          )}
        </div>

        {status === "processing" && (
          <div className="flex flex-col gap-2" aria-live="polite">
            <p className="rounded-xl border border-amber-300/50 bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              El reconocimiento de texto es una operación pesada y puede tardar,
              sobre todo en documentos largos. Mantén esta pestaña abierta.
            </p>
            <div className="flex items-center justify-between text-sm text-text-muted">
              <span>Reconociendo localmente…</span>
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

        {status === "done" && result && (
          <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6">
            <p className="text-sm text-text-muted">
              Reconocimiento completado. Descarga el resultado.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleDownloadText}
                className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg motion-reduce:transition-none"
              >
                Descargar texto
              </button>
              {result.pdfBytes && (
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  className="rounded-xl border border-border px-5 py-2.5 text-sm font-semibold text-text transition hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
                >
                  Descargar PDF buscable
                </button>
              )}
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
