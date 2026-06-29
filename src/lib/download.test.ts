import { afterEach, describe, expect, it, vi } from "vitest";

import { downloadBlob, pdfBytesToBlob } from "@/lib/download";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("pdfBytesToBlob", () => {
  it("crea un Blob application/pdf con el tamaño de los bytes (R27)", () => {
    const blob = pdfBytesToBlob(new Uint8Array([1, 2, 3, 4]));
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBe(4);
  });
});

describe("downloadBlob", () => {
  it("crea una URL de objeto, dispara el click del <a> y revoca la URL (R27)", () => {
    // jsdom no implementa URL.createObjectURL/revokeObjectURL; los definimos
    // como mocks para observar las llamadas (sin red).
    const createObjectURL = vi.fn(() => "blob:fake-url");
    const revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL;
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    const blob = pdfBytesToBlob(new Uint8Array([1, 2, 3]));
    downloadBlob(blob, "unido.pdf");

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:fake-url");
  });
});
