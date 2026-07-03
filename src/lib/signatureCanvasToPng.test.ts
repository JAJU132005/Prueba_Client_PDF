import { describe, expect, it } from "vitest";

import { signatureCanvasToPng } from "@/lib/signatureCanvasToPng";

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Canvas falso cuyo `toBlob` invoca el callback con `blob` (o `null`), sin tocar
 * un canvas real de jsdom.
 */
function fakeCanvas(blob: Blob | null): HTMLCanvasElement {
  return {
    toBlob(callback: BlobCallback, _type?: string): void {
      callback(blob);
    },
  } as unknown as HTMLCanvasElement;
}

describe("signatureCanvasToPng (R13)", () => {
  it("resuelve con los bytes PNG del blob que entrega toBlob", async () => {
    const blob = new Blob([PNG_BYTES], { type: "image/png" });
    const bytes = await signatureCanvasToPng(fakeCanvas(blob));
    expect(Array.from(bytes)).toEqual(Array.from(PNG_BYTES));
  });
});

describe("signatureCanvasToPng (R14)", () => {
  it("rechaza (sin bytes vacíos) si toBlob devuelve null", async () => {
    await expect(signatureCanvasToPng(fakeCanvas(null))).rejects.toBeInstanceOf(
      Error,
    );
  });
});
