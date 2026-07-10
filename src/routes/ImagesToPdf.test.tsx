import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { downloadBlob } from "@/lib/download";
import { InvalidImageError, type ProgressCallback } from "@/pdf/types";
import { IMAGE_VALIDATION, ImagesToPdf } from "@/routes/ImagesToPdf";
import type { PdfClient } from "@/workers/pdfClient";

vi.mock("@/lib/download", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/download")>();
  return { ...actual, downloadBlob: vi.fn() };
});

function makeImageFile(name: string, bytes: number[], type: string): File {
  return new File([new Uint8Array(bytes)], name, { type });
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

/** Cliente falso que captura la llamada a imagesToPdf y devuelve bytes fijos. */
function fakeClient(imagesToPdf: PdfClient["imagesToPdf"]): PdfClient {
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
    imagesToPdf,
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
    <MemoryRouter initialEntries={["/imagenes-a-pdf"]}>
      <Routes>
        <Route
          path="/imagenes-a-pdf"
          element={<ImagesToPdf client={client} />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ImagesToPdf — estructura (R39, R40, R41, R42, R43, R44, R50, R52)", () => {
  it("monta la página en /imagenes-a-pdf mostrando su título (R39, R52)", () => {
    renderAt(fakeClient(async () => new Uint8Array([1])));
    expect(
      screen.getByRole("heading", { name: "Imágenes a PDF" }),
    ).toBeInTheDocument();
  });

  it("el Dropzone acepta múltiples archivos (R40)", () => {
    const { container } = renderAt(fakeClient(async () => new Uint8Array([1])));
    expect(fileInput(container).multiple).toBe(true);
  });

  it("valida extensiones .jpg/.jpeg/.png (R41)", () => {
    expect(IMAGE_VALIDATION.allowedExtensions).toEqual([
      ".jpg",
      ".jpeg",
      ".png",
    ]);
  });

  it("valida los MIME image/jpeg e image/png (R42)", () => {
    expect(IMAGE_VALIDATION.allowedMimeTypes).toEqual([
      "image/jpeg",
      "image/png",
    ]);
  });

  it("con 2 imágenes aparece el control para reordenar (R43)", () => {
    const { container } = renderAt(fakeClient(async () => new Uint8Array([1])));
    addFiles(container, [
      makeImageFile("a.jpg", [1], "image/jpeg"),
      makeImageFile("b.png", [2], "image/png"),
    ]);
    expect(
      screen.getByRole("button", { name: "Mover a.jpg hacia abajo" }),
    ).toBeInTheDocument();
  });

  it("ofrece un control de tamaño de página con fit y A4 (R44)", () => {
    renderAt(fakeClient(async () => new Uint8Array([1])));
    const select = screen.getByLabelText("Tamaño de página") as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual(["fit", "a4"]);
  });
});

describe("ImagesToPdf — conversión (R45, R46, R47, R48, R49)", () => {
  it("al pulsar Convertir invoca imagesToPdf con los bytes en orden y el modo elegido (R45)", async () => {
    let capturedImages: readonly Uint8Array[] | undefined;
    let capturedOptions: { pageSize: string } | undefined;
    const client = fakeClient(async (images, options) => {
      capturedImages = images;
      capturedOptions = options;
      return new Uint8Array([9]);
    });
    const { container } = renderAt(client);

    addFiles(container, [
      makeImageFile("a.jpg", [1], "image/jpeg"),
      makeImageFile("b.png", [2], "image/png"),
    ]);
    fireEvent.change(screen.getByLabelText("Tamaño de página"), {
      target: { value: "a4" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cerrar el álbum con moño" }));

    await waitFor(() => {
      expect(capturedImages?.length).toBe(2);
    });
    expect(capturedImages?.map((b) => Array.from(b))).toEqual([[1], [2]]);
    expect(capturedOptions).toEqual({ pageSize: "a4" });
  });

  it("muestra una barra de progreso con aria-valuenow durante la conversión (R46)", async () => {
    let resolveConvert: ((bytes: Uint8Array) => void) | undefined;
    const client = fakeClient((_images, _options, onProgress?: ProgressCallback) => {
      onProgress?.(0.5);
      return new Promise<Uint8Array>((resolve) => {
        resolveConvert = resolve;
      });
    });
    const { container } = renderAt(client);

    addFiles(container, [makeImageFile("a.jpg", [1], "image/jpeg")]);
    fireEvent.click(screen.getByRole("button", { name: "Cerrar el álbum con moño" }));

    const bar = await screen.findByRole("progressbar");
    await waitFor(() => {
      expect(bar).toHaveAttribute("aria-valuenow", "50");
    });

    resolveConvert?.(new Uint8Array([9]));
  });

  it("en éxito Descargar llama downloadBlob con imagenes.pdf (R47)", async () => {
    const client = fakeClient(async () => new Uint8Array([1, 2, 3]));
    const { container } = renderAt(client);

    addFiles(container, [makeImageFile("a.jpg", [1], "image/jpeg")]);
    fireEvent.click(screen.getByRole("button", { name: "Cerrar el álbum con moño" }));

    const download = await screen.findByRole("button", { name: /descargar resultado/i });
    fireEvent.click(download);

    expect(downloadBlob).toHaveBeenCalledTimes(1);
    const [blob, name] = vi.mocked(downloadBlob).mock.calls[0];
    expect(blob).toBeInstanceOf(Blob);
    expect(name).toBe("imagenes.pdf");
  });

  it("ante error de dominio muestra alert y oculta Descargar (R48, R49)", async () => {
    const client = fakeClient(async () => {
      throw new InvalidImageError();
    });
    const { container } = renderAt(client);

    addFiles(container, [makeImageFile("a.jpg", [1], "image/jpeg")]);
    fireEvent.click(screen.getByRole("button", { name: "Cerrar el álbum con moño" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("no es un JPG o PNG válido");
    expect(
      screen.queryByRole("button", { name: /descargar resultado/i }),
    ).not.toBeInTheDocument();
  });
});
