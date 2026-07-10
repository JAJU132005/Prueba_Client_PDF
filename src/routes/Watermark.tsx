import { useEffect, useMemo, useRef, useState } from "react";

import { PageRangeSelector } from "@/components/PageRangeSelector";
import { Dropzone } from "@/components/Dropzone";
import { ErrorBubble } from "@/components/ErrorBubble";
import { ProgressBar } from "@/components/ProgressBar";
import { ResultPanel } from "@/components/ResultPanel";
import { ToolPageHeader } from "@/components/ToolPageHeader";
import { LivePreview } from "@/components/LivePreview";
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
import {
  buildWatermarkOverlay,
  resolvePreviewPageIndex,
  type ContentSize,
  type PreviewOverlay,
  type PreviewPageSize,
} from "@/pdf/previewModel";
import type { PageRasterizerFactory } from "@/pdf/rasterize";
import {
  DEFAULT_WATERMARK_ANGLE,
  DEFAULT_WATERMARK_FONT_SIZE,
  DEFAULT_WATERMARK_OPACITY,
  WATERMARK_MODES,
  WATERMARK_POSITIONS,
  type WatermarkMode,
  type WatermarkOptions,
  type WatermarkPosition,
} from "@/pdf/watermark";
import {
  createPdfClient,
  isPdfWorkerError,
  type PdfClient,
} from "@/workers/pdfClient";

type Status = "idle" | "processing" | "done" | "error";

/** Validación de entrada del Dropzone del PDF: un único PDF. (R46, R47, R48) */
export const PDF_VALIDATION: FileValidationConfig = {
  allowedExtensions: [".pdf"],
  allowedMimeTypes: ["application/pdf"],
  maxBytes: DEFAULT_MAX_FILE_BYTES,
};

/** Validación de entrada del Dropzone de imagen: JPG/PNG. (R50) */
export const IMAGE_VALIDATION: FileValidationConfig = {
  allowedExtensions: [".jpg", ".jpeg", ".png"],
  allowedMimeTypes: ["image/jpeg", "image/png"],
  maxBytes: DEFAULT_MAX_FILE_BYTES,
};

/** Etiqueta legible de cada modo. (R49) */
const MODE_LABELS: Record<WatermarkMode, string> = {
  text: "Texto",
  image: "Imagen",
};

/** Etiqueta legible de cada posición. (R51) */
const POSITION_LABELS: Record<WatermarkPosition, string> = {
  "top-left": "Arriba izquierda",
  "top-center": "Arriba centro",
  "top-right": "Arriba derecha",
  "middle-left": "Medio izquierda",
  center: "Centro",
  "middle-right": "Medio derecha",
  "bottom-left": "Abajo izquierda",
  "bottom-center": "Abajo centro",
  "bottom-right": "Abajo derecha",
};

/** Mapea el `name` estable del error de dominio a un mensaje legible. (R60) */
function messageForError(error: unknown): string {
  if (isPdfWorkerError(error)) {
    switch (error.name) {
      case "InvalidPdfError":
        return "El archivo no es un PDF válido.";
      case "InvalidImageError":
        return "La imagen de marca no es un JPG o PNG válido.";
      case "InvalidRangeError":
        return "El rango de páginas no es válido.";
      case "WatermarkFailedError":
        return "No se pudo añadir la marca de agua al PDF.";
      default:
        break;
    }
  }
  return "Ocurrió un error inesperado al añadir la marca de agua.";
}

export interface WatermarkProps {
  /** Cliente inyectable (tests). Por defecto se crea uno con worker real. (R62) */
  client?: PdfClient;
  /** Contador de páginas inyectable (tests). Por defecto `pdfjsPageCount`. */
  countPages?: PageCounter;
  /**
   * Factoría de rasterizador para la vista previa (tests). Por defecto la del
   * panel `LivePreview` (`createPdfjsPageRasterizer`). No es una estructura de
   * opciones de la herramienta; solo plumbing de render (R25b).
   */
  createRasterizer?: PageRasterizerFactory;
}

/**
 * Ancho aproximado del texto en puntos PDF para posicionar el overlay de la
 * vista previa. Aproximación tipográfica (sin DOM); el modelo puro solo coloca.
 */
function approxTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.6;
}

export function Watermark({
  client,
  countPages,
  createRasterizer,
}: WatermarkProps = {}): JSX.Element {
  // Se crea el cliente (y su worker) una sola vez; si se inyecta, se reutiliza.
  const pdfClient = useMemo(() => client ?? createPdfClient(), [client]);
  const counter = countPages ?? pdfjsPageCount;

  const [files, setFiles] = useState<File[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [selection, setSelection] = useState<PageSelectionState | null>(null);
  const [mode, setMode] = useState<WatermarkMode>("text");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [text, setText] = useState("CONFIDENCIAL");
  const [fontSize, setFontSize] = useState(DEFAULT_WATERMARK_FONT_SIZE);
  const [position, setPosition] = useState<WatermarkPosition>("center");
  const [opacity, setOpacity] = useState(DEFAULT_WATERMARK_OPACITY);
  const [angle, setAngle] = useState(DEFAULT_WATERMARK_ANGLE);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Tamaño real de la página (puntos PDF) que reporta el panel al rasterizar, y
  // tamaño intrínseco de la imagen de marca; ambos alimentan `previewModel`.
  const [previewPageSize, setPreviewPageSize] =
    useState<PreviewPageSize | null>(null);
  const [imageSize, setImageSize] = useState<ContentSize | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // `toPageSelection` devuelve "all"/spec/"" según la selección; "" deshabilita.
  const pages = selection ? toPageSelection(selection) : "";

  // Página a previsualizar: la primera de la selección; "" → 0. (R28)
  const previewPageIndex = resolvePreviewPageIndex(pages, pageCount);

  // Carga el tamaño intrínseco de la imagen de marca para el overlay (modo
  // imagen). En modo texto o sin imagen, no hay tamaño de imagen.
  useEffect(() => {
    if (mode !== "image" || imageFiles.length === 0) {
      setImageSize(null);
      return;
    }
    const url = URL.createObjectURL(imageFiles[0]);
    const img = new Image();
    img.onload = (): void => {
      setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.src = url;
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [mode, imageFiles]);

  // Overlays de aproximación derivados de las opciones de dominio EXISTENTES
  // (`WatermarkOptions`) mediante `previewModel`; sin estructuras nuevas. (R25a, R25b)
  const overlays: PreviewOverlay[] = useMemo(() => {
    if (!previewPageSize) {
      return [];
    }
    const options: WatermarkOptions = {
      mode,
      text,
      image: null,
      position,
      opacity,
      angle,
      fontSize,
      pages: pages === "" ? "all" : pages,
    };
    const content: ContentSize | null =
      mode === "image"
        ? imageSize
        : { width: approxTextWidth(text, fontSize), height: fontSize };
    if (!content) {
      return [];
    }
    return [buildWatermarkOverlay(options, previewPageSize, content)];
  }, [
    previewPageSize,
    imageSize,
    mode,
    text,
    position,
    opacity,
    angle,
    fontSize,
    pages,
  ]);

  // El botón se habilita con un PDF, una selección no vacía y, en modo imagen,
  // con una imagen cargada. La validación real la hace el dominio en el worker.
  const canWatermark =
    files.length > 0 &&
    pages !== "" &&
    !(mode === "image" && imageFiles.length === 0) &&
    status !== "processing";

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
    setPreviewPageSize(null);
    if (next.length > 0) {
      void loadPageCount(next[0]);
    }
  }

  async function handleWatermark(): Promise<void> {
    if (
      files.length === 0 ||
      pages === "" ||
      (mode === "image" && imageFiles.length === 0)
    ) {
      return;
    }
    setStatus("processing");
    setProgress(0);
    setResultBlob(null);
    setErrorMessage(null);

    try {
      // Lee los bytes del PDF (y de la imagen en modo imagen) y delega la marca
      // en el worker. (R56, R57)
      const buffer = await files[0].arrayBuffer();
      const image =
        mode === "image"
          ? new Uint8Array(await imageFiles[0].arrayBuffer())
          : null;
      const bytes = await pdfClient.addWatermark(
        new Uint8Array(buffer),
        {
          mode,
          text,
          image,
          position,
          opacity,
          angle,
          fontSize,
          pages,
        },
        (p) => setProgress(p),
      );
      setResultBlob(pdfBytesToBlob(bytes));
      setStatus("done");
    } catch (error) {
      // En fallo no se ofrece descarga; solo mensaje legible. (R60, R61)
      setErrorMessage(messageForError(error));
      setStatus("error");
    }
  }

  function handleDownload(): void {
    if (resultBlob) {
      downloadBlob(resultBlob, "marca-agua.pdf");
    }
  }

  function handleReset(): void {
    abortRef.current?.abort();
    setFiles([]);
    setPageCount(0);
    setSelection(null);
    setMode("text");
    setImageFiles([]);
    setText("CONFIDENCIAL");
    setFontSize(DEFAULT_WATERMARK_FONT_SIZE);
    setPosition("center");
    setOpacity(DEFAULT_WATERMARK_OPACITY);
    setAngle(DEFAULT_WATERMARK_ANGLE);
    setStatus("idle");
    setProgress(0);
    setResultBlob(null);
    setErrorMessage(null);
    setPreviewPageSize(null);
    setImageSize(null);
  }

  return (
    <section className="py-8">
      <ToolPageHeader toolId="watermark" />

      <div className="mt-8 flex flex-col gap-6">
        <Dropzone
          files={files}
          onFilesChange={handleFilesChange}
          validation={PDF_VALIDATION}
          multiple={false}
          label="Arrastra tu PDF aquí — ¡prometo no chismosear!"
        />

        <div className="optpanel max-w-[640px]">
          <h3 className="hand mb-2.5 mt-0 text-xl font-normal text-ink">
            Pestañas del cuaderno
          </h3>
          <div
            role="group"
            aria-label="Modo de marca"
            className="flex flex-wrap gap-2"
          >
            {WATERMARK_MODES.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                aria-pressed={mode === value}
                className={`btn ${mode === value ? "!bg-hl-green" : ""}`}
              >
                {MODE_LABELS[value]}
              </button>
            ))}
          </div>
        </div>

        {mode === "image" && (
          <div className="flex flex-col gap-2">
            <span className="hand text-lg text-ink">
              Imagen de marca
            </span>
            <Dropzone
              files={imageFiles}
              onFilesChange={setImageFiles}
              validation={IMAGE_VALIDATION}
              multiple={false}
              label="Arrastra tu imagen (JPG o PNG) o haz clic para seleccionar"
            />
          </div>
        )}

        {mode === "text" && (
          <>
            <div className="flex flex-col gap-2">
              <label
                htmlFor="watermark-text"
                className="hand text-lg text-ink"
              >
                Texto de la marca
              </label>
              <input
                id="watermark-text"
                type="text"
                value={text}
                onChange={(event) => setText(event.target.value)}
                className="hand w-full max-w-sm border-0 border-b-[2.5px] border-dashed border-ink bg-paper px-2 py-1.5 text-lg text-ink outline-none"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label
                htmlFor="watermark-font-size"
                className="hand text-lg text-ink"
              >
                Tamaño de fuente
              </label>
              <input
                id="watermark-font-size"
                type="number"
                min={1}
                value={fontSize}
                onChange={(event) => setFontSize(Number(event.target.value))}
                className="hand w-full max-w-[8rem] border-0 border-b-[2.5px] border-dashed border-ink bg-paper px-2 py-1.5 text-lg text-ink outline-none"
              />
            </div>
          </>
        )}

        <div className="flex flex-col gap-2">
          <label
            htmlFor="watermark-position"
            className="hand text-lg text-ink"
          >
            Posición
          </label>
          <select
            id="watermark-position"
            value={position}
            onChange={(event) =>
              setPosition(event.target.value as WatermarkPosition)
            }
            className="hand w-full max-w-sm border-0 border-b-[2.5px] border-dashed border-ink bg-paper px-2 py-1.5 text-lg text-ink outline-none"
          >
            {WATERMARK_POSITIONS.map((value) => (
              <option key={value} value={value}>
                {POSITION_LABELS[value]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="watermark-opacity"
            className="hand text-lg text-ink"
          >
            Opacidad
          </label>
          <input
            id="watermark-opacity"
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={opacity}
            onChange={(event) => setOpacity(Number(event.target.value))}
            className="hand w-full max-w-[8rem] border-0 border-b-[2.5px] border-dashed border-ink bg-paper px-2 py-1.5 text-lg text-ink outline-none"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="watermark-angle"
            className="hand text-lg text-ink"
          >
            Ángulo de rotación
          </label>
          <input
            id="watermark-angle"
            type="number"
            value={angle}
            onChange={(event) => setAngle(Number(event.target.value))}
            className="hand w-full max-w-[8rem] border-0 border-b-[2.5px] border-dashed border-ink bg-paper px-2 py-1.5 text-lg text-ink outline-none"
          />
        </div>

        {selection && pageCount > 0 && (
          <div className="flex flex-col gap-2">
            <span className="hand text-lg text-ink">
              Páginas a marcar
            </span>
            <PageRangeSelector
              pageCount={pageCount}
              value={selection}
              onChange={setSelection}
              showAdvanced
            />
          </div>
        )}

        {files.length > 0 && (
          <LivePreview
            file={files[0]}
            pageIndex={previewPageIndex}
            overlays={overlays}
            onPageSize={setPreviewPageSize}
            createRasterizer={createRasterizer}
          />
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleWatermark()}
            disabled={!canWatermark}
            className="btn btn-primary lv-ligera"
          >
            Pasar el rodillo
          </button>
          {files.length === 0 && (
            <span className="hand soft text-base">
              Selecciona un PDF para marcar.
            </span>
          )}
        </div>

        {status === "processing" && (
          <div className="flex max-w-[640px] flex-col gap-2.5" aria-live="polite">
            <p className="hand m-0 text-xl text-ink">El rodillo fantasma recorre tus páginas… <span className="scrawl soft">~fssshh~</span></p>
            <ProgressBar value={progress} />
          </div>
        )}

        {status === "done" && resultBlob && (
          <ResultPanel
            fileName="con-marca.pdf"
            onDownload={handleDownload}
            onReset={handleReset}
            costLevel="light"
            title="¡Listo! Rodillo pasado."
          />
        )}

        {status === "error" && errorMessage && (
          <ErrorBubble message={errorMessage} />
        )}
      </div>
    </section>
  );
}
