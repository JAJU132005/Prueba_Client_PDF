/**
 * Helper PURO para reconocer archivos de imagen, simétrico al `isPdfFile`
 * inline del `Dropzone`. Se usa para decidir qué archivos reciben miniatura
 * vía `URL.createObjectURL` y visor de imagen ampliado. (R12, R22)
 */

/** Extensiones de imagen reconocidas (en minúsculas, con punto). (R12, R22) */
export const IMAGE_EXTENSIONS: readonly string[] = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".svg",
  ".avif",
];

/**
 * ¿El archivo es una imagen? Verdadero si su MIME empieza por `image/` o si su
 * nombre termina en una extensión de `IMAGE_EXTENSIONS`. (R12, R22)
 */
export function isImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) {
    return true;
  }
  const name = file.name.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => name.endsWith(ext));
}
