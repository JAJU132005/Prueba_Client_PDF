import { useEffect, useMemo, useRef, useState } from "react";

import { Dropzone } from "@/components/Dropzone";
import { ErrorBubble } from "@/components/ErrorBubble";
import { ProgressBar } from "@/components/ProgressBar";
import { ResultPanel } from "@/components/ResultPanel";
import { ToolPageHeader } from "@/components/ToolPageHeader";
import { LivePreview } from "@/components/LivePreview";
import { PageRangeSelector } from "@/components/PageRangeSelector";
import { SignaturePad } from "@/components/SignaturePad";
import { downloadBlob, pdfBytesToBlob } from "@/lib/download";
import {
  DEFAULT_MAX_FILE_BYTES,
  type FileValidationConfig,
} from "@/lib/fileValidation";
import { pdfjsPageCount } from "@/lib/pdfjsPageCounter";
import { countPdfPages, type PageCounter } from "@/pdf/pageCount";
import type { PageSelectionState } from "@/pdf/pageSelection";
import type { PreviewOverlay, PreviewPageSize } from "@/pdf/previewModel";
import type { PageRasterizerFactory } from "@/pdf/rasterize";
import {
  computeSignaturePlacement,
  type SignOptions,
} from "@/pdf/signature";
import {
  WATERMARK_MARGIN,
  WATERMARK_POSITIONS,
  type WatermarkPosition,
} from "@/pdf/watermark";
import {
  createPdfClient,
  isPdfWorkerError,
  type PdfClient,
} from "@/workers/pdfClient";

type Status = "idle" | "processing" | "done" | "error";
type SignatureSource = "upload" | "draw";

/** Validación del Dropzone del PDF: un único PDF. */
export const PDF_VALIDATION: FileValidationConfig = {
  allowedExtensions: [".pdf"],
  allowedMimeTypes: ["application/pdf"],
  maxBytes: DEFAULT_MAX_FILE_BYTES,
};

/** Validación del Dropzone de la imagen de firma: JPG/PNG. (R15) */
export const IMAGE_VALIDATION: FileValidationConfig = {
  allowedExtensions: [".jpg", ".jpeg", ".png"],
  allowedMimeTypes: ["image/jpeg", "image/png"],
  maxBytes: DEFAULT_MAX_FILE_BYTES,
};

/** Aviso visible: firma VISUAL, no una firma digital certificada. (R17) */
export const SIGNATURE_NOTICE =
  "Firma visual: se coloca tu firma como una imagen sobre el PDF; no es una firma digital certificada.";

/** Ancho objetivo por defecto de la firma, en puntos PDF. */
const DEFAULT_WIDTH_PTS = 150;

/** Etiqueta legible de cada posición. */
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

/** Mapea el `name` estable del error de dominio a un mensaje legible. (R23) */
function messageForError(error: unknown): string {
  if (isPdfWorkerError(error)) {
    switch (error.name) {
      case "InvalidPdfError":
        return "El archivo no es un PDF válido.";
      case "InvalidImageError":
        return "La firma no es un JPG o PNG válido.";
      case "SignFailedError":
        return "No se pudo firmar el PDF.";
      default:
        break;
    }
  }
  return "Ocurrió un error inesperado al firmar el PDF.";
}

export interface SignPdfProps {
  /** Cliente inyectable (tests). Por defecto se crea uno con worker real. */
  client?: PdfClient;
  /** Contador de páginas inyectable (tests). Por defecto `pdfjsPageCount`. */
  countPages?: PageCounter;
  /** Factoría de rasterizador para la vista previa (tests). */
  createRasterizer?: PageRasterizerFactory;
}

/**
 * Herramienta "Firmar PDF" (#24). Coloca una firma VISUAL (imagen subida o
 * dibujada) en la página y posición elegidas mediante `pdfClient.sign` (pdf-lib
 * en el worker). Aclara que la firma es visual, no certificada (R17). Cero red:
 * la descarga usa un Blob local. La UI no contiene lógica de PDF.
 */
export function SignPdf({
  client,
  countPages,
  createRasterizer,
}: SignPdfProps = {}): JSX.Element {
  const pdfClient = useMemo(() => client ?? createPdfClient(), [client]);
  const counter = countPages ?? pdfjsPageCount;

  const [files, setFiles] = useState<File[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [source, setSource] = useState<SignatureSource>("upload");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [signatureBytes, setSignatureBytes] = useState<Uint8Array | null>(null);
  const [signatureSize, setSignatureSize] = useState<PreviewPageSize | null>(
    null,
  );
  const [position, setPosition] = useState<WatermarkPosition>("bottom-right");
  const [widthPts, setWidthPts] = useState(DEFAULT_WIDTH_PTS);
  const [previewPageSize, setPreviewPageSize] =
    useState<PreviewPageSize | null>(null);
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

  // Bytes de la firma subida cuando el modo es "upload".
  useEffect(() => {
    if (source !== "upload") {
      return;
    }
    if (imageFiles.length === 0) {
      setSignatureBytes(null);
      return;
    }
    let cancelled = false;
    void (async (): Promise<void> => {
      const bytes = new Uint8Array(await imageFiles[0].arrayBuffer());
      if (!cancelled) {
        setSignatureBytes(bytes);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source, imageFiles]);

  // Tamaño intrínseco de la firma (para aproximar el overlay de la vista previa).
  useEffect(() => {
    if (!signatureBytes) {
      setSignatureSize(null);
      return;
    }
    const url = URL.createObjectURL(new Blob([new Uint8Array(signatureBytes)]));
    const img = new Image();
    img.onload = (): void => {
      setSignatureSize({
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
    };
    img.src = url;
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [signatureBytes]);

  // Selección visual single-active: solo la página activa aparece marcada. (R18)
  const selection: PageSelectionState = useMemo(
    () => ({ pageCount, selected: new Set([activePageIndex]) }),
    [pageCount, activePageIndex],
  );

  // Overlay imagen de aproximación derivado de `computeSignaturePlacement`. (R25)
  const overlays: PreviewOverlay[] = useMemo(() => {
    if (!previewPageSize || !signatureSize) {
      return [];
    }
    const placement = computeSignaturePlacement(
      signatureSize.width,
      signatureSize.height,
      previewPageSize.width,
      previewPageSize.height,
      widthPts,
      position,
      WATERMARK_MARGIN,
    );
    return [
      {
        x: placement.x,
        y: placement.y,
        width: placement.width,
        height: placement.height,
        opacity: 1,
        rotationDegrees: 0,
        content: { kind: "image" },
      },
    ];
  }, [previewPageSize, signatureSize, widthPts, position]);

  const canSign =
    files.length > 0 && signatureBytes !== null && status !== "processing";

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
      setActivePageIndex(0);
    } else {
      setPageCount(0);
    }
  }

  function handleFilesChange(next: File[]): void {
    abortRef.current?.abort();
    setFiles(next);
    setPageCount(0);
    setActivePageIndex(0);
    setStatus("idle");
    setProgress(0);
    setResultBlob(null);
    setErrorMessage(null);
    setPreviewPageSize(null);
    if (next.length > 0) {
      void loadPageCount(next[0]);
    }
  }

  // El selector es multi-toggle; aquí como single-active: la página recién
  // marcada (distinta de la activa) pasa a ser la activa. (R18)
  function handleSelectionChange(next: PageSelectionState): void {
    const candidate = [...next.selected].find((i) => i !== activePageIndex);
    if (candidate !== undefined) {
      setActivePageIndex(candidate);
    }
  }

  function handleSourceChange(next: SignatureSource): void {
    setSource(next);
    setSignatureBytes(null);
    setImageFiles([]);
  }

  function handleDrawnSignature(bytes: Uint8Array): void {
    setSignatureBytes(bytes); // (R16)
  }

  async function handleSign(): Promise<void> {
    if (files.length === 0 || signatureBytes === null) {
      return;
    }
    setStatus("processing");
    setProgress(0);
    setResultBlob(null);
    setErrorMessage(null);

    try {
      const buffer = await files[0].arrayBuffer();
      const options: SignOptions = {
        pageIndex: activePageIndex,
        position,
        widthPts,
        image: signatureBytes,
      };
      const bytes = await pdfClient.sign(
        new Uint8Array(buffer),
        options,
        (p) => setProgress(p),
      ); // (R20)
      setResultBlob(pdfBytesToBlob(bytes));
      setStatus("done");
    } catch (error) {
      // En fallo no se ofrece descarga; solo mensaje legible. (R23)
      setErrorMessage(messageForError(error));
      setStatus("error");
    }
  }

  function handleDownload(): void {
    if (resultBlob) {
      downloadBlob(resultBlob, "firmado.pdf"); // (R21)
    }
  }

  function handleReset(): void {
    abortRef.current?.abort();
    setFiles([]);
    setPageCount(0);
    setActivePageIndex(0);
    setSource("upload");
    setImageFiles([]);
    setSignatureBytes(null);
    setSignatureSize(null);
    setPosition("bottom-right");
    setWidthPts(DEFAULT_WIDTH_PTS);
    setPreviewPageSize(null);
    setStatus("idle");
    setProgress(0);
    setResultBlob(null);
    setErrorMessage(null);
  }

  return (
    <section className="py-8">
      <ToolPageHeader toolId="sign" />

      {/* Aviso de firma visual, no certificada (R17; texto ÍNTEGRO, #28 R37) */}
      <div role="note" className="postit mt-4 max-w-xl text-ink">
        {SIGNATURE_NOTICE}
      </div>

      <div className="mt-8 flex flex-col gap-6">
        <Dropzone
          files={files}
          onFilesChange={handleFilesChange}
          validation={PDF_VALIDATION}
          multiple={false}
          label="Arrastra tu PDF aquí — ¡prometo no chismosear!"
        />

        <div className="flex flex-col gap-2">
          <label htmlFor="signature-source" className="hand text-lg text-ink">
            Origen de la firma
          </label>
          <select
            id="signature-source"
            value={source}
            onChange={(event) =>
              handleSourceChange(event.target.value as SignatureSource)
            }
            className="hand w-full max-w-sm border-0 border-b-[2.5px] border-dashed border-ink bg-paper px-2 py-1.5 text-lg text-ink outline-none"
          >
            <option value="upload">Subir imagen</option>
            <option value="draw">Dibujar</option>
          </select>
        </div>

        {source === "upload" && (
          <div className="flex flex-col gap-2">
            <span className="hand text-lg text-ink">
              Imagen de firma
            </span>
            <Dropzone
              files={imageFiles}
              onFilesChange={setImageFiles}
              validation={IMAGE_VALIDATION}
              multiple={false}
              label="Arrastra tu firma (JPG o PNG) o haz clic para seleccionar"
            />
          </div>
        )}

        {source === "draw" && (
          <div className="flex flex-col gap-2">
            <span className="hand text-lg text-ink">Dibuja tu firma</span>
            <SignaturePad onCapture={handleDrawnSignature} />
            {signatureBytes !== null && (
              <span className="hand soft text-base">
                Firma dibujada lista.
              </span>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <label htmlFor="signature-position" className="hand text-lg text-ink">
            Posición
          </label>
          <select
            id="signature-position"
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
          <label htmlFor="signature-width" className="hand text-lg text-ink">
            Ancho de la firma (puntos)
          </label>
          <input
            id="signature-width"
            type="number"
            min={1}
            value={widthPts}
            onChange={(event) => setWidthPts(Number(event.target.value))}
            className="hand w-full max-w-[8rem] border-0 border-b-[2.5px] border-dashed border-ink bg-paper px-2 py-1.5 text-lg text-ink outline-none"
          />
        </div>

        {files.length > 0 && pageCount > 0 && (
          <div className="flex flex-col gap-2">
            <span className="hand text-lg text-ink">
              Página donde firmar
            </span>
            <PageRangeSelector
              pageCount={pageCount}
              value={selection}
              onChange={handleSelectionChange}
            />
          </div>
        )}

        {files.length > 0 && (
          <LivePreview
            file={files[0]}
            pageIndex={activePageIndex}
            overlays={overlays}
            onPageSize={setPreviewPageSize}
            createRasterizer={createRasterizer}
          />
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleSign()}
            disabled={!canSign}
            className="btn btn-primary lv-media"
          >
            Firmar PDF
          </button>
          {files.length === 0 && (
            <span className="hand soft text-base">
              Selecciona un PDF para firmar.
            </span>
          )}
          {files.length > 0 && signatureBytes === null && (
            <span className="hand soft text-base">
              Sube o dibuja una firma.
            </span>
          )}
        </div>

        {status === "processing" && (
          <div className="flex max-w-[640px] flex-col gap-2.5" aria-live="polite">
            <p className="hand m-0 text-xl text-ink">El panda sigue tu trazo con la mirada…</p>
            <ProgressBar value={progress} />
          </div>
        )}

        {status === "done" && resultBlob && (
          <ResultPanel
            fileName="firmado.pdf"
            onDownload={handleDownload}
            onReset={handleReset}
            costLevel="medium"
            title="¡Listo! Autógrafo estampado."
          />
        )}

        {status === "error" && errorMessage && (
          <ErrorBubble message={errorMessage} />
        )}
      </div>
    </section>
  );
}
