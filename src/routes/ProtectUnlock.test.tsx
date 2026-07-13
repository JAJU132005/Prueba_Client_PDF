import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { downloadBlob } from "@/lib/download";
import type { ProtectOptions } from "@/pdf/protectPdf";
import { IncorrectPasswordError, InvalidPdfError } from "@/pdf/types";
import { ProtectUnlock, PDF_VALIDATION } from "@/routes/ProtectUnlock";
import type { PdfClient } from "@/workers/pdfClient";

vi.mock("@/lib/download", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/download")>();
  return { ...actual, downloadBlob: vi.fn() };
});

beforeEach(() => {
  vi.clearAllMocks();
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

/** Cliente falso que captura la llamada a protect y devuelve bytes fijos. */
function fakeClient(protect: PdfClient["protect"]): PdfClient {
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
    protect,
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
    <MemoryRouter initialEntries={["/proteger"]}>
      <Routes>
        <Route path="/proteger" element={<ProtectUnlock client={client} />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProtectUnlock — estructura (R21, R22, R23, R24)", () => {
  it("monta la página en /proteger mostrando su título (R21)", () => {
    renderAt(fakeClient(async () => new Uint8Array([1])));
    expect(
      screen.getByRole("heading", { name: "Proteger / desbloquear" }),
    ).toBeInTheDocument();
  });

  it("el Dropzone acepta un único archivo (R22)", () => {
    const { container } = renderAt(fakeClient(async () => new Uint8Array([1])));
    expect(fileInputs(container)[0].multiple).toBe(false);
  });

  it("valida la extensión .pdf y el MIME application/pdf (R22)", () => {
    expect(PDF_VALIDATION.allowedExtensions).toEqual([".pdf"]);
    expect(PDF_VALIDATION.allowedMimeTypes).toEqual(["application/pdf"]);
  });

  it("ofrece un control de modo con protect y unlock y permite alternar (R23)", () => {
    renderAt(fakeClient(async () => new Uint8Array([1])));
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    const values = radios.map((r) => r.value);
    expect(values).toEqual(["protect", "unlock"]);

    const unlock = radios[1];
    expect(unlock.checked).toBe(false);
    fireEvent.click(unlock);
    expect(unlock.checked).toBe(true);
  });

  it("ofrece un campo de contraseña de tipo password (R24)", () => {
    renderAt(fakeClient(async () => new Uint8Array([1])));
    const input = screen.getByLabelText("Contraseña") as HTMLInputElement;
    expect(input.type).toBe("password");
  });
});

describe("ProtectUnlock — habilitación del botón (R25)", () => {
  it("deshabilitado con contraseña vacía y habilitado al escribir (R25)", () => {
    const { container } = renderAt(fakeClient(async () => new Uint8Array([1])));
    addPdf(container, makePdfFile("a.pdf", [1, 2, 3]));

    const button = screen.getByRole("button", { name: "Proteger" });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Contraseña"), {
      target: { value: "secreta" },
    });
    expect(button).not.toBeDisabled();
  });
});

describe("ProtectUnlock — procesado (R26, R27, R28, R29)", () => {
  it("invoca protect con los bytes del PDF y { mode, password } (R26)", async () => {
    let capturedInput: Uint8Array | undefined;
    let capturedOptions: ProtectOptions | undefined;
    const client = fakeClient(async (input, options) => {
      capturedInput = input;
      capturedOptions = options;
      return new Uint8Array([9]);
    });
    const { container } = renderAt(client);

    addPdf(container, makePdfFile("a.pdf", [1, 2, 3]));
    fireEvent.click(screen.getByRole("radio", { name: /Desbloquear/ }));
    fireEvent.change(screen.getByLabelText("Contraseña"), {
      target: { value: "clave" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Desbloquear" }));

    await waitFor(() => {
      expect(capturedInput).toBeDefined();
    });
    expect(capturedInput && Array.from(capturedInput)).toEqual([1, 2, 3]);
    expect(capturedOptions).toEqual({ mode: "unlock", password: "clave" });
  });

  it("muestra una barra de progreso con aria-valuenow durante el procesado (R27)", async () => {
    let resolveProtect: ((b: Uint8Array) => void) | undefined;
    const client = fakeClient((_input, _options, onProgress) => {
      onProgress?.(0.5);
      return new Promise<Uint8Array>((resolve) => {
        resolveProtect = resolve;
      });
    });
    const { container } = renderAt(client);

    addPdf(container, makePdfFile("a.pdf", [1]));
    fireEvent.change(screen.getByLabelText("Contraseña"), {
      target: { value: "x" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Proteger" }));

    const bar = await screen.findByRole("progressbar");
    await waitFor(() => {
      expect(bar).toHaveAttribute("aria-valuenow", "50");
    });

    resolveProtect?.(new Uint8Array([1]));
  });

  it("éxito en protect → Descargar llama downloadBlob con protegido.pdf (R28)", async () => {
    const client = fakeClient(async () => new Uint8Array([1, 2, 3]));
    const { container } = renderAt(client);

    addPdf(container, makePdfFile("a.pdf", [1]));
    fireEvent.change(screen.getByLabelText("Contraseña"), {
      target: { value: "x" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Proteger" }));

    const download = await screen.findByRole("button", { name: /descargar resultado/i });
    fireEvent.click(download);
    expect(downloadBlob).toHaveBeenCalledTimes(1);
    const [blob, name] = vi.mocked(downloadBlob).mock.calls[0];
    expect(blob).toBeInstanceOf(Blob);
    expect(name).toBe("protegido.pdf");
  });

  it("éxito en unlock → Descargar llama downloadBlob con desbloqueado.pdf (R29)", async () => {
    const client = fakeClient(async () => new Uint8Array([1, 2, 3]));
    const { container } = renderAt(client);

    addPdf(container, makePdfFile("a.pdf", [1]));
    fireEvent.click(screen.getByRole("radio", { name: /Desbloquear/ }));
    fireEvent.change(screen.getByLabelText("Contraseña"), {
      target: { value: "x" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Desbloquear" }));

    const download = await screen.findByRole("button", { name: /descargar resultado/i });
    fireEvent.click(download);
    expect(downloadBlob).toHaveBeenCalledTimes(1);
    const [, name] = vi.mocked(downloadBlob).mock.calls[0];
    expect(name).toBe("desbloqueado.pdf");
  });
});

describe("ProtectUnlock — errores (R30, R30b, R31, R31b)", () => {
  it("IncorrectPasswordError → alert de contraseña incorrecta sin descarga (R30, R30b)", async () => {
    const client = fakeClient(async () => {
      throw new IncorrectPasswordError();
    });
    const { container } = renderAt(client);

    addPdf(container, makePdfFile("a.pdf", [1]));
    fireEvent.click(screen.getByRole("radio", { name: /Desbloquear/ }));
    fireEvent.change(screen.getByLabelText("Contraseña"), {
      target: { value: "mala" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Desbloquear" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent?.toLowerCase()).toContain("contraseña es incorrecta");
    expect(
      screen.queryByRole("button", { name: /descargar resultado/i }),
    ).not.toBeInTheDocument();
  });

  it("InvalidPdfError → alert sin descarga (R31, R31b)", async () => {
    const client = fakeClient(async () => {
      throw new InvalidPdfError();
    });
    const { container } = renderAt(client);

    addPdf(container, makePdfFile("a.pdf", [1]));
    fireEvent.change(screen.getByLabelText("Contraseña"), {
      target: { value: "x" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Proteger" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("no es un PDF válido");
    expect(
      screen.queryByRole("button", { name: /descargar resultado/i }),
    ).not.toBeInTheDocument();
  });
});
