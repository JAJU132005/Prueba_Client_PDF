import { useEffect, useRef, useState } from "react";

import { PageRangeSelector } from "@/components/PageRangeSelector";
import { Dropzone } from "@/components/Dropzone";
import { ErrorBubble } from "@/components/ErrorBubble";
import { ProgressBar } from "@/components/ProgressBar";
import { ToolPageHeader } from "@/components/ToolPageHeader";
import { downloadBlob } from "@/lib/download";
import {
  DEFAULT_MAX_FILE_BYTES,
  type FileValidationConfig,
} from "@/lib/fileValidation";
import { createPdfjsPageRasterizer } from "@/lib/pdfjsPageRasterizer";
import { createZipBlob } from "@/lib/zip";
import {
  createSelection,
  resolvePages,
  toPageSelection,
  type PageSelectionState,
} from "@/pdf/pageSelection";
import {
  IMAGE_FORMATS,
  imageFileName,
  rasterizePages,
  scaleForResolution,
  type ImageFormat,
  type ImageResolution,
  type PageRasterizer,
  type PageRasterizerFactory,
  type RasterizedPage,
} from "@/pdf/rasterize";

type Status = "idle" | "processing" | "done" | "error";

const PDF_VALIDATION: FileValidationConfig = {
  allowedExtensions: [".pdf"],
  allowedMimeTypes: ["application/pdf"],
  maxBytes: DEFAULT_MAX_FILE_BYTES,
};

/** Calidad de exportación JPG (ignorada en PNG). */
const JPEG_QUALITY = 0.92;

const FORMAT_LABELS: Record<ImageFormat, string> = {
  png: "PNG",
  jpeg: "JPG",
};

const RESOLUTIONS: readonly ImageResolution[] = ["low", "medium", "high"];
const RESOLUTION_LABELS: Record<ImageResolution, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
};

export interface PdfToImagesProps {
  /**
   * Factoría de rasterizador inyectable (tests). Por defecto
   * `createPdfjsPageRasterizer` (pdf.js). (R36)
   */
  createRasterizer?: PageRasterizerFactory;
}

export function PdfToImages(props?: PdfToImagesProps): JSX.Element {
  const createRasterizer =
    props?.createRasterizer ?? createPdfjsPageRasterizer;

  const [files, setFiles] = useState<File[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [selection, setSelection] = useState<PageSelectionState | null>(null);
  const [format, setFormat] = useState<ImageFormat>("png");
  const [resolution, setResolution] = useState<ImageResolution>("medium");
  const [pages, setPages] = useState<RasterizedPage[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const rasterizerRef = useRef<PageRasterizer | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  /** Aborta el render en curso y libera el rasterizador activo. (R40) */
  function teardownRasterizer(): void {
    abortRef.current?.abort();
    abortRef.current = null;
    rasterizerRef.current?.destroy();
    rasterizerRef.current = null;
  }

  // Limpieza al desmontar: aborta el render y libera el rasterizador. (R40)
  useEffect(() => {
    return () => {
      teardownRasterizer();
    };
  }, []);

  async function loadFile(file: File): Promise<void> {
    try {
      const buffer = await file.arrayBuffer();
      const input = new Uint8Array(buffer);
      // Crea el rasterizador (pdf.js parsea en su propio worker). (R27)
      const rasterizer = await createRasterizer(input);
      rasterizerRef.current = rasterizer;
      const count = rasterizer.pageCount();
      setPageCount(count);
      setSelection(createSelection(count));
    } catch {
      // No se pudo abrir el PDF: mensaje de error y sin descargas. (R34)
      setErrorMessage("No se pudo abrir el PDF.");
      setStatus("error");
    }
  }

  function handleFilesChange(next: File[]): void {
    // Cambio/limpieza de archivo: aborta el render previo y libera recursos. (R40)
    teardownRasterizer();
    setFiles(next);
    setPageCount(0);
    setSelection(null);
    setPages([]);
    setStatus("idle");
    setProgress(0);
    setErrorMessage(null);
    if (next.length > 0) {
      void loadFile(next[0]);
    }
  }

  async function handleConvert(): Promise<void> {
    const rasterizer = rasterizerRef.current;
    if (!rasterizer) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("processing");
    setProgress(0);
    setPages([]);
    setErrorMessage(null);
    try {
      const options = {
        format,
        scale: scaleForResolution(resolution),
        quality: JPEG_QUALITY,
      };
      // Solo se exportan las páginas resueltas por el selector; el filtrado
      // ocurre en la capa UI para no cambiar la firma de `rasterizePages`. (R27)
      const selectedSet = new Set(
        selection ? resolvePages(toPageSelection(selection), pageCount) : [],
      );
      // Render incremental, página a página, cancelable. (R30, R40)
      await rasterizePages(
        rasterizer,
        options,
        (page) => {
          if (selectedSet.has(page.index)) {
            setPages((prev) => [...prev, page]);
          }
        },
        controller.signal,
        (p) => setProgress(p),
      );
      if (!controller.signal.aborted) {
        setStatus("done");
      }
    } catch {
      // No se pudo rasterizar: mensaje de error y sin descargas. (R34)
      if (!controller.signal.aborted) {
        setErrorMessage("No se pudo convertir el PDF a imágenes.");
        setStatus("error");
      }
    }
  }

  function handleDownloadPage(page: RasterizedPage): void {
    // Descarga local vía URL de objeto; sin red. (R32)
    downloadBlob(page.blob, imageFileName(page.index, format));
  }

  async function handleDownloadZip(): Promise<void> {
    // Lee los bytes de cada blob ya rasterizado y arma el ZIP en cliente. (R33)
    const zipFiles = await Promise.all(
      pages.map(async (page) => ({
        name: imageFileName(page.index, format),
        bytes: new Uint8Array(await page.blob.arrayBuffer()),
      })),
    );
    const zip = createZipBlob(zipFiles);
    downloadBlob(zip, "imagenes.zip");
  }

  const canConvert =
    pageCount > 0 &&
    selection !== null &&
    toPageSelection(selection) !== "" &&
    status !== "processing";

  return (
    <section className="py-8">
      <ToolPageHeader toolId="pdf-to-images" />

      <div className="mt-8 flex flex-col gap-6">
        <Dropzone
          files={files}
          onFilesChange={handleFilesChange}
          validation={PDF_VALIDATION}
          multiple={false}
          label="Arrastra tu PDF aquí — ¡prometo no chismosear!"
        />

        {pageCount > 0 && (
          <div className="optpanel flex flex-col gap-4">
            <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
              <legend className="hand p-0 text-lg text-ink">
                Formato (ruedecita de la cámara)
              </legend>
              <div className="flex flex-wrap gap-2">
                {IMAGE_FORMATS.map((value) => (
                  <label
                    key={value}
                    className={`btn flex cursor-pointer items-center gap-2 !text-base ${
                      format === value ? "!bg-hl-orange" : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name="format"
                      value={value}
                      checked={format === value}
                      onChange={() => setFormat(value)}
                      className="h-4 w-4 accent-[var(--mk-orange)]"
                    />
                    {FORMAT_LABELS[value]}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="flex flex-col gap-2">
              <span className="hand text-lg text-ink">Resolución</span>
              <div
                role="group"
                aria-label="Resolución"
                className="flex flex-wrap gap-2"
              >
                {RESOLUTIONS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setResolution(value)}
                    aria-pressed={resolution === value}
                    className={`btn ${resolution === value ? "!bg-hl-orange" : ""}`}
                  >
                    {RESOLUTION_LABELS[value]}
                  </button>
                ))}
              </div>
            </div>

            {selection && (
              <div className="flex flex-col gap-2">
                <span className="hand text-lg text-ink">
                  Páginas a convertir
                </span>
                <PageRangeSelector
                  pageCount={pageCount}
                  value={selection}
                  onChange={setSelection}
                />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void handleConvert()}
                disabled={!canConvert}
                className="btn btn-primary lv-media"
              >
                Convertir
              </button>
            </div>
          </div>
        )}

        {status === "processing" && (
          <div className="flex max-w-[640px] flex-col gap-2.5" aria-live="polite">
            <p className="hand m-0 text-xl text-ink">El panda fotógrafo dispara página a página… <span className="scrawl soft">¡FLASH!</span></p>
            <ProgressBar value={progress} />
          </div>
        )}

        {pages.length > 0 && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void handleDownloadZip()}
                className="btn btn-primary lv-media !px-6 !py-2 !text-xl"
              >
                Descargar ZIP
              </button>
              <span className="hand soft text-base">
                la caja de zapatos con todas tus polaroids
              </span>
            </div>
            <ul className="grid list-none grid-cols-2 gap-4 p-0 sm:grid-cols-3 md:grid-cols-4">
              {pages.map((page) => (
                <li
                  key={page.index}
                  data-testid={`page-${page.index}`}
                  className={`relative flex flex-col gap-2 border-[2.2px] border-ink bg-white p-2 shadow-doodle ${
                    page.index % 2 === 0 ? "-rotate-1" : "rotate-1"
                  }`}
                >
                  <span className="pin !left-1/2 -translate-x-1/2" aria-hidden="true" />
                  <span className="hand soft text-sm">
                    Página {page.index + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDownloadPage(page)}
                    aria-label={`Descargar la página ${page.index + 1}`}
                    className="btn !px-3 !py-0.5 !text-base"
                  >
                    Descargar
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {status === "error" && errorMessage && (
          <ErrorBubble message={errorMessage} />
        )}
      </div>
    </section>
  );
}
