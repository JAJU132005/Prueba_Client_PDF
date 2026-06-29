import { ProbeFailedError, type ProgressCallback } from "@/pdf/types";

export interface ProbeInput {
  /** Valores a sumar; el progreso avanza un paso por valor. */
  values: readonly number[];
  /** Si es true, la operación lanza ProbeFailedError (para testear errores). */
  fail?: boolean;
}

export interface ProbeResult {
  sum: number;
  count: number;
}

/**
 * Operación de prueba: suma `values` emitiendo progreso 0..1. Es el "ping"
 * mockeable que valida el contrato del worker sin lógica de PDF real. Pura y
 * síncrona: no toca el DOM ni Comlink.
 */
export function probe(
  input: ProbeInput,
  onProgress?: ProgressCallback,
): ProbeResult {
  const { values, fail } = input;
  const count = values.length;

  if (count === 0) {
    onProgress?.(1);
    return { sum: 0, count: 0 };
  }

  onProgress?.(0);

  let sum = 0;
  for (let i = 0; i < count; i++) {
    sum += values[i];
    if (fail === true && i === count - 1) {
      throw new ProbeFailedError();
    }
    onProgress?.((i + 1) / count);
  }

  return { sum, count };
}
