import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { downloadBlob } from "@/lib/download";
import { OrganizePages } from "@/routes/OrganizePages";
import { OrganizeFailedError, type ProgressCallback } from "@/pdf/types";
import type { ThumbnailRenderer } from "@/pdf/thumbnails";
import type { PdfClient } from "@/workers/pdfClient";

vi.mock("@/lib/download", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/download")>();
  return { ...actual, downloadBlob: vi.fn() };
});

afterEach(() => {
  vi.clearAllMocks();
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

/** Renderer falso (sin pdf.js): resuelve URLs sintéticas por página. */
function makeRenderer(
  pageCount: number,
): ThumbnailRenderer & { destroy: ReturnType<typeof vi.fn> } {
  return {
    pageCount: () => pageCount,
    renderPage: async (i: number) => `data:thumb-${i}`,
    destroy: vi.fn(),
  };
}

/** Cliente falso que captura la llamada a organize y devuelve bytes fijos. */
function fakeClient(organize: PdfClient["organize"]): PdfClient {
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
    organize,
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
    dispose() {
      // no-op
    },
  };
}

function renderPage(
  client: PdfClient,
  createRenderer: (input: Uint8Array) => Promise<ThumbnailRenderer>,
) {
  return render(
    <MemoryRouter>
      <OrganizePages client={client} createRenderer={createRenderer} />
    </MemoryRouter>,
  );
}

const noopClient = fakeClient(async () => new Uint8Array([1]));

describe("OrganizePages", () => {
  it("monta con el encabezado de la herramienta (R43)", () => {
    renderPage(noopClient, async () => makeRenderer(3));
    expect(
      screen.getByRole("heading", { name: "Organizar páginas" }),
    ).toBeInTheDocument();
  });

  it("usa el Dropzone con un solo archivo (multiple=false) (R44)", () => {
    const { container } = renderPage(noopClient, async () => makeRenderer(3));
    expect(fileInput(container).multiple).toBe(false);
  });

  it("al seleccionar un PDF muestra una miniatura por página vía renderer inyectado (R45, R46)", async () => {
    const renderer = makeRenderer(3);
    const { container } = renderPage(noopClient, async () => renderer);

    addFiles(container, [makePdfFile("a.pdf", [1, 2, 3])]);

    await waitFor(() => {
      expect(screen.getAllByRole("img")).toHaveLength(3);
    });
    const imgs = screen.getAllByRole("img");
    expect(imgs.map((img) => img.getAttribute("alt"))).toEqual([
      "Miniatura de la página 1",
      "Miniatura de la página 2",
      "Miniatura de la página 3",
    ]);
  });

  it("reordena por drag&drop actualizando el modelo (R48)", async () => {
    const { container } = renderPage(noopClient, async () => makeRenderer(3));
    addFiles(container, [makePdfFile("a.pdf", [1, 2, 3])]);
    await screen.findAllByRole("img");

    const items = container.querySelectorAll('[data-testid^="page-"]');
    fireEvent.dragStart(items[0]);
    fireEvent.drop(items[2]);

    await waitFor(() => {
      const alts = screen
        .getAllByRole("img")
        .map((img) => img.getAttribute("alt"));
      expect(alts).toEqual([
        "Miniatura de la página 2",
        "Miniatura de la página 3",
        "Miniatura de la página 1",
      ]);
    });
  });

  it("marca una página para eliminar resaltándola (R49)", async () => {
    const { container } = renderPage(noopClient, async () => makeRenderer(3));
    addFiles(container, [makePdfFile("a.pdf", [1, 2, 3])]);
    await screen.findAllByRole("img");

    const toggle = screen.getByRole("button", {
      name: "Marcar la página 2 para eliminar",
    });
    fireEvent.click(toggle);

    expect(
      screen.getByRole("button", { name: "Conservar la página 2" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("con todas las páginas marcadas deshabilita Exportar y avisa (R50)", async () => {
    const { container } = renderPage(noopClient, async () => makeRenderer(2));
    addFiles(container, [makePdfFile("a.pdf", [1, 2])]);
    await screen.findAllByRole("img");

    fireEvent.click(
      screen.getByRole("button", { name: "Marcar la página 1 para eliminar" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Marcar la página 2 para eliminar" }),
    );

    expect(screen.getByRole("button", { name: "Exportar" })).toBeDisabled();
    expect(
      screen.getByText("No se pueden eliminar todas las páginas."),
    ).toBeInTheDocument();
  });

  it("al exportar invoca organize con los bytes y resolvePageOrder(model) (R51)", async () => {
    let capturedInput: Uint8Array | undefined;
    let capturedOrder: readonly number[] | undefined;
    const client = fakeClient(async (input, pageOrder) => {
      capturedInput = input;
      capturedOrder = pageOrder;
      return new Uint8Array([9]);
    });
    const { container } = renderPage(client, async () => makeRenderer(3));
    addFiles(container, [makePdfFile("a.pdf", [1, 2, 3])]);
    await screen.findAllByRole("img");

    // Marca la página 2 (posición 1) para eliminar → pageOrder esperado [0, 2].
    fireEvent.click(
      screen.getByRole("button", { name: "Marcar la página 2 para eliminar" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Exportar" }));

    await waitFor(() => {
      expect(capturedInput).toBeDefined();
    });
    expect(capturedInput && Array.from(capturedInput)).toEqual([1, 2, 3]);
    expect(capturedOrder && Array.from(capturedOrder)).toEqual([0, 2]);
  });

  it("muestra la barra de progreso mientras exporta (R52)", async () => {
    let resolveOrganize: ((bytes: Uint8Array) => void) | undefined;
    const client = fakeClient(
      (_input, _order, onProgress?: ProgressCallback) => {
        onProgress?.(0.5);
        return new Promise<Uint8Array>((resolve) => {
          resolveOrganize = resolve;
        });
      },
    );
    const { container } = renderPage(client, async () => makeRenderer(2));
    addFiles(container, [makePdfFile("a.pdf", [1, 2])]);
    await screen.findAllByRole("img");

    fireEvent.click(screen.getByRole("button", { name: "Exportar" }));

    const bar = await screen.findByRole("progressbar");
    await waitFor(() => {
      expect(bar).toHaveAttribute("aria-valuenow", "0.5");
    });
    resolveOrganize?.(new Uint8Array([9]));
  });

  it("en éxito ofrece Descargar y el Blob proviene de los bytes devueltos por organize (R53)", async () => {
    const client = fakeClient(async () => new Uint8Array([0xca, 0xfe]));
    const { container } = renderPage(client, async () => makeRenderer(2));
    addFiles(container, [makePdfFile("a.pdf", [1, 2])]);
    await screen.findAllByRole("img");

    fireEvent.click(screen.getByRole("button", { name: "Exportar" }));
    const download = await screen.findByRole("button", { name: "Descargar" });
    fireEvent.click(download);

    expect(downloadBlob).toHaveBeenCalledTimes(1);
    const blob = vi.mocked(downloadBlob).mock.calls[0][0];
    const buffer = await blob.arrayBuffer();
    expect(Array.from(new Uint8Array(buffer))).toEqual([0xca, 0xfe]);
  });

  it("ante error de dominio muestra mensaje y oculta Descargar (R54)", async () => {
    const client = fakeClient(async () => {
      throw new OrganizeFailedError();
    });
    const { container } = renderPage(client, async () => makeRenderer(2));
    addFiles(container, [makePdfFile("a.pdf", [1, 2])]);
    await screen.findAllByRole("img");

    fireEvent.click(screen.getByRole("button", { name: "Exportar" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("No se pudo organizar el PDF.");
    expect(
      screen.queryByRole("button", { name: "Descargar" }),
    ).not.toBeInTheDocument();
  });

  it("si el renderer no puede abrir el PDF muestra error y ninguna miniatura (R55)", async () => {
    const client = noopClient;
    const { container } = renderPage(client, async () => {
      throw new Error("no se pudo abrir");
    });
    addFiles(container, [makePdfFile("a.pdf", [1, 2])]);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("No se pudo abrir el PDF");
    expect(screen.queryAllByRole("img")).toHaveLength(0);
  });

  it("al limpiar el archivo libera el renderer y aborta el render (R47)", async () => {
    const renderer = makeRenderer(2);
    const { container } = renderPage(noopClient, async () => renderer);
    addFiles(container, [makePdfFile("a.pdf", [1, 2])]);
    await screen.findAllByRole("img");

    fireEvent.click(screen.getByRole("button", { name: "Quitar a.pdf" }));

    await waitFor(() => {
      expect(renderer.destroy).toHaveBeenCalled();
    });
  });
});
