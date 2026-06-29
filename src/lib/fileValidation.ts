import { formatBytes } from "@/lib/formatBytes";

/** Motivo de rechazo: conjunto cerrado, nunca string libre. (R6a) */
export type FileRejectionReason = "type-not-allowed" | "size-exceeded";

/** Configuración de validación inyectada por la herramienta consumidora. */
export interface FileValidationConfig {
  /** Extensiones permitidas, en minúsculas, con punto. Ej.: [".pdf"]. */
  allowedExtensions: readonly string[];
  /** Tipos MIME permitidos. Ej.: ["application/pdf"]. */
  allowedMimeTypes: readonly string[];
  /** Tamaño máximo por archivo, en bytes. */
  maxBytes: number;
}

export interface AcceptedFile {
  status: "accepted";
  file: File;
}

export interface RejectedFile {
  status: "rejected";
  file: File;
  reason: FileRejectionReason;
  /** Mensaje legible en español, listo para mostrar. (R6b) */
  message: string;
}

export type FileValidationResult = AcceptedFile | RejectedFile;

/** Tamaño máximo por defecto si la herramienta no especifica otro. (R10) */
export const DEFAULT_MAX_FILE_BYTES = 100 * 1024 * 1024;

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

function isTypeAllowed(file: File, config: FileValidationConfig): boolean {
  const extension = extensionOf(file.name);
  const extensionAllowed = config.allowedExtensions.includes(extension);
  if (!extensionAllowed) {
    return false;
  }
  // El navegador no siempre reporta el MIME; si está vacío nos apoyamos en la
  // extensión para no rechazar archivos válidos. (R3)
  if (file.type !== "" && !config.allowedMimeTypes.includes(file.type)) {
    return false;
  }
  return true;
}

function messageFor(
  reason: FileRejectionReason,
  config: FileValidationConfig,
): string {
  if (reason === "size-exceeded") {
    return `El archivo supera el tamaño máximo (${formatBytes(config.maxBytes)}).`;
  }
  const allowed = config.allowedExtensions.join(", ");
  return `Tipo de archivo no permitido. Se aceptan: ${allowed}.`;
}

/** Valida un archivo contra la configuración. (R2–R6b) */
export function validateFile(
  file: File,
  config: FileValidationConfig,
): FileValidationResult {
  // Orden: primero tipo, luego tamaño, para dar el mensaje más accionable. (R5, R4)
  if (!isTypeAllowed(file, config)) {
    return {
      status: "rejected",
      file,
      reason: "type-not-allowed",
      message: messageFor("type-not-allowed", config),
    };
  }
  if (file.size > config.maxBytes) {
    return {
      status: "rejected",
      file,
      reason: "size-exceeded",
      message: messageFor("size-exceeded", config),
    };
  }
  return { status: "accepted", file };
}

/** Parte una colección en aceptados y rechazados. (R7) */
export function validateFiles(
  files: readonly File[],
  config: FileValidationConfig,
): { accepted: File[]; rejected: RejectedFile[] } {
  const accepted: File[] = [];
  const rejected: RejectedFile[] = [];
  for (const file of files) {
    const result = validateFile(file, config);
    if (result.status === "accepted") {
      accepted.push(result.file);
    } else {
      rejected.push(result);
    }
  }
  return { accepted, rejected };
}
