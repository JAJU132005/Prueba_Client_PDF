import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { downloadBlob } from "@/lib/download";
import type { Annotation } from "@/pdf/annotate";
import type { PageCounter } from "@/pdf/pageCount";
import type { PageRasterizer, PageRasterizerFactory } from "@/pdf/rasterize";
import { AnnotateFailedError, type ProgressCallback } from "@/pdf/types";
import { EditAnnotatePdf, LAYER_NOTICE } from "@/routes/EditAnnotatePdf";
import type { PdfClient } from "@/workers/pdfClient";

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:mock") as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL;
  Element.prototype.getBoundingClientRect = vi.fn(
    () =>
      ({
        left: 0,
        top: 0,
        right: 100,
        bottom: 200,
        width: 100,
        height: 200,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect,
  );
});

vi.mock("@/lib/download", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/download")>();
  return { ...actual, downloadBlob: vi.fn() };
});

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

function fileInputs(container: HTMLElement): HTMLInputElement[] {
  return Array.from(
    container.querySelectorAll('input[type="file"]'),
  ) as HTMLInputElement[];
}

function addPdf(container: HTMLElement, file: File): void {
  fireEvent.change(fileInputs(container)[0], { target: { files: [file] } });
}

/** Cliente falso que captura la llamada a annotate y devuelve bytes fijos. */
function fakeClient(annotate: PdfClient["annotate"]): PdfClient {
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
    annotate,
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
    dispose() {
      // no-op
    },
  };
}

function renderAt(
  client: PdfClient,
  createRasterizer: PageRasterizerFactory = mockRasterizer(),
) {
  return render(
    <MemoryRouter initialEntries={["/anotar"]}>
      <Routes>
        <Route
          path="/anotar"
          element={
            <EditAnnotatePdf
              client={client}
              countPages={fakeCounter(3)}
              createRasterizer={createRasterizer}
              createId={() => "fixed-id"}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

/** Añade un PDF, activa la herramienta de texto y crea una anotación por clic. */
async function addPdfAndAnnotation(container: HTMLElement): Promise<void> {
  addPdf(container, makePdfFile("a.pdf", [1, 2, 3]));
  const textTool = await screen.findByRole("button", { name: "Texto" });
  fireEvent.click(textTool);
  const overlay = await screen.findByTestId("annotation-overlay");
  fireEvent.click(overlay, { clientX: 20, clientY: 30 });
}

describe("EditAnnotatePdf — aviso de capa (R3)", () => {
  it("muestra el aviso de que se añade una capa, no se reescribe el texto (R3)", () => {
    renderAt(fakeClient(async () => new Uint8Array([1])));
    expect(screen.getByText(LAYER_NOTICE)).toBeInTheDocument();
  });
});

describe("EditAnnotatePdf — exportación (R22, R26, R27)", () => {
  it("la exportación llama a annotate con los bytes y las anotaciones (R22)", async () => {
    let capturedInput: Uint8Array | undefined;
    let capturedAnnotations: readonly Annotation[] | undefined;
    const client = fakeClient(async (input, annotations) => {
      capturedInput = input;
      capturedAnnotations = annotations;
      return new Uint8Array([9]);
    });
    const { container } = renderAt(client);

    await addPdfAndAnnotation(container);
    fireEvent.click(
      screen.getByRole("button", { name: "Exportar PDF anotado" }),
    );

    await waitFor(() => expect(capturedInput).toBeDefined());
    expect(capturedInput && Array.from(capturedInput)).toEqual([1, 2, 3]);
    expect(capturedAnnotations).toHaveLength(1);
    expect(capturedAnnotations?.[0].kind).toBe("text");
  });

  it("muestra una barra de progreso con aria-valuenow durante el aplanado (R22)", async () => {
    let resolveAnnotate: ((bytes: Uint8Array) => void) | undefined;
    const client = fakeClient(
      (_input, _annotations, onProgress?: ProgressCallback) => {
        onProgress?.(0.5);
        return new Promise<Uint8Array>((resolve) => {
          resolveAnnotate = resolve;
        });
      },
    );
    const { container } = renderAt(client);

    await addPdfAndAnnotation(container);
    fireEvent.click(
      screen.getByRole("button", { name: "Exportar PDF anotado" }),
    );

    const bar = await screen.findByRole("progressbar");
    await waitFor(() => expect(bar).toHaveAttribute("aria-valuenow", "0.5"));
    resolveAnnotate?.(new Uint8Array([9]));
  });

  it("en éxito Descargar llama downloadBlob con anotado.pdf, sin red (R26, R27)", async () => {
    const client = fakeClient(async () => new Uint8Array([1, 2, 3]));
    const { container } = renderAt(client);

    await addPdfAndAnnotation(container);
    fireEvent.click(
      screen.getByRole("button", { name: "Exportar PDF anotado" }),
    );

    const download = await screen.findByRole("button", { name: "Descargar" });
    fireEvent.click(download);

    expect(downloadBlob).toHaveBeenCalledTimes(1);
    const [blob, name] = vi.mocked(downloadBlob).mock.calls[0];
    expect(blob).toBeInstanceOf(Blob);
    expect(name).toBe("anotado.pdf");
  });

  it("ante error de dominio muestra alert y oculta Descargar", async () => {
    const client = fakeClient(async () => {
      throw new AnnotateFailedError();
    });
    const { container } = renderAt(client);

    await addPdfAndAnnotation(container);
    fireEvent.click(
      screen.getByRole("button", { name: "Exportar PDF anotado" }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("No se pudo aplanar las anotaciones");
    expect(
      screen.queryByRole("button", { name: "Descargar" }),
    ).not.toBeInTheDocument();
  });
});
