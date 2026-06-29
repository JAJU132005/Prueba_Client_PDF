import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import type { RotateOptions } from "@/pdf/rotateOptions";
import { InvalidRotationError, type ProgressCallback } from "@/pdf/types";
import { RotatePdf } from "@/routes/RotatePdf";
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

function selectSubset(): void {
  fireEvent.click(screen.getByLabelText("Solo algunas"));
}

function setRange(value: string): void {
  fireEvent.change(screen.getByLabelText("Rangos de páginas a rotar"), {
    target: { value },
  });
}

/** Cliente falso que captura la llamada a rotate y devuelve bytes fijos. */
function fakeClient(rotate: PdfClient["rotate"]): PdfClient {
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
    rotate,
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
      <RotatePdf client={client} />
    </MemoryRouter>,
  );
}

describe("RotatePdf", () => {
  it("mantiene 'Rotar' deshabilitado sin PDF y lo habilita con un PDF en modo todas (R37)", () => {
    const client = fakeClient(async () => new Uint8Array([1]));
    const { container } = renderPage(client);

    expect(screen.getByRole("button", { name: "Rotar" })).toBeDisabled();

    addFiles(container, [makePdfFile("a.pdf", [1])]);
    expect(screen.getByRole("button", { name: "Rotar" })).toBeEnabled();
  });

  it("en modo subconjunto con rango vacío permanece deshabilitado y se habilita al escribir (R37)", () => {
    const client = fakeClient(async () => new Uint8Array([1]));
    const { container } = renderPage(client);

    addFiles(container, [makePdfFile("a.pdf", [1])]);
    selectSubset();
    expect(screen.getByRole("button", { name: "Rotar" })).toBeDisabled();

    setRange("1-2");
    expect(screen.getByRole("button", { name: "Rotar" })).toBeEnabled();
  });

  it("al pulsar invoca rotate con los bytes y un RotateOptions correcto (R38)", async () => {
    let capturedBytes: Uint8Array | undefined;
    let capturedOptions: RotateOptions | undefined;
    const client = fakeClient(async (input, options) => {
      capturedBytes = input;
      capturedOptions = options;
      return new Uint8Array([9]);
    });
    const { container } = renderPage(client);

    addFiles(container, [makePdfFile("a.pdf", [1, 2, 3])]);
    selectSubset();
    setRange("1-2");
    fireEvent.change(screen.getByLabelText("Ángulo de rotación"), {
      target: { value: "180" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Rotar" }));

    await waitFor(() => {
      expect(capturedBytes).toBeDefined();
    });
    expect(capturedBytes && Array.from(capturedBytes)).toEqual([1, 2, 3]);
    expect(capturedOptions).toEqual({ angle: 180, pages: "1-2" });
  });

  it("en modo todas envía pages 'all' (R38)", async () => {
    let capturedOptions: RotateOptions | undefined;
    const client = fakeClient(async (_input, options) => {
      capturedOptions = options;
      return new Uint8Array([9]);
    });
    const { container } = renderPage(client);

    addFiles(container, [makePdfFile("a.pdf", [1])]);
    fireEvent.click(screen.getByRole("button", { name: "Rotar" }));

    await waitFor(() => {
      expect(capturedOptions).toBeDefined();
    });
    expect(capturedOptions).toEqual({ angle: 90, pages: "all" });
  });

  it("muestra la barra de progreso mientras rota (R39)", async () => {
    let resolveRotate: ((bytes: Uint8Array) => void) | undefined;
    const client = fakeClient((_input, _options, onProgress?: ProgressCallback) => {
      onProgress?.(0.5);
      return new Promise<Uint8Array>((resolve) => {
        resolveRotate = resolve;
      });
    });
    const { container } = renderPage(client);

    addFiles(container, [makePdfFile("a.pdf", [1])]);
    fireEvent.click(screen.getByRole("button", { name: "Rotar" }));

    const bar = await screen.findByRole("progressbar");
    await waitFor(() => {
      expect(bar).toHaveAttribute("aria-valuenow", "0.5");
    });

    resolveRotate?.(new Uint8Array([9]));
  });

  it("en éxito ofrece el botón Descargar (R40, R41)", async () => {
    const client = fakeClient(async () => new Uint8Array([1, 2, 3]));
    const { container } = renderPage(client);

    addFiles(container, [makePdfFile("a.pdf", [1])]);
    fireEvent.click(screen.getByRole("button", { name: "Rotar" }));

    expect(
      await screen.findByRole("button", { name: "Descargar" }),
    ).toBeInTheDocument();
  });

  it("ante error de dominio muestra mensaje y oculta Descargar (R42)", async () => {
    const client = fakeClient(async () => {
      throw new InvalidRotationError();
    });
    const { container } = renderPage(client);

    addFiles(container, [makePdfFile("a.pdf", [1])]);
    fireEvent.click(screen.getByRole("button", { name: "Rotar" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("El ángulo de rotación no es válido.");
    expect(
      screen.queryByRole("button", { name: "Descargar" }),
    ).not.toBeInTheDocument();
  });
});
