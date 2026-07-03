import { describe, expect, it, vi } from "vitest";

import {
  pdfjsPageCount,
  type PdfDocumentLoader,
} from "@/lib/pdfjsPageCounter";
import { InvalidPdfError } from "@/pdf/types";

const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // "%PDF-"

/** Fake con el loader y las espías del documento que crea, sin pdf.js real. */
interface FakeLoader {
  load: PdfDocumentLoader;
  destroy: ReturnType<typeof vi.fn>;
  getPage: ReturnType<typeof vi.fn>;
}

/**
 * Loader falso (sin pdf.js real): documento con `numPages` y un `getPage` que
 * lanzaría si se invocara, para probar que el conteo NO rasteriza.
 */
function fakeLoader(numPages: number): FakeLoader {
  const destroy = vi.fn();
  const getPage = vi.fn(() => {
    throw new Error("getPage no debe invocarse para contar");
  });
  const load: PdfDocumentLoader = () => ({
    promise: Promise.resolve({ numPages, destroy, getPage }),
  });
  return { load, destroy, getPage };
}

describe("pdfjsPageCount", () => {
  it("devuelve numPages sin invocar getPage/render (R6)", async () => {
    const { load, getPage } = fakeLoader(12);
    const pages = await pdfjsPageCount(bytes, undefined, load);
    expect(pages).toBe(12);
    expect(getPage).not.toHaveBeenCalled();
  });

  it("libera el documento con destroy() tras contar (R16)", async () => {
    const { load, destroy } = fakeLoader(3);
    await pdfjsPageCount(bytes, undefined, load);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("loader que rechaza (cifrado/corrupto) → InvalidPdfError (R9)", async () => {
    const load: PdfDocumentLoader = () => ({
      promise: Promise.reject(new Error("PasswordException")),
    });
    await expect(pdfjsPageCount(bytes, undefined, load)).rejects.toBeInstanceOf(
      InvalidPdfError,
    );
  });

  it("no realiza ninguna petición de red con los bytes del usuario (R8)", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("no debería haber red"));
    try {
      const { load } = fakeLoader(4);
      const pages = await pdfjsPageCount(bytes, undefined, load);
      expect(pages).toBe(4);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("clona los bytes y no detacha el buffer del llamante (R8)", async () => {
    const { load } = fakeLoader(2);
    const input = new Uint8Array([1, 2, 3, 4]);
    await pdfjsPageCount(input, undefined, load);
    // El buffer del llamante sigue accesible (no fue transferido/detachado).
    expect(input.byteLength).toBe(4);
    expect(Array.from(input)).toEqual([1, 2, 3, 4]);
  });

  it("con el signal ya abortado lanza sin parsear el PDF (R13)", async () => {
    const { load, destroy } = fakeLoader(8);
    const loadSpy = vi.fn(load);
    const controller = new AbortController();
    controller.abort();
    await expect(
      pdfjsPageCount(bytes, controller.signal, loadSpy),
    ).rejects.toThrow();
    // No malgasta el parseo ni deja documentos abiertos. (R13, R16)
    expect(loadSpy).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();
  });
});
