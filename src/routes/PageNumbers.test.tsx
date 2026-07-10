import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { downloadBlob } from "@/lib/download";
import type { PageRasterizer, PageRasterizerFactory } from "@/pdf/rasterize";
import { PageNumbersFailedError, type ProgressCallback } from "@/pdf/types";
import { PageNumbers, PDF_VALIDATION } from "@/routes/PageNumbers";
import type { PdfClient } from "@/workers/pdfClient";

// jsdom no implementa object URLs; el panel de vista previa las usa al rasterizar.
beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:mock") as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL;
});

/** Rasterizador falso (sin pdf.js) que registra qué páginas se rasterizan. */
function mockRasterizer(pageCount = 3): {
  factory: PageRasterizerFactory;
  rendered: number[];
} {
  const rendered: number[] = [];
  const rasterizer: PageRasterizer = {
    pageCount: () => pageCount,
    renderPage: (index) => {
      rendered.push(index);
      return Promise.resolve(
        new Blob([new Uint8Array([1])], { type: "image/png" }),
      );
    },
    destroy: () => {},
  };
  return { factory: async () => rasterizer, rendered };
}

vi.mock("@/lib/download", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/download")>();
  return { ...actual, downloadBlob: vi.fn() };
});

function makePdfFile(name: string, bytes: number[]): File {
  return new File([new Uint8Array(bytes)], name, { type: "application/pdf" });
}

function fileInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('input[type="file"]');
  if (!input) {
    throw new Error("no se encontró el input de archivos");
  }
  return input as HTMLInputElement;
}

function addFiles(container: HTMLElement, files: File[]): void {
  fireEvent.change(fileInput(container), { target: { files } });
}

/** Cliente falso que captura la llamada a addPageNumbers y devuelve bytes fijos. */
function fakeClient(addPageNumbers: PdfClient["addPageNumbers"]): PdfClient {
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
    addPageNumbers,
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
  createRasterizer: PageRasterizerFactory = mockRasterizer().factory,
) {
  return render(
    <MemoryRouter initialEntries={["/numeros-pagina"]}>
      <Routes>
        <Route
          path="/numeros-pagina"
          element={
            <PageNumbers client={client} createRasterizer={createRasterizer} />
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PageNumbers — estructura (R35, R36, R37, R38, R39, R40, R41, R42, R48, R50)", () => {
  it("monta la página en /numeros-pagina mostrando su título (R35, R50)", () => {
    renderAt(fakeClient(async () => new Uint8Array([1])));
    expect(
      screen.getByRole("heading", { name: "Números de página" }),
    ).toBeInTheDocument();
  });

  it("el Dropzone acepta un único archivo (R36)", () => {
    const { container } = renderAt(fakeClient(async () => new Uint8Array([1])));
    expect(fileInput(container).multiple).toBe(false);
  });

  it("valida la extensión .pdf (R37)", () => {
    expect(PDF_VALIDATION.allowedExtensions).toEqual([".pdf"]);
  });

  it("valida el MIME application/pdf (R38)", () => {
    expect(PDF_VALIDATION.allowedMimeTypes).toEqual(["application/pdf"]);
  });

  it("ofrece un control de posición con las seis posiciones (R39)", () => {
    renderAt(fakeClient(async () => new Uint8Array([1])));
    const group = screen.getByRole("group", { name: "Posición" });
    const buttons = within(group).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual([
      "Abajo izquierda",
      "Abajo centro",
      "Abajo derecha",
      "Arriba izquierda",
      "Arriba centro",
      "Arriba derecha",
    ]);
  });

  it("ofrece un control de formato con los tres formatos (R40)", () => {
    renderAt(fakeClient(async () => new Uint8Array([1])));
    const select = screen.getByLabelText("Formato") as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual(["n", "n-of-total", "page-n"]);
  });

  it("ofrece un control numérico de número de inicio (R41)", () => {
    renderAt(fakeClient(async () => new Uint8Array([1])));
    const input = screen.getByLabelText("Número de inicio") as HTMLInputElement;
    expect(input.type).toBe("number");
  });

  it("ofrece un control numérico de tamaño de fuente (R42)", () => {
    renderAt(fakeClient(async () => new Uint8Array([1])));
    const input = screen.getByLabelText("Tamaño de fuente") as HTMLInputElement;
    expect(input.type).toBe("number");
  });
});

describe("PageNumbers — numeración (R43, R44, R45, R46, R47)", () => {
  it("al pulsar Añadir números invoca addPageNumbers con los bytes y las opciones elegidas (R43)", async () => {
    let capturedInput: Uint8Array | undefined;
    let capturedOptions:
      | { position: string; format: string; startNumber: number; fontSize: number }
      | undefined;
    const client = fakeClient(async (input, options) => {
      capturedInput = input;
      capturedOptions = options;
      return new Uint8Array([9]);
    });
    const { container } = renderAt(client);

    addFiles(container, [makePdfFile("a.pdf", [1, 2, 3])]);
    fireEvent.click(screen.getByRole("button", { name: "Arriba derecha" }));
    fireEvent.change(screen.getByLabelText("Formato"), {
      target: { value: "page-n" },
    });
    fireEvent.change(screen.getByLabelText("Número de inicio"), {
      target: { value: "5" },
    });
    fireEvent.change(screen.getByLabelText("Tamaño de fuente"), {
      target: { value: "18" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Añadir números" }));

    await waitFor(() => {
      expect(capturedInput).toBeDefined();
    });
    expect(capturedInput && Array.from(capturedInput)).toEqual([1, 2, 3]);
    expect(capturedOptions).toEqual({
      position: "top-right",
      format: "page-n",
      startNumber: 5,
      fontSize: 18,
    });
  });

  it("muestra una barra de progreso con aria-valuenow durante la numeración (R44)", async () => {
    let resolveNumber: ((bytes: Uint8Array) => void) | undefined;
    const client = fakeClient((_input, _options, onProgress?: ProgressCallback) => {
      onProgress?.(0.5);
      return new Promise<Uint8Array>((resolve) => {
        resolveNumber = resolve;
      });
    });
    const { container } = renderAt(client);

    addFiles(container, [makePdfFile("a.pdf", [1])]);
    fireEvent.click(screen.getByRole("button", { name: "Añadir números" }));

    const bar = await screen.findByRole("progressbar");
    await waitFor(() => {
      expect(bar).toHaveAttribute("aria-valuenow", "50");
    });

    resolveNumber?.(new Uint8Array([9]));
  });

  it("en éxito Descargar llama downloadBlob con numerado.pdf (R45)", async () => {
    const client = fakeClient(async () => new Uint8Array([1, 2, 3]));
    const { container } = renderAt(client);

    addFiles(container, [makePdfFile("a.pdf", [1])]);
    fireEvent.click(screen.getByRole("button", { name: "Añadir números" }));

    const download = await screen.findByRole("button", { name: /descargar resultado/i });
    fireEvent.click(download);

    expect(downloadBlob).toHaveBeenCalledTimes(1);
    const [blob, name] = vi.mocked(downloadBlob).mock.calls[0];
    expect(blob).toBeInstanceOf(Blob);
    expect(name).toBe("numerado.pdf");
  });

  it("ante error de dominio muestra alert y oculta Descargar (R46, R47)", async () => {
    const client = fakeClient(async () => {
      throw new PageNumbersFailedError();
    });
    const { container } = renderAt(client);

    addFiles(container, [makePdfFile("a.pdf", [1])]);
    fireEvent.click(screen.getByRole("button", { name: "Añadir números" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("No se pudo añadir la numeración");
    expect(
      screen.queryByRole("button", { name: /descargar resultado/i }),
    ).not.toBeInTheDocument();
  });
});

describe("PageNumbers — vista previa en vivo (R26, R29)", () => {
  it("ajustar opciones NO invoca addPageNumbers; solo el botón lo hace (R26)", async () => {
    const addPageNumbers = vi.fn(async () => new Uint8Array([9]));
    const { container } = renderAt(fakeClient(addPageNumbers));

    addFiles(container, [makePdfFile("a.pdf", [1, 2, 3])]);

    // Ajustes de opciones: ninguno debe ensamblar el PDF final.
    fireEvent.click(screen.getByRole("button", { name: "Arriba derecha" }));
    fireEvent.change(screen.getByLabelText("Formato"), {
      target: { value: "page-n" },
    });
    fireEvent.change(screen.getByLabelText("Número de inicio"), {
      target: { value: "5" },
    });
    expect(addPageNumbers).not.toHaveBeenCalled();

    // Solo el botón de confirmar ensambla el PDF.
    fireEvent.click(screen.getByRole("button", { name: "Añadir números" }));
    await waitFor(() => expect(addPageNumbers).toHaveBeenCalledTimes(1));
  });

  it("monta LivePreview con pageIndex = 0 cuando hay PDF cargado (R29)", async () => {
    const raster = mockRasterizer(4);
    const client = fakeClient(async () => new Uint8Array([9]));
    const { container } = renderAt(client, raster.factory);

    addFiles(container, [makePdfFile("a.pdf", [1, 2, 3])]);

    // Panel de vista previa presente con un PDF cargado.
    expect(
      screen.getByRole("region", { name: "Vista previa del resultado" }),
    ).toBeInTheDocument();

    // Solo se rasteriza la página de índice 0.
    await waitFor(() => expect(raster.rendered).toContain(0));
    expect(raster.rendered.every((index) => index === 0)).toBe(true);
  });
});
