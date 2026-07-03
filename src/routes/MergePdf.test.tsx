import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { InvalidPdfError, type ProgressCallback } from "@/pdf/types";
import { MergePdf } from "@/routes/MergePdf";
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

/** Cliente falso que captura los inputs del merge y devuelve bytes fijos. */
function fakeClient(
  merge: PdfClient["merge"],
): PdfClient {
  return {
    async probe() {
      return { sum: 0, count: 0 };
    },
    merge,
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
    async ocr() {
      return { text: "" };
    },
    dispose() {
      // no-op
    },
  };
}

function renderPage(client: PdfClient) {
  return render(
    <MemoryRouter>
      <MergePdf client={client} />
    </MemoryRouter>,
  );
}

describe("MergePdf", () => {
  it("mantiene 'Unir' deshabilitado con <2 archivos y lo habilita con 2 (R23)", () => {
    const client = fakeClient(async () => new Uint8Array([1]));
    const { container } = renderPage(client);

    const button = screen.getByRole("button", { name: "Unir" });
    expect(button).toBeDisabled();

    addFiles(container, [makePdfFile("a.pdf", [1])]);
    expect(screen.getByRole("button", { name: "Unir" })).toBeDisabled();

    addFiles(container, [makePdfFile("b.pdf", [2])]);
    expect(screen.getByRole("button", { name: "Unir" })).toBeEnabled();
  });

  it("al pulsar invoca merge con los inputs en el orden mostrado (R24)", async () => {
    const captured: Uint8Array[] = [];
    const client = fakeClient(async (inputs) => {
      captured.push(...inputs);
      return new Uint8Array([9]);
    });
    const { container } = renderPage(client);

    addFiles(container, [makePdfFile("a.pdf", [1]), makePdfFile("b.pdf", [2])]);
    fireEvent.click(screen.getByRole("button", { name: "Unir" }));

    await waitFor(() => {
      expect(captured.length).toBe(2);
    });
    expect(Array.from(captured[0])).toEqual([1]);
    expect(Array.from(captured[1])).toEqual([2]);
  });

  it("muestra la barra de progreso mientras une (R25)", async () => {
    let resolveMerge: ((bytes: Uint8Array) => void) | undefined;
    const client = fakeClient((_inputs, onProgress?: ProgressCallback) => {
      onProgress?.(0.5);
      return new Promise<Uint8Array>((resolve) => {
        resolveMerge = resolve;
      });
    });
    const { container } = renderPage(client);

    addFiles(container, [makePdfFile("a.pdf", [1]), makePdfFile("b.pdf", [2])]);
    fireEvent.click(screen.getByRole("button", { name: "Unir" }));

    const bar = await screen.findByRole("progressbar");
    await waitFor(() => {
      expect(bar).toHaveAttribute("aria-valuenow", "0.5");
    });

    resolveMerge?.(new Uint8Array([9]));
  });

  it("en éxito ofrece el botón Descargar (R26)", async () => {
    const client = fakeClient(async () => new Uint8Array([1, 2, 3]));
    const { container } = renderPage(client);

    addFiles(container, [makePdfFile("a.pdf", [1]), makePdfFile("b.pdf", [2])]);
    fireEvent.click(screen.getByRole("button", { name: "Unir" }));

    expect(
      await screen.findByRole("button", { name: "Descargar" }),
    ).toBeInTheDocument();
  });

  it("ante error de dominio muestra mensaje y oculta Descargar (R28)", async () => {
    const client = fakeClient(async () => {
      throw new InvalidPdfError();
    });
    const { container } = renderPage(client);

    addFiles(container, [makePdfFile("a.pdf", [1]), makePdfFile("b.pdf", [2])]);
    fireEvent.click(screen.getByRole("button", { name: "Unir" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("no es un PDF válido");
    expect(
      screen.queryByRole("button", { name: "Descargar" }),
    ).not.toBeInTheDocument();
  });
});
