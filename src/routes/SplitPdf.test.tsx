import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

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

function setRange(value: string): void {
  fireEvent.change(screen.getByLabelText("Rangos de páginas a extraer"), {
    target: { value },
  });
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
    dispose() {
      // no-op
    },
  };
}

function renderPage(client: PdfClient) {
  return render(
    <MemoryRouter>
      <SplitPdf client={client} />
    </MemoryRouter>,
  );
}

describe("SplitPdf", () => {
  it("mantiene 'Dividir' deshabilitado sin PDF o sin rango y lo habilita con ambos (R34)", () => {
    const client = fakeClient(async () => new Uint8Array([1]));
    const { container } = renderPage(client);

    const button = screen.getByRole("button", { name: "Dividir" });
    expect(button).toBeDisabled();

    // Solo PDF, sin rango → sigue deshabilitado.
    addFiles(container, [makePdfFile("a.pdf", [1])]);
    expect(screen.getByRole("button", { name: "Dividir" })).toBeDisabled();

    // Solo rango (reset de archivos no aplica aquí): con ambos se habilita.
    setRange("1-3,5");
    expect(screen.getByRole("button", { name: "Dividir" })).toBeEnabled();
  });

  it("con rango pero sin PDF permanece deshabilitado (R34)", () => {
    const client = fakeClient(async () => new Uint8Array([1]));
    renderPage(client);

    setRange("1-3");
    expect(screen.getByRole("button", { name: "Dividir" })).toBeDisabled();
  });

  it("al pulsar invoca split con los bytes del PDF y la spec (R35)", async () => {
    let capturedBytes: Uint8Array | undefined;
    let capturedSpec: string | undefined;
    const client = fakeClient(async (input, rangeSpec) => {
      capturedBytes = input;
      capturedSpec = rangeSpec;
      return new Uint8Array([9]);
    });
    const { container } = renderPage(client);

    addFiles(container, [makePdfFile("a.pdf", [1, 2, 3])]);
    setRange("1-2");
    fireEvent.click(screen.getByRole("button", { name: "Dividir" }));

    await waitFor(() => {
      expect(capturedBytes).toBeDefined();
    });
    expect(capturedBytes && Array.from(capturedBytes)).toEqual([1, 2, 3]);
    expect(capturedSpec).toBe("1-2");
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
    setRange("1");
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
    setRange("1");
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
    setRange("9");
    fireEvent.click(screen.getByRole("button", { name: "Dividir" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("El rango de páginas no es válido.");
    expect(
      screen.queryByRole("button", { name: "Descargar" }),
    ).not.toBeInTheDocument();
  });
});
