import { useRef, useState } from "react";

import { formatBytes } from "@/lib/formatBytes";
import { moveItem, removeItem } from "@/lib/fileList";
import {
  validateFiles,
  type FileValidationConfig,
  type RejectedFile,
} from "@/lib/fileValidation";

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
}

export function Dropzone({
  files,
  onFilesChange,
  validation,
  multiple = true,
  label = "Arrastra archivos o haz clic para seleccionar",
}: DropzoneProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [rejected, setRejected] = useState<RejectedFile[]>([]);

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
    </div>
  );
}
