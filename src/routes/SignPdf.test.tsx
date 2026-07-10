import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { downloadBlob } from "@/lib/download";
import type { PageCounter } from "@/pdf/pageCount";
import type { PageRasterizer, PageRasterizerFactory } from "@/pdf/rasterize";
import type { SignOptions } from "@/pdf/signature";
import { SignFailedError } from "@/pdf/types";
import { SignPdf } from "@/routes/SignPdf";
import type { PdfClient } from "@/workers/pdfClient";

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:mock") as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL;
});

vi.mock("@/lib/download", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/download")>();
  return { ...actual, downloadBlob: vi.fn() };
});

/** Rasterizador falso (sin pdf.js). */
function mockRasterizer(pageCount = 3): PageRasterizerFactory {
  const rasterizer: PageRasterizer = {
    pageCount: () => pageCount,
    renderPage: () =>
      Promise.resolve(new Blob([new Uint8Array([1])], { type: "image/png" })),
    destroy: () => {},
  };
  return async () => rasterizer;
}

function fakeCounter(pages: number): PageCounter {
  return async () => pages;
}

function makePdfFile(name: string, bytes: number[]): File {
  return new File([new Uint8Array(bytes)], name, { type: "application/pdf" });
}

function makeImageFile(name: string, bytes: number[]): File {
  return new File([new Uint8Array(bytes)], name, { type: "image/png" });
}

function fileInputs(container: HTMLElement): HTMLInputElement[] {
  return Array.from(
    container.querySelectorAll('input[type="file"]'),
  ) as HTMLInputElement[];
}

function addPdf(container: HTMLElement, file: File): void {
  fireEvent.change(fileInputs(container)[0], { target: { files: [file] } });
}

function addImage(container: HTMLElement, file: File): void {
  const inputs = fileInputs(container);
  fireEvent.change(inputs[inputs.length - 1], { target: { files: [file] } });
}

/** Cliente falso que captura la llamada a sign y devuelve bytes fijos. */
function fakeClient(sign: PdfClient["sign"]): PdfClient {
  return {
    async probe() {
      return { sum: 0, count: 0 };
    },
    async merge() {
      return new Uint8Array();
    },
    async split() {
      return new Uint8Array();
    },
    async rotate() {
      return new Uint8Array();
    },
    async organize() {
      return new Uint8Array();
    },
    async imagesToPdf() {
      return new Uint8Array();
    },
    async addPageNumbers() {
      return new Uint8Array();
    },
    async addWatermark() {
      return new Uint8Array();
    },
    async compress() {
      return {
        bytes: new Uint8Array(),
        report: {
          originalSize: 0,
          compressedSize: 0,
          totalImages: 0,
          recompressibleImages: 0,
          recompressedImages: 0,
          minimalReduction: true,
        },
      };
    },
    async protect() {
      return new Uint8Array();
    },
    async annotate() {
      return new Uint8Array();
    },
    sign,
    async detectForm() {
      return { hasFields: false, fields: [] };
    },
    async fillForms() {
      return new Uint8Array();
    },
    async ocr() {
      return { text: "" };
    },
    async redact() {
      return new Uint8Array();
    },
    dispose() {
      // no-op
    },
  };
}

function renderAt(
  client: PdfClient,
  counter: PageCounter = fakeCounter(3),
  createRasterizer: PageRasterizerFactory = mockRasterizer(),
) {
  return render(
    <MemoryRouter initialEntries={["/firmar"]}>
      <Routes>
        <Route
          path="/firmar"
          element={
            <SignPdf
              client={client}
              countPages={counter}
              createRasterizer={createRasterizer}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

/** Sube PDF + firma y espera a que el botón «Firmar PDF» quede habilitado. */
async function loadPdfAndSignature(
  container: HTMLElement,
  pdf: File,
  image: File,
): Promise<HTMLButtonElement> {
  addPdf(container, pdf);
  addImage(container, image);
  const button = screen.getByRole("button", {
    name: "Firmar PDF",
  }) as HTMLButtonElement;
  await waitFor(() => expect(button).not.toBeDisabled());
  return button;
}

describe("SignPdf — aviso de firma visual (R17)", () => {
  it("muestra que la firma es visual y no una firma digital certificada", () => {
    renderAt(fakeClient(async () => new Uint8Array([1])));
    const notice = screen.getByText(/firma visual/i);
    expect(notice.textContent).toMatch(/no es una firma digital certificada/i);
  });
});

describe("SignPdf — firma (R15, R20)", () => {
  it("al subir una imagen y firmar pasa esos bytes como options.image (R15)", async () => {
    let captured: SignOptions | undefined;
    const client = fakeClient(async (_input, options) => {
      captured = options;
      return new Uint8Array([9]);
    });
    const { container } = renderAt(client);

    const button = await loadPdfAndSignature(
      container,
      makePdfFile("a.pdf", [1, 2, 3]),
      makeImageFile("firma.png", [0x89, 0x50, 0x4e, 0x47]),
    );
    fireEvent.click(button);

    await waitFor(() => expect(captured).toBeDefined());
    expect(captured && Array.from(captured.image)).toEqual([
      0x89, 0x50, 0x4e, 0x47,
    ]);
  });

  it("pulsar firmar llama a client.sign una vez con los bytes del PDF (R20)", async () => {
    let capturedInput: Uint8Array | undefined;
    const sign = vi.fn(async (input: Uint8Array) => {
      capturedInput = input;
      return new Uint8Array([9]);
    });
    const { container } = renderAt(fakeClient(sign));

    const button = await loadPdfAndSignature(
      container,
      makePdfFile("a.pdf", [1, 2, 3]),
      makeImageFile("firma.png", [0x89, 0x50, 0x4e, 0x47]),
    );
    fireEvent.click(button);

    await waitFor(() => expect(sign).toHaveBeenCalledTimes(1));
    expect(capturedInput && Array.from(capturedInput)).toEqual([1, 2, 3]);
  });
});

describe("SignPdf — selección de página y posición (R18, R19)", () => {
  it("cambiar la página cambia options.pageIndex (R18)", async () => {
    let captured: SignOptions | undefined;
    const client = fakeClient(async (_input, options) => {
      captured = options;
      return new Uint8Array([9]);
    });
    const { container } = renderAt(client);

    addPdf(container, makePdfFile("a.pdf", [1]));
    addImage(container, makeImageFile("firma.png", [0x89, 0x50, 0x4e, 0x47]));
    // Elige la página 2 (índice 1) en el selector single-active.
    const page2 = await screen.findByRole("button", { name: "Página 2" });
    fireEvent.click(page2);

    const button = screen.getByRole("button", { name: "Firmar PDF" });
    await waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);

    await waitFor(() => expect(captured).toBeDefined());
    expect(captured?.pageIndex).toBe(1);
  });

  it("cambiar la posición cambia options.position (R19)", async () => {
    let captured: SignOptions | undefined;
    const client = fakeClient(async (_input, options) => {
      captured = options;
      return new Uint8Array([9]);
    });
    const { container } = renderAt(client);

    addPdf(container, makePdfFile("a.pdf", [1]));
    addImage(container, makeImageFile("firma.png", [0x89, 0x50, 0x4e, 0x47]));
    fireEvent.change(screen.getByLabelText("Posición"), {
      target: { value: "top-left" },
    });

    const button = screen.getByRole("button", { name: "Firmar PDF" });
    await waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);

    await waitFor(() => expect(captured).toBeDefined());
    expect(captured?.position).toBe("top-left");
  });
});

describe("SignPdf — botón deshabilitado (R22)", () => {
  it("está deshabilitado sin PDF, sin firma, y se habilita con ambos", async () => {
    const { container } = renderAt(fakeClient(async () => new Uint8Array([9])));
    const button = screen.getByRole("button", { name: "Firmar PDF" });
    // Sin PDF ni firma.
    expect(button).toBeDisabled();

    // Con PDF pero sin firma.
    addPdf(container, makePdfFile("a.pdf", [1]));
    expect(button).toBeDisabled();

    // Con PDF y firma → habilitado.
    addImage(container, makeImageFile("firma.png", [0x89, 0x50, 0x4e, 0x47]));
    await waitFor(() => expect(button).not.toBeDisabled());
  });
});

describe("SignPdf — descarga local y cero red (R21, R24)", () => {
  it("tras éxito, Descargar dispara downloadBlob con firmado.pdf (R21)", async () => {
    const { container } = renderAt(
      fakeClient(async () => new Uint8Array([1, 2, 3])),
    );

    const button = await loadPdfAndSignature(
      container,
      makePdfFile("a.pdf", [1]),
      makeImageFile("firma.png", [0x89, 0x50, 0x4e, 0x47]),
    );
    fireEvent.click(button);

    const download = await screen.findByRole("button", { name: /descargar resultado/i });
    fireEvent.click(download);

    expect(downloadBlob).toHaveBeenCalledTimes(1);
    const [blob, name] = vi.mocked(downloadBlob).mock.calls[0];
    expect(blob).toBeInstanceOf(Blob);
    expect(name).toBe("firmado.pdf");
  });

  it("firmar y descargar no realizan ninguna petición de red (R24)", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const openSpy = vi.spyOn(XMLHttpRequest.prototype, "open");
    const sendSpy = vi.spyOn(XMLHttpRequest.prototype, "send");

    const { container } = renderAt(
      fakeClient(async () => new Uint8Array([1, 2, 3])),
    );

    const button = await loadPdfAndSignature(
      container,
      makePdfFile("a.pdf", [1]),
      makeImageFile("firma.png", [0x89, 0x50, 0x4e, 0x47]),
    );
    fireEvent.click(button);
    const download = await screen.findByRole("button", { name: /descargar resultado/i });
    fireEvent.click(download);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
    expect(sendSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("SignPdf — error de dominio (R23)", () => {
  it("ante SignFailedError muestra alert y no ofrece descarga", async () => {
    const client = fakeClient(async () => {
      throw new SignFailedError();
    });
    const { container } = renderAt(client);

    const button = await loadPdfAndSignature(
      container,
      makePdfFile("a.pdf", [1]),
      makeImageFile("firma.png", [0x89, 0x50, 0x4e, 0x47]),
    );
    fireEvent.click(button);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("No se pudo firmar el PDF");
    expect(
      screen.queryByRole("button", { name: /descargar resultado/i }),
    ).not.toBeInTheDocument();
  });
});

describe("SignPdf — vista previa (R25)", () => {
  it("renderiza un preview-overlay de imagen para la firma", async () => {
    // Firma con tamaño intrínseco conocido: `new Image()` resuelve su onload.
    class StubImage {
      onload: (() => void) | null = null;
      naturalWidth = 200;
      naturalHeight = 100;
      private _src = "";
      set src(value: string) {
        this._src = value;
        this.onload?.();
      }
      get src(): string {
        return this._src;
      }
    }
    vi.stubGlobal("Image", StubImage);
    // Tamaño natural de la imagen de la vista previa (para onPageSize).
    Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", {
      configurable: true,
      get: () => 400,
    });
    Object.defineProperty(HTMLImageElement.prototype, "naturalHeight", {
      configurable: true,
      get: () => 600,
    });

    try {
      const { container } = renderAt(
        fakeClient(async () => new Uint8Array([9])),
      );

      addPdf(container, makePdfFile("a.pdf", [1]));
      addImage(container, makeImageFile("firma.png", [0x89, 0x50, 0x4e, 0x47]));

      const previewImg = await screen.findByAltText(
        /vista previa de la página/i,
      );
      fireEvent.load(previewImg);

      const overlays = await screen.findAllByTestId("preview-overlay");
      expect(overlays.length).toBeGreaterThan(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
