import { useEffect, useRef, useState } from "react";

import { ImagePreviewModal } from "@/components/ImagePreviewModal";
import { PdfPreviewModal } from "@/components/PdfPreviewModal";
import { formatBytes } from "@/lib/formatBytes";
import { moveItem, removeItem } from "@/lib/fileList";
import {
  validateFiles,
  type FileValidationConfig,
  type RejectedFile,
} from "@/lib/fileValidation";
import { isImageFile } from "@/lib/imageFileTypes";
import { createPdfjsPageRasterizer } from "@/lib/pdfjsPageRasterizer";
import { pdfjsPageCount } from "@/lib/pdfjsPageCounter";
import { renderPdfThumbnailUrl } from "@/lib/pdfThumbnail";
import {
  countPdfPages,
  formatPageCount,
  type PageCounter,
  type PageCountResult,
} from "@/pdf/pageCount";
import type { PageRasterizerFactory } from "@/pdf/rasterize";

/** Estado de conteo por archivo: en curso o resultado final. */
type PageCountState = PageCountResult | { status: "counting" };

/**
 * Estado de la miniatura por archivo: generándose, lista (con su object URL) o
 * no disponible (fallo de rasterizado del PDF). (R15, R20)
 */
type ThumbnailState =
  | { status: "loading" }
  | { status: "ready"; url: string }
  | { status: "unavailable" };

/** ¿El archivo es un PDF (por extensión o MIME)? Solo estos se cuentan. (R17) */
function isPdfFile(file: File): boolean {
  return (
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
  );
}

/**
 * Miniatura de la fila junto al conteo:
 * - sin estado (archivo sin miniatura) → nada,
 * - `"loading"` → placeholder de carga accesible (R15),
 * - `"ready"` → `<img>` con la object URL local (R12, R13),
 * - `"unavailable"` → marcador neutro (R20).
 */
function renderThumbnail(
  file: File,
  state: ThumbnailState | undefined,
): JSX.Element | null {
  if (!state) {
    return null;
  }
  if (state.status === "loading") {
    return (
      <span
        className="mono soft flex h-10 w-10 items-center justify-center text-xs"
        aria-label={`Generando miniatura de ${file.name}`}
      >
        …
      </span>
    );
  }
  if (state.status === "ready") {
    return (
      <img
        src={state.url}
        alt={`Miniatura de ${file.name}`}
        className="h-10 w-10 rounded border-[2px] border-ink object-cover"
      />
    );
  }
  // "unavailable": marcador neutro, sin romper la fila. (R20)
  return (
    <span
      className="mono soft flex h-10 w-10 items-center justify-center text-lg"
      aria-hidden="true"
    >
      🗎
    </span>
  );
}

/**
 * Renderiza el estado de conteo de un archivo junto a su tamaño:
 * - sin estado (archivo no-PDF) → nada (R17),
 * - `"counting"` → "contando…" (R4a),
 * - `"counted"` → "N páginas"/"1 página" (R2, R3),
 * - `"unavailable"` → "páginas: —" con aviso accesible (R11, R12a).
 */
function renderPageCount(state: PageCountState | undefined): JSX.Element | null {
  if (!state) {
    return null;
  }
  if (state.status === "counting") {
    return <span className="text-xs text-ink-soft">contando…</span>;
  }
  if (state.status === "counted") {
    return (
      <span className="text-xs text-ink-soft">
        {formatPageCount(state.pages)}
      </span>
    );
  }
  if (state.status === "unavailable") {
    return (
      <span
        className="text-xs text-ink-soft"
        title="No se pudo determinar el número de páginas."
        aria-label="No se pudo determinar el número de páginas."
      >
        páginas: —
      </span>
    );
  }
  // "cancelled" no debería mostrarse (se descarta antes de aplicarse). (R14b)
  return null;
}

export interface DropzoneProps {
  /** Lista controlada por el consumidor (la herramienta). */
  files: readonly File[];
  /** Notifica la nueva lista tras añadir/quitar/reordenar. */
  onFilesChange: (files: File[]) => void;
  /** Configuración de validación; el consumidor inyecta el límite de tamaño. */
  validation: FileValidationConfig;
  /** Permite múltiples archivos. Por defecto true. */
  multiple?: boolean;
  /** Texto/etiqueta de la zona, para accesibilidad y UI. */
  label?: string;
  /**
   * Contador de páginas inyectable (tests). Por defecto `pdfjsPageCount`
   * (pdf.js). Sigue el patrón de inyección `createRasterizer?` de
   * `PdfToImages`. (R1)
   */
  countPages?: PageCounter;
  /**
   * Factoría de rasterizador inyectable (tests) para el visor de vista previa.
   * Por defecto `createPdfjsPageRasterizer` (pdf.js). Mismo patrón que
   * `countPages`. (R18)
   */
  createRasterizer?: PageRasterizerFactory;
}

export function Dropzone({
  files,
  onFilesChange,
  validation,
  multiple = true,
  label = "Arrastra tus archivos aquí — ¡prometo no chismosear!",
  countPages = pdfjsPageCount,
  createRasterizer = createPdfjsPageRasterizer,
}: DropzoneProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [rejected, setRejected] = useState<RejectedFile[]>([]);
  // Archivo cuyo visor de vista previa está abierto (o null). (R18)
  const [previewFile, setPreviewFile] = useState<File | null>(null);

  // Estado de conteo por archivo, con clave = referencia del objeto `File`
  // (estable entre renders porque la lista la controla el padre).
  const [pageCounts, setPageCounts] = useState<Map<File, PageCountState>>(
    () => new Map(),
  );
  // Un `AbortController` por archivo, para abortar conteos individualmente.
  const controllersRef = useRef<Map<File, AbortController>>(new Map());
  // El último `countPages` recibido, sin reiniciar el efecto al cambiar la prop.
  const countPagesRef = useRef(countPages);
  countPagesRef.current = countPages;

  // Estado de miniatura por archivo (clave = referencia del `File`). (R12–R15)
  const [thumbnails, setThumbnails] = useState<Map<File, ThumbnailState>>(
    () => new Map(),
  );
  // Un `AbortController` por miniatura PDF en curso, para cancelarla. (R17)
  const thumbControllersRef = useRef<Map<File, AbortController>>(new Map());
  // Object URLs vivas de miniaturas, para revocarlas al quitar/desmontar. (R18)
  const thumbUrlsRef = useRef<Map<File, string>>(new Map());
  // Último `createRasterizer` recibido, sin reiniciar el efecto al cambiar prop.
  const createRasterizerRef = useRef(createRasterizer);
  createRasterizerRef.current = createRasterizer;

  // Actualiza la miniatura de un archivo solo si sigue trazado. (R17, R18)
  function applyThumbnail(file: File, state: ThumbnailState): void {
    setThumbnails((prev) => {
      if (!prev.has(file)) {
        return prev;
      }
      const next = new Map(prev);
      next.set(file, state);
      return next;
    });
  }

  // Actualiza el resultado de un archivo solo si sigue trazado. (R14b, R15)
  function applyResult(file: File, result: PageCountResult): void {
    setPageCounts((prev) => {
      if (!prev.has(file)) {
        return prev;
      }
      const next = new Map(prev);
      next.set(file, result);
      return next;
    });
  }

  // Arranca/cancela conteos al cambiar la lista de archivos. (R1, R13, R17)
  useEffect(() => {
    const present = new Set(files);
    const controllers = controllersRef.current;

    // Archivos quitados/reemplazados: abortar su conteo y olvidar su estado. (R13)
    for (const [file, controller] of controllers) {
      if (!present.has(file)) {
        controller.abort();
        controllers.delete(file);
      }
    }
    setPageCounts((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const file of prev.keys()) {
        if (!present.has(file)) {
          next.delete(file);
          changed = true;
        }
      }
      return changed ? next : prev;
    });

    // Archivos PDF nuevos: iniciar conteo asíncrono y cancelable. (R1, R17)
    for (const file of files) {
      if (!isPdfFile(file) || controllers.has(file)) {
        continue;
      }
      const controller = new AbortController();
      controllers.set(file, controller);
      setPageCounts((prev) => new Map(prev).set(file, { status: "counting" }));

      void (async (): Promise<void> => {
        let input: Uint8Array;
        try {
          input = new Uint8Array(await file.arrayBuffer());
        } catch {
          if (!controller.signal.aborted) {
            applyResult(file, { status: "unavailable" });
          }
          return;
        }
        const result = await countPdfPages(
          input,
          countPagesRef.current,
          controller.signal,
        );
        // No actualizar la lista con un resultado cancelado. (R14b)
        if (result.status === "cancelled" || controller.signal.aborted) {
          return;
        }
        applyResult(file, result);
      })();
    }
  }, [files]);

  // Al desmontar: abortar todos los conteos en curso. (R15)
  useEffect(() => {
    const controllers = controllersRef.current;
    return () => {
      for (const controller of controllers.values()) {
        controller.abort();
      }
      controllers.clear();
    };
  }, []);

  // Genera/cancela miniaturas al cambiar la lista. Imagen → object URL local;
  // PDF → rasteriza SOLO la página 1 de forma asíncrona y cancelable. (R12–R20)
  useEffect(() => {
    const present = new Set(files);
    const controllers = thumbControllersRef.current;
    const urls = thumbUrlsRef.current;

    // Archivos quitados/reemplazados: abortar su generación y revocar su URL. (R17, R18)
    for (const [file, controller] of controllers) {
      if (!present.has(file)) {
        controller.abort();
        controllers.delete(file);
      }
    }
    for (const [file, url] of urls) {
      if (!present.has(file)) {
        URL.revokeObjectURL(url);
        urls.delete(file);
      }
    }
    setThumbnails((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const file of prev.keys()) {
        if (!present.has(file)) {
          next.delete(file);
          changed = true;
        }
      }
      return changed ? next : prev;
    });

    // Archivos nuevos: generar su miniatura una sola vez. Un archivo ya tratado
    // tiene controlador (PDF) u object URL (imagen); se salta.
    for (const file of files) {
      if (controllers.has(file) || urls.has(file)) {
        continue;
      }
      if (isImageFile(file)) {
        // Imagen: object URL local inmediata; sin red. (R12, R19)
        const url = URL.createObjectURL(file);
        urls.set(file, url);
        setThumbnails((prev) =>
          new Map(prev).set(file, { status: "ready", url }),
        );
        continue;
      }
      if (!isPdfFile(file)) {
        continue;
      }
      // PDF: miniatura de la página 1, asíncrona y cancelable. (R13, R14, R16)
      const controller = new AbortController();
      controllers.set(file, controller);
      setThumbnails((prev) => new Map(prev).set(file, { status: "loading" }));

      void (async (): Promise<void> => {
        let bytes: Uint8Array;
        try {
          bytes = new Uint8Array(await file.arrayBuffer());
        } catch {
          if (!controller.signal.aborted) {
            applyThumbnail(file, { status: "unavailable" });
          }
          return;
        }
        try {
          const url = await renderPdfThumbnailUrl(
            bytes,
            createRasterizerRef.current,
            controller.signal,
          );
          if (controller.signal.aborted) {
            // La generación fue cancelada tras crear la URL: revocarla. (R17, R18)
            URL.revokeObjectURL(url);
            return;
          }
          urls.set(file, url);
          applyThumbnail(file, { status: "ready", url });
        } catch {
          // Rasterizado fallido o abortado: no disponible, sin propagar. (R20)
          if (!controller.signal.aborted) {
            applyThumbnail(file, { status: "unavailable" });
          }
        }
      })();
    }
  }, [files]);

  // Al desmontar: abortar todas las miniaturas y revocar todas sus URLs. (R18)
  useEffect(() => {
    const controllers = thumbControllersRef.current;
    const urls = thumbUrlsRef.current;
    return () => {
      for (const controller of controllers.values()) {
        controller.abort();
      }
      controllers.clear();
      for (const url of urls.values()) {
        URL.revokeObjectURL(url);
      }
      urls.clear();
    };
  }, []);

  function addFiles(incoming: readonly File[]): void {
    const { accepted, rejected: nextRejected } = validateFiles(
      incoming,
      validation,
    );
    setRejected(nextRejected);
    if (accepted.length > 0) {
      onFilesChange([...files, ...accepted]);
    }
  }

  function openPicker(): void {
    inputRef.current?.click();
  }

  function handleInputChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ): void {
    const selected = event.target.files;
    if (selected) {
      addFiles(Array.from(selected));
    }
    // Permite volver a seleccionar el mismo archivo tras quitarlo.
    event.target.value = "";
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    setIsDragOver(false);
    const dropped = event.dataTransfer?.files;
    if (dropped && dropped.length > 0) {
      addFiles(Array.from(dropped));
    }
  }

  function handleDragOver(event: React.DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    setIsDragOver(true);
  }

  function handleDragLeave(): void {
    setIsDragOver(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`dropzone ${isDragOver ? "!bg-hl-green/30" : ""}`}
      >
        <span className="tape !left-[70px] -rotate-[5deg]" aria-hidden="true" />
        <p className="hand m-0 text-2xl text-ink">{label}</p>
        <p className="mono soft mb-3.5 mt-1.5 text-xs">
          nunca sale de tu dispositivo · validación y límites: los de siempre
        </p>
        <button type="button" onClick={openPicker} className="btn">
          …o elige {multiple ? "archivos" : "un archivo"}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple={multiple}
          onChange={handleInputChange}
          className="sr-only"
          aria-hidden="true"
          tabIndex={-1}
        />
      </div>

      {files.length > 0 && (
        <ul className="flex list-none flex-col gap-2.5 p-0">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className={`filerow ${index % 2 === 0 ? "-rotate-[0.5deg]" : "rotate-[0.6deg]"}`}
            >
              {renderThumbnail(file, thumbnails.get(file)) ?? (
                <span className="scrawl" aria-hidden="true">
                  🗎
                </span>
              )}
              <span className="hand flex-1 truncate text-[19px] text-ink">
                {file.name}
              </span>
              <span className="mono soft text-xs">{formatBytes(file.size)}</span>
              {renderPageCount(pageCounts.get(file))}
              {(isPdfFile(file) || isImageFile(file)) && (
                <button
                  type="button"
                  onClick={() => setPreviewFile(file)}
                  aria-label={`Vista previa de ${file.name}`}
                  className="btn !px-3 !py-0.5 !text-base"
                >
                  Vista previa
                </button>
              )}
              <button
                type="button"
                onClick={() => onFilesChange(moveItem(files, index, index - 1))}
                disabled={index === 0}
                aria-label={`Mover ${file.name} hacia arriba`}
                className="btn h-8 w-8 !p-0 !text-base"
                style={{ borderRadius: "50% 45% 55% 50%" }}
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => onFilesChange(moveItem(files, index, index + 1))}
                disabled={index === files.length - 1}
                aria-label={`Mover ${file.name} hacia abajo`}
                className="btn h-8 w-8 !p-0 !text-base"
                style={{ borderRadius: "45% 55% 50% 50%" }}
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => onFilesChange(removeItem(files, index))}
                aria-label={`Quitar ${file.name}`}
                className="hand cursor-pointer border-none bg-transparent px-2 py-1 text-lg text-mk-red"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {rejected.length > 0 && (
        <div role="alert" className="flex flex-col gap-1">
          {rejected.map((item, index) => (
            <p
              key={`${item.file.name}-${index}`}
              className="hand m-0 text-[17px] text-mk-red"
            >
              {item.file.name}: {item.message}
            </p>
          ))}
        </div>
      )}

      {previewFile &&
        (isPdfFile(previewFile) ? (
          <PdfPreviewModal
            file={previewFile}
            onClose={() => setPreviewFile(null)}
            createRasterizer={createRasterizer}
          />
        ) : (
          <ImagePreviewModal
            file={previewFile}
            onClose={() => setPreviewFile(null)}
          />
        ))}
    </div>
  );
}
