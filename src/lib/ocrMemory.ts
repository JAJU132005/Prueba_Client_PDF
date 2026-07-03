/**
 * Predicado PURO del aviso de memoria en móvil para OCR (A4). Aislado de React
 * y del DOM para poder testearlo de forma determinista. (R38)
 */

/** Umbral de "archivo grande" para el aviso de memoria en móvil (15 MB). (R38) */
export const OCR_LARGE_FILE_BYTES = 15 * 1024 * 1024;

/** Texto del aviso específico de memoria (archivo grande en móvil). (R39) */
export const OCR_LARGE_FILE_MOBILE_WARNING =
  "Este archivo es grande y el OCR en un móvil puede agotar la memoria del dispositivo. Considera usar un ordenador o dividir el PDF.";

/**
 * Devuelve `true` si y solo si el dispositivo es móvil Y el archivo pesa al
 * menos `OCR_LARGE_FILE_BYTES`. (R38)
 */
export function shouldWarnLargeFileOnMobile(
  isMobile: boolean,
  fileBytes: number,
): boolean {
  return isMobile && fileBytes >= OCR_LARGE_FILE_BYTES;
}
