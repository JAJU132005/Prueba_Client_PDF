import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { downloadBlob } from "@/lib/download";
import { WatermarkFailedError, type ProgressCallback } from "@/pdf/types";
import type { WatermarkOptions } from "@/pdf/watermark";
import {
  IMAGE_VALIDATION,
  PDF_VALIDATION,
  Watermark,
} from "@/routes/Watermark";
import type { PdfClient } from "@/workers/pdfClient";

vi.mock("@/lib/download", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/download")>();
  return { ...actual, downloadBlob: vi.fn() };
});

function makePdfFile(name: string, bytes: number[]): File {
  return new File([new Uint8Array(bytes)], name, { type: "application/pdf" });
}

function makeImageFile(name: string, bytes: number[]): File {
  return new File([new Uint8Array(bytes)], name, { type: "image/png" });
}

function fileInputs(container: HTMLElement): HTMLInputElement[] {
  return Array.from(
    container.querySelectorAll('input[type="file"]'),
  ) as HTMLInputElement[];
}

function addPdf(container: HTMLElement, file: File): void {
  fireEvent.change(fileInputs(container)[0], { target: { files: [file] } });
}

function addImage(container: HTMLElement, file: File): void {
  // En modo imagen el segundo input de archivo es el de la imagen de marca.
  const inputs = fileInputs(container);
  fireEvent.change(inputs[inputs.length - 1], { target: { files: [file] } });
}

/** Cliente falso que captura la llamada a addWatermark y devuelve bytes fijos. */
function fakeClient(addWatermark: PdfClient["addWatermark"]): PdfClient {
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
    addWatermark,
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

function renderAt(client: PdfClient) {
  return render(
    <MemoryRouter initialEntries={["/marca-agua"]}>
      <Routes>
        <Route path="/marca-agua" element={<Watermark client={client} />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Watermark — estructura (R45, R46, R47, R48, R49, R50, R51, R52, R53, R54, R55, R62, R64)", () => {
  it("monta la página en /marca-agua mostrando su título (R45, R64)", () => {
    renderAt(fakeClient(async () => new Uint8Array([1])));
    expect(
      screen.getByRole("heading", { name: "Marca de agua" }),
    ).toBeInTheDocument();
  });

  it("el Dropzone del PDF acepta un único archivo (R46)", () => {
    const { container } = renderAt(fakeClient(async () => new Uint8Array([1])));
    expect(fileInputs(container)[0].multiple).toBe(false);
  });

  it("valida la extensión .pdf (R47)", () => {
    expect(PDF_VALIDATION.allowedExtensions).toEqual([".pdf"]);
  });

  it("valida el MIME application/pdf (R48)", () => {
    expect(PDF_VALIDATION.allowedMimeTypes).toEqual(["application/pdf"]);
  });

  it("ofrece un control de modo con las opciones text e image (R49)", () => {
    renderAt(fakeClient(async () => new Uint8Array([1])));
    const select = screen.getByLabelText("Modo de marca") as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual(["text", "image"]);
  });

  it("en modo imagen aparece un control de imagen que valida .jpg/.jpeg/.png (R50)", () => {
    renderAt(fakeClient(async () => new Uint8Array([1])));
    // En modo texto (por defecto) no se muestra el control de imagen.
    expect(screen.queryByText("Imagen de marca")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Modo de marca"), {
      target: { value: "image" },
    });
    expect(screen.getByText("Imagen de marca")).toBeInTheDocument();
    expect(IMAGE_VALIDATION.allowedExtensions).toEqual([
      ".jpg",
      ".jpeg",
      ".png",
    ]);
  });

  it("ofrece un control de posición con las nueve posiciones (R51)", () => {
    renderAt(fakeClient(async () => new Uint8Array([1])));
    const select = screen.getByLabelText("Posición") as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual([
      "top-left",
      "top-center",
      "top-right",
      "middle-left",
      "center",
      "middle-right",
      "bottom-left",
      "bottom-center",
      "bottom-right",
    ]);
  });

  it("ofrece un control numérico de opacidad (R52)", () => {
    renderAt(fakeClient(async () => new Uint8Array([1])));
    const input = screen.getByLabelText("Opacidad") as HTMLInputElement;
    expect(input.type).toBe("number");
  });

  it("ofrece un control numérico de ángulo (R53)", () => {
    renderAt(fakeClient(async () => new Uint8Array([1])));
    const input = screen.getByLabelText(
      "Ángulo de rotación",
    ) as HTMLInputElement;
    expect(input.type).toBe("number");
  });

  it("en modo texto ofrece campos de texto y tamaño de fuente (R54)", () => {
    renderAt(fakeClient(async () => new Uint8Array([1])));
    const textInput = screen.getByLabelText(
      "Texto de la marca",
    ) as HTMLInputElement;
    expect(textInput.type).toBe("text");
    const fontSize = screen.getByLabelText(
      "Tamaño de fuente",
    ) as HTMLInputElement;
    expect(fontSize.type).toBe("number");
  });

  it("ofrece un control de selección de páginas todas/subconjunto (R55)", () => {
    renderAt(fakeClient(async () => new Uint8Array([1])));
    expect(
      screen.getByRole("radio", { name: "Todas las páginas" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "Solo algunas" }),
    ).toBeInTheDocument();
  });
});

describe("Watermark — marcado (R56, R57, R58, R59, R60, R61)", () => {
  it("en modo texto invoca addWatermark con bytes y options elegidas (R56)", async () => {
    let capturedInput: Uint8Array | undefined;
    let capturedOptions: WatermarkOptions | undefined;
    const client = fakeClient(async (input, options) => {
      capturedInput = input;
      capturedOptions = options;
      return new Uint8Array([9]);
    });
    const { container } = renderAt(client);

    addPdf(container, makePdfFile("a.pdf", [1, 2, 3]));
    fireEvent.change(screen.getByLabelText("Texto de la marca"), {
      target: { value: "BORRADOR" },
    });
    fireEvent.change(screen.getByLabelText("Tamaño de fuente"), {
      target: { value: "30" },
    });
    fireEvent.change(screen.getByLabelText("Posición"), {
      target: { value: "top-right" },
    });
    fireEvent.change(screen.getByLabelText("Opacidad"), {
      target: { value: "0.5" },
    });
    fireEvent.change(screen.getByLabelText("Ángulo de rotación"), {
      target: { value: "30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Añadir marca" }));

    await waitFor(() => {
      expect(capturedInput).toBeDefined();
    });
    expect(capturedInput && Array.from(capturedInput)).toEqual([1, 2, 3]);
    expect(capturedOptions).toMatchObject({
      mode: "text",
      text: "BORRADOR",
      position: "top-right",
      opacity: 0.5,
      angle: 30,
      fontSize: 30,
      pages: "all",
    });
  });

  it("en modo subconjunto pasa el rango como pages (R55, R56)", async () => {
    let capturedOptions: WatermarkOptions | undefined;
    const client = fakeClient(async (_input, options) => {
      capturedOptions = options;
      return new Uint8Array([9]);
    });
    const { container } = renderAt(client);

    addPdf(container, makePdfFile("a.pdf", [1]));
    fireEvent.click(screen.getByRole("radio", { name: "Solo algunas" }));
    fireEvent.change(screen.getByLabelText("Rangos de páginas a marcar"), {
      target: { value: "1-3,5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Añadir marca" }));

    await waitFor(() => {
      expect(capturedOptions).toBeDefined();
    });
    expect(capturedOptions?.pages).toBe("1-3,5");
  });

  it("en modo imagen invoca addWatermark con mode image e image no nulo (R57)", async () => {
    let capturedOptions: WatermarkOptions | undefined;
    const client = fakeClient(async (_input, options) => {
      capturedOptions = options;
      return new Uint8Array([9]);
    });
    const { container } = renderAt(client);

    addPdf(container, makePdfFile("a.pdf", [1]));
    fireEvent.change(screen.getByLabelText("Modo de marca"), {
      target: { value: "image" },
    });
    addImage(container, makeImageFile("logo.png", [0x89, 0x50, 0x4e, 0x47]));
    fireEvent.click(screen.getByRole("button", { name: "Añadir marca" }));

    await waitFor(() => {
      expect(capturedOptions).toBeDefined();
    });
    expect(capturedOptions?.mode).toBe("image");
    expect(capturedOptions?.image).not.toBeNull();
  });

  it("muestra una barra de progreso con aria-valuenow durante el marcado (R58)", async () => {
    let resolveWatermark: ((bytes: Uint8Array) => void) | undefined;
    const client = fakeClient((_input, _options, onProgress?: ProgressCallback) => {
      onProgress?.(0.5);
      return new Promise<Uint8Array>((resolve) => {
        resolveWatermark = resolve;
      });
    });
    const { container } = renderAt(client);

    addPdf(container, makePdfFile("a.pdf", [1]));
    fireEvent.click(screen.getByRole("button", { name: "Añadir marca" }));

    const bar = await screen.findByRole("progressbar");
    await waitFor(() => {
      expect(bar).toHaveAttribute("aria-valuenow", "0.5");
    });

    resolveWatermark?.(new Uint8Array([9]));
  });

  it("en éxito Descargar llama downloadBlob con marca-agua.pdf (R59)", async () => {
    const client = fakeClient(async () => new Uint8Array([1, 2, 3]));
    const { container } = renderAt(client);

    addPdf(container, makePdfFile("a.pdf", [1]));
    fireEvent.click(screen.getByRole("button", { name: "Añadir marca" }));

    const download = await screen.findByRole("button", { name: "Descargar" });
    fireEvent.click(download);

    expect(downloadBlob).toHaveBeenCalledTimes(1);
    const [blob, name] = vi.mocked(downloadBlob).mock.calls[0];
    expect(blob).toBeInstanceOf(Blob);
    expect(name).toBe("marca-agua.pdf");
  });

  it("ante error de dominio muestra alert y oculta Descargar (R60, R61)", async () => {
    const client = fakeClient(async () => {
      throw new WatermarkFailedError();
    });
    const { container } = renderAt(client);

    addPdf(container, makePdfFile("a.pdf", [1]));
    fireEvent.click(screen.getByRole("button", { name: "Añadir marca" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("No se pudo añadir la marca de agua");
    expect(
      screen.queryByRole("button", { name: "Descargar" }),
    ).not.toBeInTheDocument();
  });
});
