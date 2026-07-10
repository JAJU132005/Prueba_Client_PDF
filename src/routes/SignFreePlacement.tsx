import { useEffect, useMemo, useRef, useState } from "react";

import { Dropzone } from "@/components/Dropzone";
import { ErrorBubble } from "@/components/ErrorBubble";
import { LivePreview } from "@/components/LivePreview";
import { PageRangeSelector } from "@/components/PageRangeSelector";
import { ProgressBar } from "@/components/ProgressBar";
import { ResultPanel } from "@/components/ResultPanel";
import { SignaturePad } from "@/components/SignaturePad";
import { SignaturePlacementCanvas } from "@/components/SignaturePlacementCanvas";
import { ToolPageHeader } from "@/components/ToolPageHeader";
import { downloadBlob, pdfBytesToBlob } from "@/lib/download";
import {
  DEFAULT_MAX_FILE_BYTES,
  type FileValidationConfig,
} from "@/lib/fileValidation";
import { pdfjsPageCount } from "@/lib/pdfjsPageCounter";
import type { AnnotationColor } from "@/pdf/annotate";
import { countPdfPages, type PageCounter } from "@/pdf/pageCount";
import type { PageSelectionState } from "@/pdf/pageSelection";
import type { PreviewOverlay } from "@/pdf/previewModel";
import type { PageRasterizerFactory } from "@/pdf/rasterize";
import {
  buildSignatureAnnotations,
  computeSignatureBox,
  formatSignatureDate,
  type FreePlacement,
  type SignatureExtra,
} from "@/pdf/signature";
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

/** Aviso visible: firma VISUAL, no una firma digital certificada. (R19) */
export const SIGNATURE_NOTICE =
  "Firma visual: se coloca tu firma como una imagen sobre el PDF; no es una firma digital certificada.";

/** Ancho objetivo por defecto de la firma, en puntos PDF. */
const DEFAULT_WIDTH_PTS = 150;
/** Caja de firma por defecto (antes de conocer el tamaño intrínseco). */
const DEFAULT_PLACEMENT: FreePlacement = {
  x: 40,
  y: 40,
  width: DEFAULT_WIDTH_PTS,
  height: DEFAULT_WIDTH_PTS / 2,
};
/** Color por defecto de los extras (negro). */
const EXTRA_COLOR: AnnotationColor = { r: 0, g: 0, b: 0 };
/** Tamaño de fuente por defecto de los extras (pts PDF). */
const EXTRA_FONT_SIZE = 14;

/** Mapea el `name` estable del error de dominio a un mensaje legible. (R23) */
function messageForError(error: unknown): string {
  if (isPdfWorkerError(error)) {
    switch (error.name) {
      case "InvalidPdfError":
        return "El archivo no es un PDF válido.";
      case "InvalidImageError":
        return "La firma no es un JPG o PNG válido.";
      case "AnnotateFailedError":
        return "No se pudo firmar el PDF.";
      default:
        break;
    }
  }
  return "Ocurrió un error inesperado al firmar el PDF.";
}

export interface SignFreePlacementProps {
  /** Cliente inyectable (tests). Por defecto se crea uno con worker real. */
  client?: PdfClient;
  /** Contador de páginas inyectable (tests). Por defecto `pdfjsPageCount`. */
  countPages?: PageCounter;
  /** Factoría de rasterizador para la vista previa/lienzo (tests). */
  createRasterizer?: PageRasterizerFactory;
}

/**
 * Herramienta "Firmar PDF (colocación libre)" (#30). Coloca una firma VISUAL
 * (subida o dibujada) en CUALQUIER posición arrastrándola sobre la página,
 * redimensionándola con tiradores (aspecto preservado) y aplicándola a VARIAS
 * páginas en una sola exportación, más elementos opcionales colocables (fecha,
 * iniciales/nombre). Enruta por `pdfClient.annotate` (imagen + textos como
 * anotaciones que aplana `flattenAnnotations` en el worker). Cero red: la
 * descarga usa un Blob local. La UI no contiene lógica de PDF.
 */
export function SignFreePlacement({
  client,
  countPages,
  createRasterizer,
}: SignFreePlacementProps = {}): JSX.Element {
  const pdfClient = useMemo(() => client ?? createPdfClient(), [client]);
  const counter = countPages ?? pdfjsPageCount;

  const [files, setFiles] = useState<File[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [selection, setSelection] = useState<PageSelectionState>({
    pageCount: 0,
    selected: new Set<number>(),
  });
  const [source, setSource] = useState<SignatureSource>("upload");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [signatureBytes, setSignatureBytes] = useState<Uint8Array | null>(null);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [placement, setPlacement] = useState<FreePlacement>(DEFAULT_PLACEMENT);
  const [extras, setExtras] = useState<SignatureExtra[]>([]);
  const [extraText, setExtraText] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const extraIdRef = useRef(0);

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

  // Object URL de la firma para dibujarla en el lienzo/preview. (sin red)
  useEffect(() => {
    if (!signatureBytes) {
      setSignatureUrl(null);
      return;
    }
    const url = URL.createObjectURL(
      new Blob([new Uint8Array(signatureBytes)], { type: "image/png" }),
    );
    setSignatureUrl(url);
    // Tamaño intrínseco → ajusta la caja preservando el aspecto real.
    const img = new Image();
    img.onload = (): void => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        setPlacement((prev) =>
          computeSignatureBox(
            img.naturalWidth,
            img.naturalHeight,
            { x: prev.x, y: prev.y },
            prev.width,
          ),
        );
      }
    };
    img.src = url;
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [signatureBytes]);

  const aspectRatio =
    placement.height > 0 ? placement.width / placement.height : 2;

  // Índice de página activa para el lienzo/preview: menor índice seleccionado.
  const activePageIndex = useMemo(() => {
    if (selection.selected.size === 0) {
      return 0;
    }
    return Math.min(...selection.selected);
  }, [selection]);

  // Overlays de aproximación para LivePreview: imagen de la firma + extras. (R25)
  const overlays: PreviewOverlay[] = useMemo(() => {
    if (!signatureBytes) {
      return [];
    }
    const list: PreviewOverlay[] = [
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
    for (const extra of extras) {
      list.push({
        x: extra.at.x,
        y: extra.at.y,
        width: extra.text.length * extra.fontSize * 0.6,
        height: extra.fontSize,
        opacity: 1,
        rotationDegrees: 0,
        content: { kind: "text", text: extra.text, fontSize: extra.fontSize },
      });
    }
    return list;
  }, [signatureBytes, placement, extras]);

  const canSign =
    files.length > 0 &&
    signatureBytes !== null &&
    selection.selected.size > 0 &&
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
      // Por defecto se firma la primera página; el usuario añade más.
      setSelection({ pageCount: result.pages, selected: new Set([0]) });
    } else {
      setPageCount(0);
      setSelection({ pageCount: 0, selected: new Set<number>() });
    }
  }

  function handleFilesChange(next: File[]): void {
    abortRef.current?.abort();
    setFiles(next);
    setPageCount(0);
    setSelection({ pageCount: 0, selected: new Set<number>() });
    setStatus("idle");
    setProgress(0);
    setResultBlob(null);
    setErrorMessage(null);
    if (next.length > 0) {
      void loadPageCount(next[0]);
    }
  }

  function handleSourceChange(next: SignatureSource): void {
    setSource(next);
    setSignatureBytes(null);
    setImageFiles([]);
    setPlacement(DEFAULT_PLACEMENT);
    setExtras([]);
  }

  function handleDrawnSignature(bytes: Uint8Array): void {
    setSignatureBytes(bytes); // (R16)
  }

  function handleAddDate(): void {
    extraIdRef.current += 1;
    const extra: SignatureExtra = {
      id: `extra-${String(extraIdRef.current)}`,
      kind: "date", // (R17)
      text: formatSignatureDate(new Date()),
      at: { x: placement.x, y: Math.max(placement.y - EXTRA_FONT_SIZE - 4, 4) },
      fontSize: EXTRA_FONT_SIZE,
      color: EXTRA_COLOR,
    };
    setExtras((prev) => [...prev, extra]);
  }

  function handleAddText(): void {
    const text = extraText.trim();
    if (text === "") {
      return; // (R18): solo con texto no vacío
    }
    extraIdRef.current += 1;
    const extra: SignatureExtra = {
      id: `extra-${String(extraIdRef.current)}`,
      kind: "text", // (R18)
      text,
      at: {
        x: placement.x,
        y: Math.max(placement.y - 2 * (EXTRA_FONT_SIZE + 4), 4),
      },
      fontSize: EXTRA_FONT_SIZE,
      color: EXTRA_COLOR,
    };
    setExtras((prev) => [...prev, extra]);
    setExtraText("");
  }

  function handleRemoveExtra(id: string): void {
    setExtras((prev) => prev.filter((e) => e.id !== id));
  }

  async function handleSign(): Promise<void> {
    if (
      files.length === 0 ||
      signatureBytes === null ||
      selection.selected.size === 0
    ) {
      return;
    }
    setStatus("processing");
    setProgress(0);
    setResultBlob(null);
    setErrorMessage(null);

    try {
      const buffer = await files[0].arrayBuffer();
      const pageIndices = [...selection.selected].sort((a, b) => a - b);
      const annotations = buildSignatureAnnotations(
        placement,
        signatureBytes,
        pageIndices,
        extras,
        (pageIndex, part) => `sig-${String(pageIndex)}-${part}`,
      ); // (R14)
      const bytes = await pdfClient.annotate(
        new Uint8Array(buffer),
        annotations,
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
    setSelection({ pageCount: 0, selected: new Set<number>() });
    setSource("upload");
    setImageFiles([]);
    setSignatureBytes(null);
    setPlacement(DEFAULT_PLACEMENT);
    setExtras([]);
    setExtraText("");
    setStatus("idle");
    setProgress(0);
    setResultBlob(null);
    setErrorMessage(null);
  }

  return (
    <section className="py-8">
      <ToolPageHeader toolId="sign-free" />

      {/* Aviso de firma visual, no certificada (R19) */}
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
            <span className="hand text-lg text-ink">Imagen de firma</span>
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
              <span className="hand soft text-base">Firma dibujada lista.</span>
            )}
          </div>
        )}

        {files.length > 0 && pageCount > 0 && (
          <div className="flex flex-col gap-2">
            <span className="hand text-lg text-ink">
              Páginas donde firmar (elige una o varias)
            </span>
            <PageRangeSelector
              pageCount={pageCount}
              value={selection}
              onChange={setSelection}
            />
          </div>
        )}

        {signatureBytes !== null && (
          <div className="flex flex-col gap-3">
            <span className="hand text-lg text-ink">Elementos opcionales</span>
            <div className="flex flex-wrap items-end gap-2">
              <button
                type="button"
                onClick={handleAddDate}
                className="btn !px-4 !py-1 !text-base"
              >
                Añadir fecha
              </button>
              <input
                type="text"
                value={extraText}
                onChange={(event) => setExtraText(event.target.value)}
                aria-label="Iniciales o nombre"
                placeholder="Iniciales o nombre"
                className="hand w-full max-w-xs border-0 border-b-[2.5px] border-dashed border-ink bg-paper px-2 py-1 text-base text-ink outline-none placeholder:text-ink-soft"
              />
              <button
                type="button"
                onClick={handleAddText}
                className="btn !px-4 !py-1 !text-base"
              >
                Añadir texto
              </button>
            </div>
            {extras.length > 0 && (
              <ul className="flex flex-col gap-1 p-0">
                {extras.map((extra) => (
                  <li
                    key={extra.id}
                    className="hand flex items-center gap-3 text-base text-ink"
                  >
                    <span data-testid="extra-item">{extra.text}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveExtra(extra.id)}
                      aria-label={`Quitar ${extra.text}`}
                      className="text-mk-red underline"
                    >
                      Quitar
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {files.length > 0 && signatureBytes !== null && pageCount > 0 && (
          <SignaturePlacementCanvas
            file={files[0]}
            pageIndex={activePageIndex}
            placement={placement}
            onPlacementChange={setPlacement}
            aspectRatio={aspectRatio}
            signatureUrl={signatureUrl}
            extras={extras}
            createRasterizer={createRasterizer}
          />
        )}

        {files.length > 0 && (
          <LivePreview
            file={files[0]}
            pageIndex={activePageIndex}
            overlays={overlays}
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
            <p className="hand m-0 text-xl text-ink">
              El panda coloca tu firma con esmero…
            </p>
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
