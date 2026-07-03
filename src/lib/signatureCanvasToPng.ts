/**
 * Costura DOM aislada (mockeable) que captura la firma dibujada en un `<canvas>`
 * como bytes PNG. Es la ÚNICA pieza que toca `HTMLCanvasElement`; se inyecta en
 * `SignaturePad` igual que `pdfjsPageRasterizer` / `offscreenImageRecompressor`,
 * para que el resto del código (dominio y UI) permanezca testeable sin canvas.
 * (R13, R14)
 */
export function signatureCanvasToPng(
  canvas: HTMLCanvasElement,
): Promise<Uint8Array> {
  return new Promise<Uint8Array>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        // Sin blob no se resuelve con bytes vacíos: se rechaza. (R14)
        reject(new Error("No se pudo capturar la firma del lienzo."));
        return;
      }
      blob.arrayBuffer().then(
        (buffer) => resolve(new Uint8Array(buffer)), // (R13)
        (error: unknown) => reject(error as Error),
      );
    }, "image/png");
  });
}
