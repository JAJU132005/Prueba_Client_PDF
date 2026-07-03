import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { downloadBlob } from "@/lib/download";
import {
  OCR_LARGE_FILE_BYTES,
  OCR_LARGE_FILE_MOBILE_WARNING,
} from "@/lib/ocrMemory";
import { RESOURCE_COST_LABEL } from "@/lib/resourceCost";
import { OCR_LANGUAGES, type OcrOptions, type OcrResult } from "@/pdf/ocrPdf";
import type {
  PageRasterizer,
  PageRasterizerFactory,
} from "@/pdf/rasterize";
import { OcrFailedError, type ProgressCallback } from "@/pdf/types";
import { Ocr, PDF_VALIDATION } from "@/routes/Ocr";
import type { OcrImageInput } from "@/workers/contract";
import type { PdfClient } from "@/workers/pdfClient";

vi.mock("@/lib/download", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/download")>();
  return { ...actual, downloadBlob: vi.fn() };
});

function makePdfFile(name: string, bytes: number[], size?: number): File {
  const file = new File([new Uint8Array(bytes)], name, {
    type: "application/pdf",
  });
  if (size !== undefined) {
    Object.defineProperty(file, "size", { value: size });
  }
  return file;
}

function fileInputs(container: HTMLElement): HTMLInputElement[] {
  return Array.from(
    container.querySelectorAll('input[type="file"]'),
  ) as HTMLInputElement[];
}

function addPdf(container: HTMLElement, file: File): void {
  fireEvent.change(fileInputs(container)[0], { target: { files: [file] } });
}

/** Factoría de rasterizador falso que produce `pageCount` bitmaps PNG. */
function fakeRasterizerFactory(pageCount: number): PageRasterizerFactory {
  return async (): Promise<PageRasterizer> => ({
    pageCount() {
      return pageCount;
    },
    async renderPage() {
      return new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], {
        type: "image/png",
      });
    },
    destroy() {
      // no-op
    },
  });
}

/** Cliente falso que captura la llamada a ocr y devuelve un resultado fijo. */
function fakeClient(ocr: PdfClient["ocr"]): PdfClient {
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
    async sign() {
      return new Uint8Array();
    },
    async detectForm() {
      return { hasFields: false, fields: [] };
    },
    async fillForms() {
      return new Uint8Array();
    },
    ocr,
    dispose() {
      // no-op
    },
  };
}

interface RenderOptions {
  pageCount?: number;
  isMobile?: boolean;
  file?: File;
}

function renderOcr(
  client: PdfClient,
  options: RenderOptions = {},
): { container: HTMLElement } {
  const { container } = render(
    <MemoryRouter initialEntries={["/reconocer-texto"]}>
      <Routes>
        <Route
          path="/reconocer-texto"
          element={
            <Ocr
              client={client}
              createRasterizer={fakeRasterizerFactory(options.pageCount ?? 2)}
              isMobile={options.isMobile}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );
  return { container };
}

describe("Ocr — estructura (R28, R29, R30, R31, R37)", () => {
  it("monta la página en /reconocer-texto con su título (R28)", () => {
    renderOcr(fakeClient(async () => ({ text: "" })));
    expect(
      screen.getByRole("heading", { name: "Reconocer texto (OCR)" }),
    ).toBeInTheDocument();
  });

  it("el Dropzone acepta un único archivo (R29)", () => {
    const { container } = renderOcr(fakeClient(async () => ({ text: "" })));
    expect(fileInputs(container)[0].multiple).toBe(false);
  });

  it("valida la extensión .pdf y el MIME application/pdf (R29)", () => {
    expect(PDF_VALIDATION.allowedExtensions).toEqual([".pdf"]);
    expect(PDF_VALIDATION.allowedMimeTypes).toEqual(["application/pdf"]);
  });

  it("el select de idioma tiene una opción por cada OCR_LANGUAGES (R30)", () => {
    renderOcr(fakeClient(async () => ({ text: "" })));
    const select = screen.getByLabelText(
      "Idioma del documento",
    ) as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual([...OCR_LANGUAGES]);
  });

  it("el control de salida ofrece text/searchable-pdf/both (R31)", () => {
    renderOcr(fakeClient(async () => ({ text: "" })));
    const select = screen.getByLabelText(
      "Formato de salida",
    ) as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual(["text", "searchable-pdf", "both"]);
  });

  it("renderiza la nota de consumo 'Pesada' (R37)", () => {
    renderOcr(fakeClient(async () => ({ text: "" })));
    expect(screen.getByText(RESOURCE_COST_LABEL.heavy)).toBeInTheDocument();
  });
});

describe("Ocr — reconocimiento (R32, R33, R34, R35, R36)", () => {
  it("invoca client.ocr con N páginas, idioma y salida elegidos (R32)", async () => {
    let capturedPages: readonly OcrImageInput[] | undefined;
    let capturedOptions: OcrOptions | undefined;
    const client = fakeClient(async (pages, options) => {
      capturedPages = pages;
      capturedOptions = options;
      return { text: "ok" };
    });
    const { container } = renderOcr(client, { pageCount: 3 });

    addPdf(container, makePdfFile("a.pdf", [1, 2, 3]));
    fireEvent.change(screen.getByLabelText("Idioma del documento"), {
      target: { value: "eng" },
    });
    fireEvent.change(screen.getByLabelText("Formato de salida"), {
      target: { value: "both" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reconocer texto" }));

    await waitFor(() => {
      expect(capturedPages).toBeDefined();
    });
    expect(capturedPages).toHaveLength(3);
    expect(capturedOptions?.language).toBe("eng");
    expect(capturedOptions?.output).toBe("both");
  });

  it("muestra progressbar con aria-valuenow y el aviso de operación pesada (R33, R34)", async () => {
    let resolveOcr: ((r: OcrResult) => void) | undefined;
    const client = fakeClient((_pages, _options, onProgress?: ProgressCallback) => {
      onProgress?.(0.5);
      return new Promise<OcrResult>((resolve) => {
        resolveOcr = resolve;
      });
    });
    const { container } = renderOcr(client, { pageCount: 1 });

    addPdf(container, makePdfFile("a.pdf", [1]));
    fireEvent.click(screen.getByRole("button", { name: "Reconocer texto" }));

    const bar = await screen.findByRole("progressbar");
    await waitFor(() => {
      expect(bar).toHaveAttribute("aria-valuenow", "0.5");
    });
    expect(screen.getByText(/operación pesada/i)).toBeInTheDocument();

    resolveOcr?.({ text: "listo" });
  });

  it("tras éxito con output 'both' descarga .txt y PDF con downloadBlob (R35)", async () => {
    const client = fakeClient(async () => ({
      text: "texto reconocido",
      pdfBytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
    }));
    const { container } = renderOcr(client, { pageCount: 1 });

    addPdf(container, makePdfFile("a.pdf", [1]));
    fireEvent.change(screen.getByLabelText("Formato de salida"), {
      target: { value: "both" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reconocer texto" }));

    const textBtn = await screen.findByRole("button", {
      name: "Descargar texto",
    });
    const pdfBtn = screen.getByRole("button", {
      name: "Descargar PDF buscable",
    });

    fireEvent.click(textBtn);
    fireEvent.click(pdfBtn);
    expect(downloadBlob).toHaveBeenCalledTimes(2);
    const names = vi.mocked(downloadBlob).mock.calls.map((c) => c[1]);
    expect(names).toContain("texto-reconocido.txt");
    expect(names).toContain("buscable.pdf");
  });

  it("ante error de dominio muestra alert y no ofrece descargas (R36)", async () => {
    const client = fakeClient(async () => {
      throw new OcrFailedError();
    });
    const { container } = renderOcr(client, { pageCount: 1 });

    addPdf(container, makePdfFile("a.pdf", [1]));
    fireEvent.click(screen.getByRole("button", { name: "Reconocer texto" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("No se pudo reconocer el texto");
    expect(
      screen.queryByRole("button", { name: "Descargar texto" }),
    ).not.toBeInTheDocument();
  });
});

describe("Ocr — aviso de memoria en móvil (R39, R40)", () => {
  it("móvil + archivo grande → muestra el aviso de memoria (R39)", () => {
    const { container } = renderOcr(fakeClient(async () => ({ text: "" })), {
      isMobile: true,
    });
    addPdf(
      container,
      makePdfFile("grande.pdf", [1], OCR_LARGE_FILE_BYTES),
    );
    expect(screen.getByText(OCR_LARGE_FILE_MOBILE_WARNING)).toBeInTheDocument();
  });

  it("móvil + archivo pequeño → no muestra el aviso (R40)", () => {
    const { container } = renderOcr(fakeClient(async () => ({ text: "" })), {
      isMobile: true,
    });
    addPdf(container, makePdfFile("pequeno.pdf", [1], 1024));
    expect(
      screen.queryByText(OCR_LARGE_FILE_MOBILE_WARNING),
    ).not.toBeInTheDocument();
  });

  it("no móvil + archivo grande → no muestra el aviso (R40)", () => {
    const { container } = renderOcr(fakeClient(async () => ({ text: "" })), {
      isMobile: false,
    });
    addPdf(
      container,
      makePdfFile("grande.pdf", [1], OCR_LARGE_FILE_BYTES),
    );
    expect(
      screen.queryByText(OCR_LARGE_FILE_MOBILE_WARNING),
    ).not.toBeInTheDocument();
  });
});
