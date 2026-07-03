import { useEffect, useRef, useState } from "react";

import { PdfPreviewModal } from "@/components/PdfPreviewModal";
import { formatBytes } from "@/lib/formatBytes";
import { moveItem, removeItem } from "@/lib/fileList";
import {
  validateFiles,
  type FileValidationConfig,
  type RejectedFile,
} from "@/lib/fileValidation";
import { createPdfjsPageRasterizer } from "@/lib/pdfjsPageRasterizer";
import { pdfjsPageCount } from "@/lib/pdfjsPageCounter";
import {
  countPdfPages,
  formatPageCount,
  type PageCounter,
  type PageCountResult,
} from "@/pdf/pageCount";
import type { PageRasterizerFactory } from "@/pdf/rasterize";

/** Estado de conteo por archivo: en curso o resultado final. */
type PageCountState = PageCountResult | { status: "counting" };

/** ¿El archivo es un PDF (por extensión o MIME)? Solo estos se cuentan. (R17) */
function isPdfFile(file: File): boolean {
  return (
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
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
    return <span className="text-xs text-text-muted">contando…</span>;
  }
  if (state.status === "counted") {
    return (
      <span className="text-xs text-text-muted">
        {formatPageCount(state.pages)}
      </span>
    );
  }
  if (state.status === "unavailable") {
    return (
      <span
        className="text-xs text-text-muted"
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
  label = "Arrastra archivos o haz clic para seleccionar",
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
        className={`rounded-2xl border-2 border-dashed bg-surface p-8 text-center transition duration-150 ease-out motion-reduce:transition-none ${
          isDragOver ? "border-primary bg-primary/5" : "border-border"
        }`}
      >
        <button
          type="button"
          onClick={openPicker}
          className="mx-auto flex flex-col items-center gap-2 rounded-xl px-4 py-2 text-text-muted transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg motion-reduce:transition-none"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-8 w-8"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5V18a2.25 2.25 0 0 0 2.25 2.25h13.5A2.25 2.25 0 0 0 21 18v-1.5m-13.5-6L12 4.5m0 0 4.5 4.5M12 4.5V15"
            />
          </svg>
          <span className="text-sm font-medium text-text">{label}</span>
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
        <ul className="flex flex-col gap-2">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3"
            >
              <span className="flex-1 truncate text-sm font-medium text-text">
                {file.name}
              </span>
              <span className="text-xs text-text-muted">
                {formatBytes(file.size)}
              </span>
              {renderPageCount(pageCounts.get(file))}
              {isPdfFile(file) && (
                <button
                  type="button"
                  onClick={() => setPreviewFile(file)}
                  aria-label={`Vista previa de ${file.name}`}
                  className="rounded-md px-2 py-1 text-xs font-medium text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
                >
                  Vista previa
                </button>
              )}
              <button
                type="button"
                onClick={() => onFilesChange(moveItem(files, index, index - 1))}
                disabled={index === 0}
                aria-label={`Mover ${file.name} hacia arriba`}
                className="rounded-md px-2 py-1 text-text-muted transition hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40 motion-reduce:transition-none"
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => onFilesChange(moveItem(files, index, index + 1))}
                disabled={index === files.length - 1}
                aria-label={`Mover ${file.name} hacia abajo`}
                className="rounded-md px-2 py-1 text-text-muted transition hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40 motion-reduce:transition-none"
              >
                ▼
              </button>
              <button
                type="button"
                onClick={() => onFilesChange(removeItem(files, index))}
                aria-label={`Quitar ${file.name}`}
                className="rounded-md px-2 py-1 text-danger transition hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger motion-reduce:transition-none"
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
              className="text-sm text-danger"
            >
              {item.file.name}: {item.message}
            </p>
          ))}
        </div>
      )}

      {previewFile && (
        <PdfPreviewModal
          file={previewFile}
          onClose={() => setPreviewFile(null)}
          createRasterizer={createRasterizer}
        />
      )}
    </div>
  );
}
