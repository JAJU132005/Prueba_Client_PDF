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

/**
 * Añade un PDF, activa la herramienta de texto, abre el campo inline, escribe y
 * confirma la anotación (flujo real de #29: sin literal "Texto").
 */
async function addPdfAndAnnotation(
  container: HTMLElement,
  text = "Hola",
): Promise<void> {
  addPdf(container, makePdfFile("a.pdf", [1, 2, 3]));
  const textTool = await screen.findByRole("button", { name: "Texto" });
  fireEvent.click(textTool);
  const overlay = await screen.findByTestId("annotation-overlay");
  fireEvent.click(overlay, { clientX: 20, clientY: 30 });
  const input = await screen.findByTestId("annotation-text-input");
  fireEvent.change(input, { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Añadir" }));
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
    await waitFor(() => expect(bar).toHaveAttribute("aria-valuenow", "50"));
    resolveAnnotate?.(new Uint8Array([9]));
  });

  it("en éxito Descargar llama downloadBlob con anotado.pdf, sin red (R26, R27)", async () => {
    const client = fakeClient(async () => new Uint8Array([1, 2, 3]));
    const { container } = renderAt(client);

    await addPdfAndAnnotation(container);
    fireEvent.click(
      screen.getByRole("button", { name: "Exportar PDF anotado" }),
    );

    const download = await screen.findByRole("button", { name: /descargar resultado/i });
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
      screen.queryByRole("button", { name: /descargar resultado/i }),
    ).not.toBeInTheDocument();
  });
});

describe("EditAnnotatePdf — deshacer/rehacer (#37 R27, R33)", () => {
  it("Deshacer revierte la última anotación y Rehacer la restaura (R27)", async () => {
    const { container } = renderAt(fakeClient(async () => new Uint8Array([1])));

    await addPdfAndAnnotation(container, "Hola");
    expect(screen.getByTestId("annotation-text")).toHaveTextContent("Hola");

    const undo = screen.getByRole("button", { name: "Deshacer" });
    expect(undo).toBeEnabled();
    fireEvent.click(undo);
    expect(screen.queryByTestId("annotation-text")).not.toBeInTheDocument();

    const redo = screen.getByRole("button", { name: "Rehacer" });
    expect(redo).toBeEnabled();
    fireEvent.click(redo);
    expect(screen.getByTestId("annotation-text")).toHaveTextContent("Hola");
  });

  it("el atajo Ctrl+Z revierte la última anotación (R27)", async () => {
    const { container } = renderAt(fakeClient(async () => new Uint8Array([1])));

    await addPdfAndAnnotation(container, "Atajo");
    expect(screen.getByTestId("annotation-text")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(screen.queryByTestId("annotation-text")).not.toBeInTheDocument();
  });

  it("cargar un archivo nuevo deja el historial vacío (Deshacer deshabilitado) (R33)", async () => {
    const { container } = renderAt(fakeClient(async () => new Uint8Array([1])));

    await addPdfAndAnnotation(container, "Uno");
    expect(screen.getByRole("button", { name: "Deshacer" })).toBeEnabled();

    addPdf(container, makePdfFile("b.pdf", [4, 5, 6]));
    // Re-monta el editor tras recontar páginas del nuevo archivo.
    await screen.findByTestId("annotation-overlay");
    expect(screen.getByRole("button", { name: "Deshacer" })).toBeDisabled();
    expect(screen.queryByTestId("annotation-text")).not.toBeInTheDocument();
  });
});

describe("EditAnnotatePdf — ajustes de estilo y cero red (R1, R2, R29, R31)", () => {
  it("el tamaño de fuente elegido llega a la anotación exportada (R1, R2)", async () => {
    let captured: readonly Annotation[] | undefined;
    const client = fakeClient(async (_input, annotations) => {
      captured = annotations;
      return new Uint8Array([9]);
    });
    const { container } = renderAt(client);

    addPdf(container, makePdfFile("a.pdf", [1, 2, 3]));
    fireEvent.click(await screen.findByRole("button", { name: "Texto" }));
    // Cambia el tamaño de fuente ANTES de crear la anotación.
    fireEvent.change(screen.getByLabelText("Tamaño de fuente"), {
      target: { value: "32" },
    });
    const overlay = await screen.findByTestId("annotation-overlay");
    fireEvent.click(overlay, { clientX: 20, clientY: 30 });
    const input = await screen.findByTestId("annotation-text-input");
    fireEvent.change(input, { target: { value: "Estilo" } });
    fireEvent.click(screen.getByRole("button", { name: "Añadir" }));

    fireEvent.click(
      screen.getByRole("button", { name: "Exportar PDF anotado" }),
    );

    await waitFor(() => expect(captured).toBeDefined());
    expect(captured).toHaveLength(1);
    const created = captured?.[0];
    expect(created?.kind).toBe("text");
    if (created?.kind === "text") {
      expect(created.fontSize).toBe(32);
      expect(created.text).toBe("Estilo");
    }
  });

  it("exportar pasa al worker exactamente las anotaciones del editor, sin peticiones de red (R29, R31)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      let capturedInput: Uint8Array | undefined;
      let capturedAnnotations: readonly Annotation[] | undefined;
      const client = fakeClient(async (input, annotations) => {
        capturedInput = input;
        capturedAnnotations = annotations;
        return new Uint8Array([7]);
      });
      const { container } = renderAt(client);

      await addPdfAndAnnotation(container, "Sin red");
      fireEvent.click(
        screen.getByRole("button", { name: "Exportar PDF anotado" }),
      );

      await waitFor(() => expect(capturedAnnotations).toBeDefined());
      // Se pasan EXACTAMENTE los bytes del PDF y las anotaciones del estado.
      expect(capturedInput && Array.from(capturedInput)).toEqual([1, 2, 3]);
      expect(capturedAnnotations).toHaveLength(1);
      expect(capturedAnnotations?.[0].kind).toBe("text");
      // Cero red con los datos del usuario.
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
