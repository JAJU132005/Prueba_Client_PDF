import { describe, expect, it, vi } from "vitest";

// `vi.mock` se eleva por encima de las constantes; usamos `vi.hoisted` para
// crear el espía antes de que se evalúe la factoría del mock.
const { getDocument } = vi.hoisted(() => ({ getDocument: vi.fn() }));

// pdf.js y su worker se mockean: el test verifica la frontera del adaptador
// (qué `data` se pasa a `getDocument`), no el parseo real de un PDF.
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument,
}));
vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({
  default: "worker-url",
}));

import { createPdfjsThumbnailRenderer } from "@/lib/pdfjsThumbnailRenderer";

describe("createPdfjsThumbnailRenderer", () => {
  it("clona el input antes de getDocument: no pasa la referencia cruda ni detacha el buffer del llamante (R4)", async () => {
    const fakeDoc = { numPages: 1, destroy: vi.fn() };
    getDocument.mockReturnValue({ promise: Promise.resolve(fakeDoc) });

    const input = new Uint8Array([1, 2, 3]);
    await createPdfjsThumbnailRenderer(input);

    expect(getDocument).toHaveBeenCalledTimes(1);
    const passed = getDocument.mock.calls[0][0].data as Uint8Array;
    // No es la misma referencia ni comparte el ArrayBuffer del llamante.
    expect(passed).not.toBe(input);
    expect(passed.buffer).not.toBe(input.buffer);
    // El buffer del llamante sigue íntegro tras la llamada (no detached).
    expect(input.byteLength).toBe(3);
    expect(Array.from(input)).toEqual([1, 2, 3]);
    // El clon entregado a pdf.js conserva el contenido original.
    expect(Array.from(passed)).toEqual([1, 2, 3]);
  });
});
