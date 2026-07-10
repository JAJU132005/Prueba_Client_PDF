import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { downloadBlob } from "@/lib/download";
import {
  OCR_LARGE_FILE_BYTES,
  OCR_LARGE_FILE_MOBILE_WARNING,
} from "@/lib/ocrMemory";
import { RESOURCE_COST_LABEL } from "@/lib/resourceCost";
import { OCR_LANGUAGES, type OcrOptions, type OcrResult } from "@/pdf/ocrPdf";
import type { PageCounter } from "@/pdf/pageCount";
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

/**
 * Rasterizador cuyo blob de cada página codifica su índice en el primer byte,
 * para verificar qué páginas (y en qué orden) llegan a `client.ocr`. (#32 R8)
 */
function indexedRasterizerFactory(pageCount: number): PageRasterizerFactory {
  return async (): Promise<PageRasterizer> => ({
    pageCount() {
      return pageCount;
    },
    async renderPage(index: number) {
      return new Blob([new Uint8Array([index])], { type: "image/png" });
    },
    destroy() {
      // no-op
    },
  });
}

/** Contador de páginas falso inyectable que resuelve con `pages`. (#32 R5) */
function fakeCounter(pages: number): PageCounter {
  return async () => pages;
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
    async redact() {
      return new Uint8Array();
    },
    dispose() {
      // no-op
    },
  };
}

interface RenderOptions {
  pageCount?: number;
  isMobile?: boolean;
  file?: File;
  createRasterizer?: PageRasterizerFactory;
}

function renderOcr(
  client: PdfClient,
  options: RenderOptions = {},
): { container: HTMLElement } {
  const pageCount = options.pageCount ?? 2;
  const { container } = render(
    <MemoryRouter initialEntries={["/reconocer-texto"]}>
      <Routes>
        <Route
          path="/reconocer-texto"
          element={
            <Ocr
              client={client}
              createRasterizer={
                options.createRasterizer ?? fakeRasterizerFactory(pageCount)
              }
              countPages={fakeCounter(pageCount)}
              isMobile={options.isMobile}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );
  return { container };
}

/**
 * Añade un PDF y espera a que el conteo de páginas asíncrono resuelva y el
 * selector visual quede montado (todas las páginas seleccionadas).
 */
async function addPdfAndWaitSelector(
  container: HTMLElement,
  file: File,
): Promise<void> {
  addPdf(container, file);
  await screen.findByRole("button", { name: "Página 1" });
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

  it("el control de idioma tiene un botón por cada OCR_LANGUAGES (R30)", () => {
    renderOcr(fakeClient(async () => ({ text: "" })));
    const group = screen.getByRole("group", { name: "Idioma del documento" });
    const buttons = within(group).getAllByRole("button");
    expect(buttons).toHaveLength(OCR_LANGUAGES.length);
  });

  it("el control de salida ofrece text/searchable-pdf/both (R31)", () => {
    renderOcr(fakeClient(async () => ({ text: "" })));
    const group = screen.getByRole("group", { name: "Formato de salida" });
    const buttons = within(group).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual([
      "Solo texto (.txt)",
      "PDF con texto buscable",
      "Texto y PDF buscable",
    ]);
  });

  it("renderiza la nota de consumo 'Pesada' (R37)", () => {
    renderOcr(fakeClient(async () => ({ text: "" })));
    expect(
      screen.getByLabelText(/consumo de recursos/i),
    ).toHaveTextContent(RESOURCE_COST_LABEL.heavy);
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

    await addPdfAndWaitSelector(container, makePdfFile("a.pdf", [1, 2, 3]));
    fireEvent.click(screen.getByRole("button", { name: "Inglés" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Texto y PDF buscable" }),
    );
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

    await addPdfAndWaitSelector(container, makePdfFile("a.pdf", [1]));
    fireEvent.click(screen.getByRole("button", { name: "Reconocer texto" }));

    const bar = await screen.findByRole("progressbar");
    await waitFor(() => {
      expect(bar).toHaveAttribute("aria-valuenow", "50");
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

    await addPdfAndWaitSelector(container, makePdfFile("a.pdf", [1]));
    fireEvent.click(
      screen.getByRole("button", { name: "Texto y PDF buscable" }),
    );
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

    await addPdfAndWaitSelector(container, makePdfFile("a.pdf", [1]));
    fireEvent.click(screen.getByRole("button", { name: "Reconocer texto" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("No se pudo reconocer el texto");
    expect(
      screen.queryByRole("button", { name: "Descargar texto" }),
    ).not.toBeInTheDocument();
  });
});

describe("Ocr — aviso de memoria en móvil (R39, R40)", () => {
  it("móvil + archivo grande → muestra el aviso de memoria (R39)", async () => {
    const { container } = renderOcr(fakeClient(async () => ({ text: "" })), {
      isMobile: true,
    });
    await addPdfAndWaitSelector(
      container,
      makePdfFile("grande.pdf", [1], OCR_LARGE_FILE_BYTES),
    );
    expect(screen.getByText(OCR_LARGE_FILE_MOBILE_WARNING)).toBeInTheDocument();
  });

  it("móvil + archivo pequeño → no muestra el aviso (R40)", async () => {
    const { container } = renderOcr(fakeClient(async () => ({ text: "" })), {
      isMobile: true,
    });
    await addPdfAndWaitSelector(container, makePdfFile("pequeno.pdf", [1], 1024));
    expect(
      screen.queryByText(OCR_LARGE_FILE_MOBILE_WARNING),
    ).not.toBeInTheDocument();
  });

  it("no móvil + archivo grande → no muestra el aviso (R40)", async () => {
    const { container } = renderOcr(fakeClient(async () => ({ text: "" })), {
      isMobile: false,
    });
    await addPdfAndWaitSelector(
      container,
      makePdfFile("grande.pdf", [1], OCR_LARGE_FILE_BYTES),
    );
    expect(
      screen.queryByText(OCR_LARGE_FILE_MOBILE_WARNING),
    ).not.toBeInTheDocument();
  });
});

describe("Ocr — páginas seleccionadas #32 (R5, R6, R7)", () => {
  it("cuenta páginas y renderiza el selector con N casillas todas activas (#32 R5, R6, R7)", async () => {
    const { container } = renderOcr(fakeClient(async () => ({ text: "" })), {
      pageCount: 4,
    });
    await addPdfAndWaitSelector(container, makePdfFile("a.pdf", [1, 2, 3]));

    const pageButtons = screen.getAllByRole("button", {
      name: /^Página \d+$/,
    });
    expect(pageButtons).toHaveLength(4);
    for (const button of pageButtons) {
      expect(button).toHaveAttribute("aria-pressed", "true");
    }
  });
});

describe("Ocr — OCR de páginas seleccionadas #32 (R8, R9, R10)", () => {
  it("solo procesa las páginas seleccionadas, en orden ascendente (#32 R8)", async () => {
    let capturedPages: readonly OcrImageInput[] | undefined;
    const client = fakeClient(async (pages) => {
      capturedPages = pages;
      return { text: "ok" };
    });
    const { container } = renderOcr(client, {
      pageCount: 3,
      createRasterizer: indexedRasterizerFactory(3),
    });
    await addPdfAndWaitSelector(container, makePdfFile("a.pdf", [1, 2, 3]));

    // Deselecciona la página 2 (índice 1) → quedan {0, 2}.
    fireEvent.click(screen.getByRole("button", { name: "Página 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Reconocer texto" }));

    await waitFor(() => {
      expect(capturedPages).toBeDefined();
    });
    expect(capturedPages).toHaveLength(2);
    // El primer byte del bitmap codifica el índice de página de origen.
    expect((capturedPages ?? []).map((p) => p.bytes[0])).toEqual([0, 2]);
  });

  it("sin tocar la selección procesa todas las páginas (#32 R9)", async () => {
    let capturedPages: readonly OcrImageInput[] | undefined;
    const client = fakeClient(async (pages) => {
      capturedPages = pages;
      return { text: "ok" };
    });
    const { container } = renderOcr(client, {
      pageCount: 3,
      createRasterizer: indexedRasterizerFactory(3),
    });
    await addPdfAndWaitSelector(container, makePdfFile("a.pdf", [1, 2, 3]));

    fireEvent.click(screen.getByRole("button", { name: "Reconocer texto" }));

    await waitFor(() => {
      expect(capturedPages).toBeDefined();
    });
    expect((capturedPages ?? []).map((p) => p.bytes[0])).toEqual([0, 1, 2]);
  });

  it("selección vacía → botón deshabilitado y client.ocr no se llama (#32 R10)", async () => {
    const ocr = vi.fn(async () => ({ text: "ok" }));
    const { container } = renderOcr(fakeClient(ocr), { pageCount: 2 });
    await addPdfAndWaitSelector(container, makePdfFile("a.pdf", [1]));

    // Deselecciona ambas páginas → selección vacía.
    fireEvent.click(screen.getByRole("button", { name: "Página 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Página 2" }));

    const recognize = screen.getByRole("button", { name: "Reconocer texto" });
    expect(recognize).toBeDisabled();
    fireEvent.click(recognize);
    expect(ocr).not.toHaveBeenCalled();
  });
});

describe("Ocr — avisos mantenidos #32 (R18, R19, R21)", () => {
  it("durante el proceso: progressbar con aria-valuenow y aviso de operación pesada (#32 R18, R19)", async () => {
    let resolveOcr: ((r: OcrResult) => void) | undefined;
    const client = fakeClient((_pages, _options, onProgress) => {
      onProgress?.(0.4);
      return new Promise<OcrResult>((resolve) => {
        resolveOcr = resolve;
      });
    });
    const { container } = renderOcr(client, { pageCount: 1 });
    await addPdfAndWaitSelector(container, makePdfFile("a.pdf", [1]));
    fireEvent.click(screen.getByRole("button", { name: "Reconocer texto" }));

    const bar = await screen.findByRole("progressbar");
    await waitFor(() => {
      expect(bar).toHaveAttribute("aria-valuenow", "40");
    });
    expect(screen.getByText(/operación pesada/i)).toBeInTheDocument();

    resolveOcr?.({ text: "listo" });
  });

  it("renderiza el badge 'Pesada' con su frase explicativa (#32 R21)", () => {
    renderOcr(fakeClient(async () => ({ text: "" })));
    const note = screen.getByLabelText(/consumo de recursos/i);
    expect(note).toHaveTextContent(RESOURCE_COST_LABEL.heavy);
  });
});
