import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import type { PageCounter } from "@/pdf/pageCount";
import { InvalidRangeError, type ProgressCallback } from "@/pdf/types";
import { SplitPdf } from "@/routes/SplitPdf";
import type { PdfClient } from "@/workers/pdfClient";

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

/** Contador de páginas falso (sin pdf.js): devuelve un número fijo. */
function fakeCounter(pages: number): PageCounter {
  return async () => pages;
}

/** Cliente falso que captura la llamada a split y devuelve bytes fijos. */
function fakeClient(split: PdfClient["split"]): PdfClient {
  return {
    async probe() {
      return { sum: 0, count: 0 };
    },
    async merge() {
      return new Uint8Array();
    },
    split,
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
    async ocr() {
      return { text: "" };
    },
    dispose() {
      // no-op
    },
  };
}

function renderPage(client: PdfClient, counter: PageCounter = fakeCounter(3)) {
  return render(
    <MemoryRouter>
      <SplitPdf client={client} countPages={counter} />
    </MemoryRouter>,
  );
}

describe("SplitPdf", () => {
  it("mantiene 'Dividir' deshabilitado sin PDF y lo habilita al contar páginas (R34)", async () => {
    const client = fakeClient(async () => new Uint8Array([1]));
    const { container } = renderPage(client);

    expect(screen.getByRole("button", { name: "Dividir" })).toBeDisabled();

    // Al añadir el PDF se cuentan sus páginas y aparece el selector con todas
    // seleccionadas por defecto → el botón se habilita.
    addFiles(container, [makePdfFile("a.pdf", [1, 2, 3])]);
    await screen.findByRole("button", { name: "Página 1" });
    expect(screen.getByRole("button", { name: "Dividir" })).toBeEnabled();
  });

  it("con todas las páginas deseleccionadas 'Dividir' vuelve a deshabilitarse (R34)", async () => {
    const client = fakeClient(async () => new Uint8Array([1]));
    const { container } = renderPage(client, fakeCounter(2));

    addFiles(container, [makePdfFile("a.pdf", [1, 2])]);
    await screen.findByRole("button", { name: "Página 1" });

    // Deselecciona ambas páginas.
    fireEvent.click(screen.getByRole("button", { name: "Página 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Página 2" }));
    expect(screen.getByRole("button", { name: "Dividir" })).toBeDisabled();
  });

  it("al pulsar invoca split con los bytes del PDF y la spec del selector (R35)", async () => {
    let capturedBytes: Uint8Array | undefined;
    let capturedSpec: string | undefined;
    const client = fakeClient(async (input, rangeSpec) => {
      capturedBytes = input;
      capturedSpec = rangeSpec;
      return new Uint8Array([9]);
    });
    const { container } = renderPage(client, fakeCounter(3));

    addFiles(container, [makePdfFile("a.pdf", [1, 2, 3])]);
    await screen.findByRole("button", { name: "Página 1" });
    // Deselecciona la página 3 → spec esperada "1-2".
    fireEvent.click(screen.getByRole("button", { name: "Página 3" }));
    fireEvent.click(screen.getByRole("button", { name: "Dividir" }));

    await waitFor(() => {
      expect(capturedBytes).toBeDefined();
    });
    expect(capturedBytes && Array.from(capturedBytes)).toEqual([1, 2, 3]);
    expect(capturedSpec).toBe("1-2");
  });

  it("con todas las páginas seleccionadas pasa la spec numérica '1-N' (R35)", async () => {
    let capturedSpec: string | undefined;
    const client = fakeClient(async (_input, rangeSpec) => {
      capturedSpec = rangeSpec;
      return new Uint8Array([9]);
    });
    const { container } = renderPage(client, fakeCounter(4));

    addFiles(container, [makePdfFile("a.pdf", [1])]);
    await screen.findByRole("button", { name: "Página 1" });
    fireEvent.click(screen.getByRole("button", { name: "Dividir" }));

    await waitFor(() => {
      expect(capturedSpec).toBeDefined();
    });
    expect(capturedSpec).toBe("1-4");
  });

  it("muestra la barra de progreso mientras divide (R36)", async () => {
    let resolveSplit: ((bytes: Uint8Array) => void) | undefined;
    const client = fakeClient(
      (_input, _spec, onProgress?: ProgressCallback) => {
        onProgress?.(0.5);
        return new Promise<Uint8Array>((resolve) => {
          resolveSplit = resolve;
        });
      },
    );
    const { container } = renderPage(client);

    addFiles(container, [makePdfFile("a.pdf", [1])]);
    await screen.findByRole("button", { name: "Página 1" });
    fireEvent.click(screen.getByRole("button", { name: "Dividir" }));

    const bar = await screen.findByRole("progressbar");
    await waitFor(() => {
      expect(bar).toHaveAttribute("aria-valuenow", "0.5");
    });

    resolveSplit?.(new Uint8Array([9]));
  });

  it("en éxito ofrece el botón Descargar (R37, R38)", async () => {
    const client = fakeClient(async () => new Uint8Array([1, 2, 3]));
    const { container } = renderPage(client);

    addFiles(container, [makePdfFile("a.pdf", [1])]);
    await screen.findByRole("button", { name: "Página 1" });
    fireEvent.click(screen.getByRole("button", { name: "Dividir" }));

    expect(
      await screen.findByRole("button", { name: "Descargar" }),
    ).toBeInTheDocument();
  });

  it("ante error de dominio muestra mensaje y oculta Descargar (R39)", async () => {
    const client = fakeClient(async () => {
      throw new InvalidRangeError();
    });
    const { container } = renderPage(client);

    addFiles(container, [makePdfFile("a.pdf", [1])]);
    await screen.findByRole("button", { name: "Página 1" });
    fireEvent.click(screen.getByRole("button", { name: "Dividir" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("El rango de páginas no es válido.");
    expect(
      screen.queryByRole("button", { name: "Descargar" }),
    ).not.toBeInTheDocument();
  });
});
