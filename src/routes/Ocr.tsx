import { useEffect, useMemo, useRef, useState } from "react";

import { Dropzone } from "@/components/Dropzone";
import { ErrorBubble } from "@/components/ErrorBubble";
import { PageRangeSelector } from "@/components/PageRangeSelector";
import { ProgressBar } from "@/components/ProgressBar";
import { ToolPageHeader } from "@/components/ToolPageHeader";
import { downloadBlob, pdfBytesToBlob } from "@/lib/download";
import {
  DEFAULT_MAX_FILE_BYTES,
  type FileValidationConfig,
} from "@/lib/fileValidation";
import {
  OCR_LARGE_FILE_MOBILE_WARNING,
  shouldWarnLargeFileOnMobile,
} from "@/lib/ocrMemory";
import { pdfjsPageCount } from "@/lib/pdfjsPageCounter";
import { createPdfjsPageRasterizer } from "@/lib/pdfjsPageRasterizer";
import { useIsMobile } from "@/lib/useIsMobile";
import {
  OCR_LANGUAGES,
  ocrLanguageLabel,
  type OcrLanguage,
  type OcrOutput,
} from "@/pdf/ocrPdf";
import { countPdfPages, type PageCounter } from "@/pdf/pageCount";
import {
  createSelection,
  resolvePages,
  toPageSelection,
  type PageSelectionState,
} from "@/pdf/pageSelection";
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
  /**
   * Contador de páginas inyectable (tests). Por defecto `pdfjsPageCount`.
   * (#32 R5)
   */
  countPages?: PageCounter;
}

export function Ocr(props?: OcrProps): JSX.Element {
  const createRasterizer =
    props?.createRasterizer ?? createPdfjsPageRasterizer;
  const pdfClient = useMemo(
    () => props?.client ?? createPdfClient(),
    [props?.client],
  );
  const counter = props?.countPages ?? pdfjsPageCount;
  const detectedMobile = useIsMobile();
  const isMobile = props?.isMobile ?? detectedMobile;

  const [files, setFiles] = useState<File[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [selection, setSelection] = useState<PageSelectionState | null>(null);
  const [language, setLanguage] = useState<OcrLanguage>("spa");
  const [output, setOutput] = useState<OcrOutput>("text");
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<OcrResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const fileBytes = files.length > 0 ? files[0].size : 0;
  const showMemoryWarning = shouldWarnLargeFileOnMobile(isMobile, fileBytes);
  const selectedCount = selection?.selected.size ?? 0;
  const canRecognize =
    files.length > 0 && status !== "processing" && selectedCount > 0;

  async function loadPageCount(file: File): Promise<void> {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const buffer = await file.arrayBuffer();
    const countResult = await countPdfPages(
      new Uint8Array(buffer),
      counter,
      controller.signal,
    );
    if (controller.signal.aborted) return;
    if (countResult.status === "counted") {
      // Todas las páginas seleccionadas por defecto. (#32 R5, R6)
      setPageCount(countResult.pages);
      setSelection(createSelection(countResult.pages));
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
    setResult(null);
    setErrorMessage(null);
    if (next.length > 0) {
      void loadPageCount(next[0]);
    }
  }

  async function handleRecognize(): Promise<void> {
    if (files.length === 0 || !selection || selectedCount === 0) {
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
      // Índices seleccionados (orden ascendente); se filtran en la capa UI sin
      // tocar `rasterize.ts`, igual que #19. (#32 R8, R9)
      const selectedIndices = new Set(
        resolvePages(toPageSelection(selection), pageCount),
      );
      const collected: RasterizedPage[] = [];
      await rasterizePages(
        rasterizer,
        { format: "png", scale: OCR_RENDER_SCALE },
        (page) => {
          if (selectedIndices.has(page.index)) {
            collected.push(page);
          }
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
      <ToolPageHeader toolId="ocr" />

      <div className="mt-8 flex flex-col gap-6">
        <Dropzone
          files={files}
          onFilesChange={handleFilesChange}
          validation={PDF_VALIDATION}
          multiple={false}
          label="Arrastra tu PDF escaneado aquí — ¡prometo no chismosear!"
        />

        {showMemoryWarning && (
          <p role="note" className="postit max-w-md text-ink">
            {OCR_LARGE_FILE_MOBILE_WARNING}
          </p>
        )}

        {selection && pageCount > 0 && (
          <div className="flex flex-col gap-2">
            <span className="hand text-lg text-ink">
              Páginas a reconocer
            </span>
            <PageRangeSelector
              pageCount={pageCount}
              value={selection}
              onChange={setSelection}
              showAdvanced
            />
          </div>
        )}

        <div className="optpanel max-w-[640px]">
          <h3 className="hand mb-2.5 mt-0 text-xl font-normal text-ink">
            Idioma del documento
          </h3>
          <div
            role="group"
            aria-label="Idioma del documento"
            className="flex flex-wrap gap-2"
          >
            {OCR_LANGUAGES.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setLanguage(value)}
                aria-pressed={language === value}
                className={`btn ${language === value ? "!bg-hl-red" : ""}`}
              >
                {ocrLanguageLabel(value)}
              </button>
            ))}
          </div>
        </div>

        <div className="optpanel max-w-[640px]">
          <h3 className="hand mb-2.5 mt-0 text-xl font-normal text-ink">
            Formato de salida
          </h3>
          <div
            role="group"
            aria-label="Formato de salida"
            className="flex flex-wrap gap-2"
          >
            {OUTPUT_OPTIONS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setOutput(value)}
                aria-pressed={output === value}
                className={`btn ${output === value ? "!bg-hl-red" : ""}`}
              >
                {OUTPUT_LABELS[value]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleRecognize()}
            disabled={!canRecognize}
            className="btn btn-primary lv-pesada"
          >
            Reconocer texto
          </button>
          {files.length === 0 && (
            <span className="hand soft text-base">
              Selecciona un PDF para reconocer su texto.
            </span>
          )}
          {files.length > 0 && selectedCount === 0 && (
            <span className="hand soft text-base">
              Selecciona al menos una página para reconocer su texto.
            </span>
          )}
        </div>

        {status === "processing" && (
          <div className="flex max-w-[640px] flex-col gap-2.5" aria-live="polite">
            <p className="postit max-w-md text-ink">
              El reconocimiento de texto es una operación pesada y puede tardar,
              sobre todo en documentos largos. Mantén esta pestaña abierta.
            </p>
            <p className="hand m-0 text-xl text-ink">
              La lupa del panda detective recorre tus páginas…{" "}
              <span className="scrawl soft">¡AJÁ!</span>
            </p>
            <ProgressBar value={progress} />
          </div>
        )}

        {status === "done" && result && (
          <div className="card flex max-w-[640px] flex-col gap-4">
            <h3 className="hand m-0 text-2xl font-normal text-ink">
              <span className="hl-pesada">Reconocimiento completado.</span>{" "}
              Descarga el resultado.
            </h3>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleDownloadText}
                className="btn btn-primary lv-pesada !px-6 !py-2 !text-xl"
              >
                Descargar texto
              </button>
              {result.pdfBytes && (
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  className="btn"
                >
                  Descargar PDF buscable
                </button>
              )}
            </div>
          </div>
        )}

        {status === "error" && errorMessage && (
          <ErrorBubble message={errorMessage} />
        )}
      </div>
    </section>
  );
}
