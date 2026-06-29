import { InvalidRangeError } from "@/pdf/types";

const SINGLE_RE = /^\d+$/;
const RANGE_RE = /^(\d+)\s*-\s*(\d+)$/;

/**
 * Parsea `input` (rangos 1-indexados, p. ej. "1-3,5") contra un documento de
 * `pageCount` páginas y devuelve los índices 0-indexados de las páginas a
 * extraer, en el orden de primera aparición y sin duplicados. (R1–R6)
 *
 * Lanza `InvalidRangeError` si la cadena está vacía (R8), mal formada (R9) o
 * fuera de límites (R10); en error no devuelve arreglo (R11).
 *
 * Función pura: sin `pdf-lib`, sin React, sin DOM. (R7)
 */
export function parsePageRanges(input: string, pageCount: number): number[] {
  // Vacío o solo espacios. (R8)
  if (input.trim() === "") {
    throw new InvalidRangeError("La especificación de rangos está vacía.");
  }

  const pages: number[] = [];

  // Tokenizar por comas; cada token se recorta. Un token vacío (de "1,,2" o
  // coma final/inicial) es malformado. (R2, R6, R9)
  for (const rawToken of input.split(",")) {
    const token = rawToken.trim();
    if (token === "") {
      throw new InvalidRangeError(
        "La especificación de rangos contiene un separador vacío.",
      );
    }

    if (SINGLE_RE.test(token)) {
      // Página única 1-indexada. (R2, R3)
      pages.push(Number(token));
      continue;
    }

    const rangeMatch = RANGE_RE.exec(token);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      // Límites invertidos como "3-1" son malformados. (R9)
      if (start > end) {
        throw new InvalidRangeError(
          `El rango "${token}" tiene los límites invertidos.`,
        );
      }
      for (let p = start; p <= end; p++) {
        pages.push(p);
      }
      continue;
    }

    // No casa página única ni rango: carácter no numérico, límite ausente
    // ("1-", "-3"), etc. (R9)
    throw new InvalidRangeError(`El token "${token}" no es un rango válido.`);
  }

  const seen = new Set<number>();
  const indices: number[] = [];
  for (const page of pages) {
    // Fuera de límites: página 1-indexada < 1 o > pageCount. (R10)
    if (page < 1 || page > pageCount) {
      throw new InvalidRangeError(
        `La página ${String(page)} está fuera de los límites (1-${String(
          pageCount,
        )}).`,
      );
    }
    const index = page - 1; // 0-indexado. (R3)
    // Deduplicar conservando la primera aparición. (R4, R5)
    if (!seen.has(index)) {
      seen.add(index);
      indices.push(index);
    }
  }

  return indices;
}
