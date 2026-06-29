import { InvalidByteValueError } from "@/lib/errors";

const UNITS = ["B", "KB", "MB", "GB", "TB", "PB"] as const;
const BASE = 1024;

/**
 * Formatea un número de bytes a una cadena legible con su unidad (base 1024).
 *
 * - `formatBytes(0)` -> `"0 B"`
 * - `formatBytes(1536)` -> `"1.5 KB"`
 *
 * Lanza {@link InvalidByteValueError} si `bytes` es negativo o no finito
 * (`NaN`, `Infinity`), en lugar de devolver una cadena inválida.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    throw new InvalidByteValueError(bytes);
  }

  if (bytes === 0) {
    return "0 B";
  }

  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(BASE)),
    UNITS.length - 1,
  );
  const value = bytes / BASE ** exponent;
  const rounded = Math.round(value * 100) / 100;

  return `${rounded} ${UNITS[exponent]}`;
}
