import { ProtectFailedError, type ProgressCallback } from "@/pdf/types";

/** Modos de la operación, en orden. (R1) */
export type ProtectMode = "protect" | "unlock";

/** Lista canónica de modos. (R1) */
export const PROTECT_MODES: readonly ProtectMode[] = ["protect", "unlock"];

/** Opciones de la operación. */
export interface ProtectOptions {
  mode: ProtectMode;
  password: string;
}

/**
 * Costura inyectable que cifra/descifra bytes de PDF. La implementación concreta
 * (`@cantoo/pdf-lib`) vive en `@/lib/cantooPdfCryptoEngine`. El orquestador no
 * conoce la librería de cifrado: solo intercambia bytes↔bytes. (R10, R11)
 */
export interface PdfCryptoEngine {
  /** Devuelve un PDF cifrado que requiere `password` para abrirse. */
  encrypt(input: Uint8Array, password: string): Promise<Uint8Array>;
  /**
   * Devuelve el PDF descifrado; lanza `IncorrectPasswordError` si la contraseña
   * es errónea.
   */
  decrypt(input: Uint8Array, password: string): Promise<Uint8Array>;
}

/**
 * Orquesta proteger/desbloquear delegando el cifrado real en `engine`.
 *
 * - Lanza `ProtectFailedError` si el modo es inválido o la contraseña es vacía,
 *   antes de tocar el motor. (R2, R3)
 * - `mode "protect"` → `engine.encrypt`; `mode "unlock"` → `engine.decrypt`.
 *   (R4, R4b, R5, R5b)
 * - Devuelve los bytes del motor sin alterarlos. (R6)
 * - Propaga los `PdfWorkerError` del motor conservando su `name`, sin
 *   envolverlos. (R7)
 * - Emite progreso en `[0, 1]`, terminando en `1`. (R8, R9)
 *
 * Función pura respecto a React/DOM; el cifrado vive tras `engine`. (R10)
 */
export async function protectPdf(
  input: Uint8Array,
  options: ProtectOptions,
  engine: PdfCryptoEngine,
  onProgress?: ProgressCallback,
): Promise<Uint8Array> {
  onProgress?.(0);

  // Validación antes de tocar el motor de cifrado. (R2, R3)
  if (!PROTECT_MODES.includes(options.mode)) {
    throw new ProtectFailedError("El modo de operación no es válido.");
  }
  if (options.password === "") {
    throw new ProtectFailedError("La contraseña no puede estar vacía.");
  }

  // Despacho según modo. Los errores del motor se propagan sin envolver. (R7)
  const bytes =
    options.mode === "protect"
      ? await engine.encrypt(input, options.password) // (R4, R4b)
      : await engine.decrypt(input, options.password); // (R5, R5b)

  onProgress?.(1); // (R9)
  return bytes; // (R6)
}
