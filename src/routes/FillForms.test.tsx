import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { downloadBlob } from "@/lib/download";
import type { FieldFill, FillFormsOptions, FormModel } from "@/pdf/fillForms";
import type { PageRasterizer, PageRasterizerFactory } from "@/pdf/rasterize";
import { FillForms, NO_FIELDS_NOTICE } from "@/routes/FillForms";
import type { PdfClient } from "@/workers/pdfClient";

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:mock") as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL;
});

vi.mock("@/lib/download", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/download")>();
  return { ...actual, downloadBlob: vi.fn() };
});

function mockRasterizer(pageCount = 1): PageRasterizerFactory {
  const rasterizer: PageRasterizer = {
    pageCount: () => pageCount,
    renderPage: () =>
      Promise.resolve(new Blob([new Uint8Array([1])], { type: "image/png" })),
    destroy: () => {},
  };
  return async () => rasterizer;
}

function makePdfFile(bytes: number[]): File {
  return new File([new Uint8Array(bytes)], "form.pdf", {
    type: "application/pdf",
  });
}

function fileInput(container: HTMLElement): HTMLInputElement {
  return container.querySelector('input[type="file"]') as HTMLInputElement;
}

function addPdf(container: HTMLElement, file: File): void {
  fireEvent.change(fileInput(container), { target: { files: [file] } });
}

/** Cliente falso: `detectForm` devuelve un modelo fijo; `fillForms` captura. */
function fakeClient(
  detectForm: PdfClient["detectForm"],
  fillForms: PdfClient["fillForms"] = async () => new Uint8Array([9]),
): PdfClient {
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
    detectForm,
    fillForms,
    async ocr() {
      return { text: "" };
    },
    dispose() {
      // no-op
    },
  };
}

function renderAt(client: PdfClient) {
  return render(
    <MemoryRouter initialEntries={["/rellenar-formularios"]}>
      <Routes>
        <Route
          path="/rellenar-formularios"
          element={
            <FillForms client={client} createRasterizer={mockRasterizer()} />
          }
        />
        <Route path="/anotar" element={<div>Ruta anotar</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const TEXT_MODEL: FormModel = {
  hasFields: true,
  fields: [{ name: "nombre", type: "text", value: "" }],
};

describe("FillForms — con campos (R23)", () => {
  it("con campos muestra el editor y descarga los bytes rellenados (R23)", async () => {
    let capturedInput: Uint8Array | undefined;
    let capturedOptions: FillFormsOptions | undefined;
    const client = fakeClient(
      async () => TEXT_MODEL,
      async (input, options) => {
        capturedInput = input;
        capturedOptions = options;
        return new Uint8Array([1, 2, 3]);
      },
    );
    const { container } = renderAt(client);

    addPdf(container, makePdfFile([10, 20, 30]));

    const input = await screen.findByLabelText("nombre");
    fireEvent.change(input, { target: { value: "Ada" } });

    fireEvent.click(
      screen.getByRole("button", { name: "Rellenar y descargar" }),
    );

    await waitFor(() => expect(capturedInput).toBeDefined());
    expect(capturedInput && Array.from(capturedInput)).toEqual([10, 20, 30]);
    const fills = capturedOptions?.fills as FieldFill[];
    expect(fills).toEqual([{ name: "nombre", kind: "text", value: "Ada" }]);

    expect(downloadBlob).toHaveBeenCalledTimes(1);
    const [blob, name] = vi.mocked(downloadBlob).mock.calls[0];
    expect(blob).toBeInstanceOf(Blob);
    expect(name).toBe("formulario-relleno.pdf");
  });

  it("propaga el toggle de aplanar a fillForms (R14)", async () => {
    let capturedOptions: FillFormsOptions | undefined;
    const client = fakeClient(
      async () => TEXT_MODEL,
      async (_input, options) => {
        capturedOptions = options;
        return new Uint8Array([1]);
      },
    );
    const { container } = renderAt(client);

    addPdf(container, makePdfFile([1]));
    await screen.findByLabelText("nombre");

    fireEvent.click(
      screen.getByLabelText(/Aplanar el formulario/i),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Rellenar y descargar" }),
    );

    await waitFor(() => expect(capturedOptions).toBeDefined());
    expect(capturedOptions?.flatten).toBe(true);
  });
});

describe("FillForms — sin campos (R25, R26)", () => {
  it("sin campos informa y ofrece la alternativa de añadir texto (R25, R26)", async () => {
    const client = fakeClient(async () => ({ hasFields: false, fields: [] }));
    const { container } = renderAt(client);

    addPdf(container, makePdfFile([1, 2]));

    expect(await screen.findByText(NO_FIELDS_NOTICE)).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: "Añadir texto encima" });
    expect(cta).toHaveAttribute("href", "/anotar");
  });
});

describe("FillForms — previsualización (R27)", () => {
  it("previsualiza el PDF cargado con LivePreview (R27)", async () => {
    const client = fakeClient(async () => TEXT_MODEL);
    const { container } = renderAt(client);

    addPdf(container, makePdfFile([1, 2, 3]));

    expect(
      await screen.findByRole("region", { name: /vista previa/i }),
    ).toBeInTheDocument();
  });
});
