/**
 * Empaquetado ZIP en cliente, sin red. Usa `fflate` (lib de ZIP en cliente
 * permitida por `docs/architecture.md`). (R14–R17)
 */

import { zipSync } from "fflate";

/** Un archivo a incluir en el ZIP. */
export interface ZipFile {
  name: string;
  bytes: Uint8Array;
}

/**
 * Empaqueta `files` en un Blob `application/zip`, en cliente y sin red.
 * (R14–R16)
 */
export function createZipBlob(files: readonly ZipFile[]): Blob {
  const record: Record<string, Uint8Array> = {};
  for (const file of files) {
    record[file.name] = file.bytes;
  }
  // Nivel 0 (store): las imágenes (PNG/JPG) ya están comprimidas; recomprimir
  // gastaría CPU sin reducir tamaño apreciable.
  const zipped = zipSync(record, { level: 0 });
  return new Blob([zipped], { type: "application/zip" });
}
