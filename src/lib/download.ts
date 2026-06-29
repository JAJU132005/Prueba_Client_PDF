/**
 * Convierte los bytes de un PDF en un `Blob` `application/pdf`. El Blob vive en
 * memoria del navegador; no implica ninguna petición de red. (R27)
 */
export function pdfBytesToBlob(bytes: Uint8Array): Blob {
  // Copiamos a un ArrayBuffer propio para que el Blob no dependa del buffer
  // original (que podría ser una vista compartida tras cruzar el worker).
  const copy = new Uint8Array(bytes);
  return new Blob([copy], { type: "application/pdf" });
}

/**
 * Dispara la descarga local de `blob` como `filename` usando una URL de objeto.
 *
 * Cero red: usa `URL.createObjectURL` + un `<a download>` efímero y revoca la
 * URL tras disparar el click. No hay `fetch` ni envío de datos. (R27, R29)
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = "noopener";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
