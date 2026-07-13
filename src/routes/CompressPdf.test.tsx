import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { downloadBlob } from "@/lib/download";
import {
  RESOURCE_COST_EXPLANATION,
  RESOURCE_COST_LABEL,
} from "@/lib/resourceCost";
import type { CompressOptions, CompressPdfResult } from "@/pdf/compressPdf";
import { CompressFailedError, type ProgressCallback } from "@/pdf/types";
import { CompressPdf, PDF_VALIDATION } from "@/routes/CompressPdf";
import type { PdfClient } from "@/workers/pdfClient";

vi.mock("@/lib/download", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/download")>();
  return { ...actual, downloadBlob: vi.fn() };
});

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

function result(overrides?: Partial<CompressPdfResult>): CompressPdfResult {
  return {
    bytes: new Uint8Array([1, 2, 3]),
    report: {
      originalSize: 2048,
      compressedSize: 1024,
      totalImages: 1,
      recompressibleImages: 1,
      recompressedImages: 1,
      minimalReduction: false,
    },
    ...overrides,
  };
}

/** Cliente falso que captura la llamada a compress y devuelve un resultado fijo. */
function fakeClient(compress: PdfClient["compress"]): PdfClient {
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
    compress,
    async protect() {
      return new Uint8Array();
    },
    async annotate() {
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

function renderAt(client: PdfClient) {
  return render(
    <MemoryRouter initialEntries={["/comprimir"]}>
      <Routes>
        <Route path="/comprimir" element={<CompressPdf client={client} />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("CompressPdf — estructura (R26, R27, R28)", () => {
  it("monta la página en /comprimir mostrando su título (R26)", () => {
    renderAt(fakeClient(async () => result()));
    expect(
      screen.getByRole("heading", { name: "Comprimir PDF" }),
    ).toBeInTheDocument();
  });

  it("el Dropzone acepta un único archivo (R27)", () => {
    const { container } = renderAt(fakeClient(async () => result()));
    expect(fileInputs(container)[0].multiple).toBe(false);
  });

  it("valida la extensión .pdf y el MIME application/pdf (R27)", () => {
    expect(PDF_VALIDATION.allowedExtensions).toEqual([".pdf"]);
    expect(PDF_VALIDATION.allowedMimeTypes).toEqual(["application/pdf"]);
  });

  it("renderiza la nota de consumo 'Pesada' con su frase explicativa (R7)", () => {
    renderAt(fakeClient(async () => result()));
    expect(
      screen.getByLabelText(/consumo de recursos/i),
    ).toHaveTextContent(RESOURCE_COST_LABEL.heavy);
    expect(
      screen.getByText(RESOURCE_COST_EXPLANATION.heavy),
    ).toBeInTheDocument();
  });

  it("ofrece un control de nivel con las opciones low/medium/high (R28)", () => {
    renderAt(fakeClient(async () => result()));
    const group = screen.getByRole("group", { name: "Nivel de calidad" });
    const buttons = within(group).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual([
      "Máxima compresión",
      "Equilibrada",
      "Máxima calidad",
    ]);
    expect(
      buttons.map((b) => b.getAttribute("aria-pressed")),
    ).toEqual(["false", "true", "false"]);
  });
});

describe("CompressPdf — compresión (R29, R30, R31, R32, R33)", () => {
  it("invoca compress con los bytes del PDF y el nivel elegido (R29)", async () => {
    let capturedInput: Uint8Array | undefined;
    let capturedOptions: CompressOptions | undefined;
    const client = fakeClient(async (input, options) => {
      capturedInput = input;
      capturedOptions = options;
      return result();
    });
    const { container } = renderAt(client);

    addPdf(container, makePdfFile("a.pdf", [1, 2, 3]));
    fireEvent.click(screen.getByRole("button", { name: "Máxima compresión" }));
    fireEvent.click(screen.getByRole("button", { name: "Comprimir" }));

    await waitFor(() => {
      expect(capturedInput).toBeDefined();
    });
    expect(capturedInput && Array.from(capturedInput)).toEqual([1, 2, 3]);
    expect(capturedOptions?.level).toBe("low");
  });

  it("muestra una barra de progreso con aria-valuenow durante la compresión (R30)", async () => {
    let resolveCompress: ((r: CompressPdfResult) => void) | undefined;
    const client = fakeClient((_input, _options, onProgress?: ProgressCallback) => {
      onProgress?.(0.5);
      return new Promise<CompressPdfResult>((resolve) => {
        resolveCompress = resolve;
      });
    });
    const { container } = renderAt(client);

    addPdf(container, makePdfFile("a.pdf", [1]));
    fireEvent.click(screen.getByRole("button", { name: "Comprimir" }));

    const bar = await screen.findByRole("progressbar");
    await waitFor(() => {
      expect(bar).toHaveAttribute("aria-valuenow", "50");
    });

    resolveCompress?.(result());
  });

  it("muestra el aviso de reducción mínima cuando minimalReduction es true (R31)", async () => {
    const client = fakeClient(async () =>
      result({
        report: {
          originalSize: 2048,
          compressedSize: 2048,
          totalImages: 0,
          recompressibleImages: 0,
          recompressedImages: 0,
          minimalReduction: true,
        },
      }),
    );
    const { container } = renderAt(client);

    addPdf(container, makePdfFile("a.pdf", [1]));
    fireEvent.click(screen.getByRole("button", { name: "Comprimir" }));

    expect(await screen.findByText(/la reducción\s+será mínima/i)).toBeInTheDocument();
  });

  it("en éxito muestra los tamaños y Descargar llama downloadBlob con comprimido.pdf (R32)", async () => {
    const client = fakeClient(async () =>
      result({
        report: {
          originalSize: 2048,
          compressedSize: 1024,
          totalImages: 1,
          recompressibleImages: 1,
          recompressedImages: 1,
          minimalReduction: false,
        },
      }),
    );
    const { container } = renderAt(client);

    addPdf(container, makePdfFile("a.pdf", [1]));
    fireEvent.click(screen.getByRole("button", { name: "Comprimir" }));

    const download = await screen.findByRole("button", { name: /descargar resultado/i });
    expect(screen.getByText("2 KB")).toBeInTheDocument();
    expect(screen.getByText("1 KB")).toBeInTheDocument();

    fireEvent.click(download);
    expect(downloadBlob).toHaveBeenCalledTimes(1);
    const [blob, name] = vi.mocked(downloadBlob).mock.calls[0];
    expect(blob).toBeInstanceOf(Blob);
    expect(name).toBe("comprimido.pdf");
  });

  it("ante error de dominio muestra alert y oculta Descargar (R33)", async () => {
    const client = fakeClient(async () => {
      throw new CompressFailedError();
    });
    const { container } = renderAt(client);

    addPdf(container, makePdfFile("a.pdf", [1]));
    fireEvent.click(screen.getByRole("button", { name: "Comprimir" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("No se pudo comprimir el PDF");
    expect(
      screen.queryByRole("button", { name: /descargar resultado/i }),
    ).not.toBeInTheDocument();
  });
});
