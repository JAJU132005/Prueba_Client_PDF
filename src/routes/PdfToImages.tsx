import { useEffect, useRef, useState } from "react";

import { Dropzone } from "@/components/Dropzone";
import { downloadBlob } from "@/lib/download";
import {
  DEFAULT_MAX_FILE_BYTES,
  type FileValidationConfig,
} from "@/lib/fileValidation";
import { createPdfjsPageRasterizer } from "@/lib/pdfjsPageRasterizer";
import { createZipBlob } from "@/lib/zip";
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
      setPageCount(rasterizer.pageCount());
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
      // Render incremental, página a página, cancelable. (R30, R40)
      await rasterizePages(
        rasterizer,
        options,
        (page) => setPages((prev) => [...prev, page]),
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

  const canConvert = pageCount > 0 && status !== "processing";

  return (
    <section className="py-8">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold text-text md:text-4xl">
            PDF a imágenes
          </h1>
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            100% local
          </span>
        </div>
        <p className="max-w-2xl text-base text-text-muted">
          Convierte cada página de tu PDF en una imagen PNG o JPG. Descárgalas
          una a una o todas juntas en un ZIP. Tu archivo se procesa en tu
          navegador y nunca se sube a ningún servidor.
        </p>
      </header>

      <div className="mt-8 flex flex-col gap-6">
        <Dropzone
          files={files}
          onFilesChange={handleFilesChange}
          validation={PDF_VALIDATION}
          multiple={false}
          label="Arrastra tu PDF o haz clic para seleccionar"
        />

        {pageCount > 0 && (
          <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6">
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium text-text">Formato</legend>
              <div className="flex flex-wrap gap-3">
                {IMAGE_FORMATS.map((value) => (
                  <label
                    key={value}
                    className="flex items-center gap-2 text-sm text-text"
                  >
                    <input
                      type="radio"
                      name="format"
                      value={value}
                      checked={format === value}
                      onChange={() => setFormat(value)}
                    />
                    {FORMAT_LABELS[value]}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="flex flex-col gap-2">
              <label
                htmlFor="resolution"
                className="text-sm font-medium text-text"
              >
                Resolución
              </label>
              <select
                id="resolution"
                value={resolution}
                onChange={(event) =>
                  setResolution(event.target.value as ImageResolution)
                }
                className="w-48 rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text"
              >
                {RESOLUTIONS.map((value) => (
                  <option key={value} value={value}>
                    {RESOLUTION_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void handleConvert()}
                disabled={!canConvert}
                className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
              >
                Convertir
              </button>
            </div>
          </div>
        )}

        {status === "processing" && (
          <div className="flex flex-col gap-2" aria-live="polite">
            <div className="flex items-center justify-between text-sm text-text-muted">
              <span>Convirtiendo localmente…</span>
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

        {pages.length > 0 && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void handleDownloadZip()}
                className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg motion-reduce:transition-none"
              >
                Descargar ZIP
              </button>
            </div>
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              {pages.map((page) => (
                <li
                  key={page.index}
                  data-testid={`page-${page.index}`}
                  className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-2"
                >
                  <span className="text-xs text-text-muted">
                    Página {page.index + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDownloadPage(page)}
                    aria-label={`Descargar la página ${page.index + 1}`}
                    className="rounded-md px-2 py-1 text-xs font-medium text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    Descargar
                  </button>
                </li>
              ))}
            </ul>
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
