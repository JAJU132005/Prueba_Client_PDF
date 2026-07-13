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
import { UndoControls } from "@/components/UndoControls";
import { downloadBlob, pdfBytesToBlob } from "@/lib/download";
import { useUndoableState } from "@/lib/useUndoableState";
import { useUndoKeybinding } from "@/lib/useUndoKeybinding";
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
  addPlacedSignature,
  buildPlacedSignatureAnnotations,
  computeSignatureBox,
  formatSignatureDate,
  removePlacedSignature,
  updatePlacedSignatureBox,
  updatePlacedSignaturePages,
  type FreePlacement,
  type PlacedSignature,
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

/** Validación del Dropzone de la imagen de firma: JPG/PNG. (R13) */
export const IMAGE_VALIDATION: FileValidationConfig = {
  allowedExtensions: [".jpg", ".jpeg", ".png"],
  allowedMimeTypes: ["image/jpeg", "image/png"],
  maxBytes: DEFAULT_MAX_FILE_BYTES,
};

/** Aviso visible: firma VISUAL, no una firma digital certificada. (R21) */
export const SIGNATURE_NOTICE =
  "Firma visual: se coloca tu firma como una imagen sobre el PDF; no es una firma digital certificada.";

/** Ancho objetivo por defecto de una firma recién colocada, en puntos PDF. */
const DEFAULT_WIDTH_PTS = 150;
/** Ancla inferior-izquierda por defecto de una firma recién colocada. */
const DEFAULT_AT = { x: 40, y: 40 };
/** Relación de aspecto por defecto si no se puede medir la imagen. */
const DEFAULT_ASPECT_RATIO = 2;
/** Color por defecto de los extras (negro). */
const EXTRA_COLOR: AnnotationColor = { r: 0, g: 0, b: 0 };
/** Tamaño de fuente por defecto de los extras (pts PDF). */
const EXTRA_FONT_SIZE = 14;

/** Mapea el `name` estable del error de dominio a un mensaje legible. (R25) */
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

export interface SignPdfProps {
  /** Cliente inyectable (tests). Por defecto se crea uno con worker real. */
  client?: PdfClient;
  /** Contador de páginas inyectable (tests). Por defecto `pdfjsPageCount`. */
  countPages?: PageCounter;
  /** Factoría de rasterizador para la vista previa/lienzo (tests). */
  createRasterizer?: PageRasterizerFactory;
}

/**
 * Herramienta unificada "Firmar PDF" (#36). Fusiona la firma con rejilla (#24) y
 * la colocación libre (#30) en UNA sola: crea una firma activa (subida o
 * dibujada), la coloca como VARIAS firmas independientes (`PlacedSignature[]`),
 * cada una movible/redimensionable con aspecto preservado y aplicable a varias
 * páginas, y las aplana TODAS en UNA exportación mediante `pdfClient.annotate`
 * (`flattenAnnotations` en el worker). La firma es VISUAL, no certificada (R21).
 * Cero red: la descarga usa un Blob local. La UI no contiene lógica de PDF.
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
  const [activeSignature, setActiveSignature] = useState<Uint8Array | null>(
    null,
  );
  const [activeAspectRatio, setActiveAspectRatio] =
    useState<number>(DEFAULT_ASPECT_RATIO);
  // Lista de firmas colocadas versionada con historial de deshacer (#37 R29). La
  // selección NO se versiona (estado propio). Los `signatureUrls` se derivan del
  // modelo por `useEffect` (R35), nunca se guardan en el historial.
  const history = useUndoableState<readonly PlacedSignature[]>([]);
  const signatures = history.present;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [signatureUrls, setSignatureUrls] = useState<Record<string, string>>(
    {},
  );
  const [extraText, setExtraText] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const sigIdRef = useRef(0);
  const extraIdRef = useRef(0);
  const urlMapRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Atajo Ctrl+Z / Ctrl+Shift+Z; se ignora con foco en los inputs de la firma. (#37 R31)
  useUndoKeybinding({
    onUndo: history.undo,
    onRedo: history.redo,
    enabled: files.length > 0,
  });

  // Bytes de la firma activa subida cuando el modo es "upload". (R13)
  useEffect(() => {
    if (source !== "upload") {
      return;
    }
    if (imageFiles.length === 0) {
      setActiveSignature(null);
      return;
    }
    let cancelled = false;
    void (async (): Promise<void> => {
      const bytes = new Uint8Array(await imageFiles[0].arrayBuffer());
      if (!cancelled) {
        setActiveSignature(bytes);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source, imageFiles]);

  // Mide el aspecto intrínseco de la firma activa (sin red: object URL local).
  useEffect(() => {
    if (!activeSignature) {
      setActiveAspectRatio(DEFAULT_ASPECT_RATIO);
      return;
    }
    const url = URL.createObjectURL(
      new Blob([new Uint8Array(activeSignature)], { type: "image/png" }),
    );
    const img = new Image();
    img.onload = (): void => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        setActiveAspectRatio(img.naturalWidth / img.naturalHeight);
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [activeSignature]);

  // Object URLs (locales) por firma colocada, para dibujarlas en el lienzo.
  // Se crean solo para ids nuevos y se revocan cuando la firma desaparece.
  useEffect(() => {
    const map = urlMapRef.current;
    const currentIds = new Set(signatures.map((s) => s.id));
    for (const [id, url] of [...map.entries()]) {
      if (!currentIds.has(id)) {
        URL.revokeObjectURL(url);
        map.delete(id);
      }
    }
    for (const sig of signatures) {
      if (!map.has(sig.id)) {
        map.set(
          sig.id,
          URL.createObjectURL(
            new Blob([new Uint8Array(sig.image)], { type: "image/png" }),
          ),
        );
      }
    }
    setSignatureUrls(Object.fromEntries(map));
  }, [signatures]);

  useEffect(() => {
    return () => {
      for (const url of urlMapRef.current.values()) {
        URL.revokeObjectURL(url);
      }
      urlMapRef.current.clear();
    };
  }, []);

  const selectedSig = useMemo(
    () => signatures.find((s) => s.id === selectedId) ?? null,
    [signatures, selectedId],
  );

  // Selección de páginas de la firma seleccionada (para el PageRangeSelector).
  const pageSelection: PageSelectionState = useMemo(
    () => ({
      pageCount,
      selected: new Set(selectedSig?.pageIndices ?? []),
    }),
    [pageCount, selectedSig],
  );

  // Overlays de aproximación para LivePreview: una imagen por firma de la página
  // activa + textos de sus extras. (patrón #30)
  const overlays: PreviewOverlay[] = useMemo(() => {
    const list: PreviewOverlay[] = [];
    for (const sig of signatures) {
      if (!sig.pageIndices.includes(activePageIndex)) {
        continue;
      }
      list.push({
        x: sig.box.x,
        y: sig.box.y,
        width: sig.box.width,
        height: sig.box.height,
        opacity: 1,
        rotationDegrees: 0,
        content: { kind: "image" },
      });
      for (const extra of sig.extras ?? []) {
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
    }
    return list;
  }, [signatures, activePageIndex]);

  const canSign =
    files.length > 0 && signatures.length > 0 && status !== "processing";

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
      setActivePageIndex(0);
    }
  }

  function handleFilesChange(next: File[]): void {
    abortRef.current?.abort();
    setFiles(next);
    setPageCount(0);
    setActivePageIndex(0);
    history.reset([]); // (#37 R33)
    setSelectedId(null);
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
    setActiveSignature(null);
    setImageFiles([]);
  }

  function handleDrawnSignature(bytes: Uint8Array): void {
    setActiveSignature(bytes); // (R14)
  }

  // Añade una firma a la lista con la imagen activa reutilizada. (R15)
  function handleAddSignature(): void {
    if (!activeSignature) {
      return;
    }
    sigIdRef.current += 1;
    const id = `sig-${String(sigIdRef.current)}`;
    // `computeSignatureBox` deriva la caja inicial preservando el aspecto: con
    // (aspectRatio, 1) como (imageWidth, imageHeight) el alto = width/aspect.
    const box = computeSignatureBox(
      activeAspectRatio,
      1,
      DEFAULT_AT,
      DEFAULT_WIDTH_PTS,
    );
    const sig: PlacedSignature = {
      id,
      image: activeSignature,
      box,
      aspectRatio: activeAspectRatio,
      pageIndices: [activePageIndex],
    };
    history.set((prev) => addPlacedSignature(prev, sig)); // (#37 R29)
    setSelectedId(id);
  }

  function handleSelect(id: string | null): void {
    setSelectedId(id); // Selección no versionada. (#37 R34)
  }

  function handlePlacementChange(id: string, box: FreePlacement): void {
    // Mover/redimensionar es un gesto continuo; se coalesce en UNA entrada al
    // soltar (beginGesture/endGesture del lienzo). (#37 R32)
    history.updateGesture((prev) => updatePlacedSignatureBox(prev, id, box)); // (R17, R18)
  }

  function handlePagesChange(next: PageSelectionState): void {
    if (!selectedId) {
      return;
    }
    const pageIndices = [...next.selected].sort((a, b) => a - b);
    history.set((prev) =>
      updatePlacedSignaturePages(prev, selectedId, pageIndices),
    ); // (R20, #37 R29)
  }

  function handleDeleteSelected(): void {
    if (!selectedId) {
      return;
    }
    history.set((prev) => removePlacedSignature(prev, selectedId)); // (R19, #37 R29)
    setSelectedId(null);
  }

  function handleAddDate(): void {
    if (!selectedId) {
      return;
    }
    extraIdRef.current += 1;
    const extra: SignatureExtra = {
      id: `extra-${String(extraIdRef.current)}`,
      kind: "date",
      text: formatSignatureDate(new Date()),
      at: {
        x: (selectedSig?.box.x ?? DEFAULT_AT.x),
        y: Math.max((selectedSig?.box.y ?? DEFAULT_AT.y) - EXTRA_FONT_SIZE - 4, 4),
      },
      fontSize: EXTRA_FONT_SIZE,
      color: EXTRA_COLOR,
    };
    history.set((prev) =>
      prev.map((s) =>
        s.id === selectedId
          ? { ...s, extras: [...(s.extras ?? []), extra] }
          : s,
      ),
    ); // (#37 R29)
  }

  function handleAddText(): void {
    const text = extraText.trim();
    if (text === "" || !selectedId) {
      return;
    }
    extraIdRef.current += 1;
    const extra: SignatureExtra = {
      id: `extra-${String(extraIdRef.current)}`,
      kind: "text",
      text,
      at: {
        x: (selectedSig?.box.x ?? DEFAULT_AT.x),
        y: Math.max(
          (selectedSig?.box.y ?? DEFAULT_AT.y) - 2 * (EXTRA_FONT_SIZE + 4),
          4,
        ),
      },
      fontSize: EXTRA_FONT_SIZE,
      color: EXTRA_COLOR,
    };
    history.set((prev) =>
      prev.map((s) =>
        s.id === selectedId
          ? { ...s, extras: [...(s.extras ?? []), extra] }
          : s,
      ),
    ); // (#37 R29)
    setExtraText("");
  }

  async function handleSign(): Promise<void> {
    if (files.length === 0 || signatures.length === 0) {
      return;
    }
    setStatus("processing");
    setProgress(0);
    setResultBlob(null);
    setErrorMessage(null);

    try {
      const buffer = await files[0].arrayBuffer();
      const annotations = buildPlacedSignatureAnnotations(
        signatures,
        (signatureId, pageIndex, part) =>
          `${signatureId}-${String(pageIndex)}-${part}`,
      ); // (R12)
      const bytes = await pdfClient.annotate(
        new Uint8Array(buffer),
        annotations,
        (p) => setProgress(p),
      ); // (R22)
      setResultBlob(pdfBytesToBlob(bytes));
      setStatus("done");
    } catch (error) {
      // En fallo no se ofrece descarga; solo mensaje legible. (R25)
      setErrorMessage(messageForError(error));
      setStatus("error");
    }
  }

  function handleDownload(): void {
    if (resultBlob) {
      downloadBlob(resultBlob, "firmado.pdf"); // (R23)
    }
  }

  function handleReset(): void {
    abortRef.current?.abort();
    setFiles([]);
    setPageCount(0);
    setActivePageIndex(0);
    setSource("upload");
    setImageFiles([]);
    setActiveSignature(null);
    history.reset([]); // (#37 R33)
    setSelectedId(null);
    setExtraText("");
    setStatus("idle");
    setProgress(0);
    setResultBlob(null);
    setErrorMessage(null);
  }

  const pageOptions = Array.from({ length: pageCount }, (_, i) => i);

  return (
    <section className="py-8">
      <ToolPageHeader toolId="sign" />

      {/* Aviso de firma visual, no certificada (R21) */}
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
            {activeSignature !== null && (
              <span className="hand soft text-base">Firma dibujada lista.</span>
            )}
          </div>
        )}

        {/* Añadir la firma activa a la lista (reutilizable varias veces) (R15) */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleAddSignature}
            disabled={activeSignature === null}
            className="btn !px-4 !py-1 !text-base"
          >
            Añadir firma
          </button>
          {activeSignature === null && (
            <span className="hand soft text-base">
              Sube o dibuja una firma para colocarla.
            </span>
          )}
        </div>

        {/* Página activa a mostrar en el lienzo/preview */}
        {files.length > 0 && pageCount > 1 && (
          <div className="flex flex-col gap-2">
            <label
              htmlFor="active-page"
              className="hand text-lg text-ink"
            >
              Página a mostrar
            </label>
            <select
              id="active-page"
              value={activePageIndex}
              onChange={(event) =>
                setActivePageIndex(Number(event.target.value))
              }
              className="hand w-full max-w-[8rem] border-0 border-b-[2.5px] border-dashed border-ink bg-paper px-2 py-1.5 text-lg text-ink outline-none"
            >
              {pageOptions.map((i) => (
                <option key={i} value={i}>
                  {i + 1}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Lista editable de firmas colocadas */}
        {signatures.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="hand text-lg text-ink">Firmas colocadas</span>
            <ul className="flex flex-col gap-1 p-0">
              {signatures.map((sig, index) => (
                <li
                  key={sig.id}
                  data-testid="placed-signature-item"
                  className="hand flex items-center gap-3 text-base text-ink"
                >
                  <button
                    type="button"
                    onClick={() => handleSelect(sig.id)}
                    aria-pressed={sig.id === selectedId}
                    aria-label={`Firma ${String(index + 1)}`}
                    className={
                      sig.id === selectedId
                        ? "underline decoration-mk-green"
                        : undefined
                    }
                  >
                    Firma {index + 1} (páginas:{" "}
                    {sig.pageIndices.map((p) => p + 1).join(", ")})
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleDeleteSelected}
                disabled={selectedId === null}
                className="btn !px-4 !py-1 !text-base"
              >
                Eliminar firma seleccionada
              </button>
            </div>
          </div>
        )}

        {/* Páginas donde colocar la firma seleccionada (R20) */}
        {selectedSig !== null && files.length > 0 && pageCount > 0 && (
          <div className="flex flex-col gap-2">
            <span className="hand text-lg text-ink">
              Páginas de la firma seleccionada (elige una o varias)
            </span>
            <PageRangeSelector
              pageCount={pageCount}
              value={pageSelection}
              onChange={handlePagesChange}
            />
          </div>
        )}

        {/* Elementos opcionales de la firma seleccionada */}
        {selectedSig !== null && (
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
          </div>
        )}

        {files.length > 0 && pageCount > 0 && (
          <>
            <UndoControls
              canUndo={history.canUndo}
              canRedo={history.canRedo}
              onUndo={history.undo}
              onRedo={history.redo}
            />
            <SignaturePlacementCanvas
              file={files[0]}
              pageIndex={activePageIndex}
              placements={signatures}
              selectedId={selectedId}
              onSelect={handleSelect}
              onPlacementChange={handlePlacementChange}
              onGestureStart={history.beginGesture}
              onGestureEnd={history.endGesture}
              signatureUrls={signatureUrls}
              createRasterizer={createRasterizer}
            />
          </>
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
          {files.length > 0 && signatures.length === 0 && (
            <span className="hand soft text-base">
              Añade al menos una firma al documento.
            </span>
          )}
        </div>

        {status === "processing" && (
          <div className="flex max-w-[640px] flex-col gap-2.5" aria-live="polite">
            <p className="hand m-0 text-xl text-ink">
              El panda coloca tus firmas con esmero…
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
