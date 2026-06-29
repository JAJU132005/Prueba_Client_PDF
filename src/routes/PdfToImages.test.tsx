import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";
import { ThemeProvider } from "@/design/theme";
import { downloadBlob } from "@/lib/download";
import { PdfToImages } from "@/routes/PdfToImages";
import {
  imageMimeType,
  type PageRasterizer,
  type RasterizeOptions,
} from "@/pdf/rasterize";

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

/** Rasterizador falso (sin pdf.js): devuelve blobs sintéticos y registra opciones. */
function makeRasterizer(pageCount: number): PageRasterizer & {
  options: RasterizeOptions[];
  destroy: ReturnType<typeof vi.fn>;
} {
  const options: RasterizeOptions[] = [];
  return {
    options,
    pageCount: () => pageCount,
    async renderPage(_index, opts) {
      options.push(opts);
      return new Blob([new Uint8Array([0x01])], {
        type: imageMimeType(opts.format),
      });
    },
    destroy: vi.fn(),
  };
}

function renderPage(
  createRasterizer: (input: Uint8Array) => Promise<PageRasterizer>,
) {
  return render(
    <MemoryRouter>
      <PdfToImages createRasterizer={createRasterizer} />
    </MemoryRouter>,
  );
}

describe("PdfToImages", () => {
  it("monta en /pdf-a-imagenes y no el placeholder (R25, R37)", () => {
    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={["/pdf-a-imagenes"]}>
          <App />
        </MemoryRouter>
      </ThemeProvider>,
    );
    expect(
      screen.getByRole("heading", { name: "PDF a imágenes" }),
    ).toBeInTheDocument();
  });

  it("monta el componente aislado con su título (R25, R36)", () => {
    renderPage(async () => makeRasterizer(2));
    expect(
      screen.getByRole("heading", { name: "PDF a imágenes" }),
    ).toBeInTheDocument();
  });

  it("usa el Dropzone con un solo archivo (multiple=false) (R26)", () => {
    const { container } = renderPage(async () => makeRasterizer(2));
    expect(fileInput(container).multiple).toBe(false);
  });

  it("rechaza un archivo que no es PDF por la validación (R26)", () => {
    const { container } = renderPage(async () => makeRasterizer(2));
    addFiles(container, [
      new File([new Uint8Array([1])], "foto.png", { type: "image/png" }),
    ]);
    // El archivo inválido no se añade; no aparecen controles de conversión.
    expect(
      screen.queryByRole("button", { name: "Convertir" }),
    ).not.toBeInTheDocument();
  });

  it("al seleccionar un PDF invoca la factoría con los bytes (R27)", async () => {
    let captured: Uint8Array | undefined;
    const { container } = renderPage(async (input) => {
      captured = input;
      return makeRasterizer(2);
    });
    addFiles(container, [makePdfFile("a.pdf", [1, 2, 3])]);
    await waitFor(() => {
      expect(captured).toBeDefined();
    });
    expect(captured && Array.from(captured)).toEqual([1, 2, 3]);
  });

  it("ofrece control de formato PNG/JPG y de resolución (R28, R29)", async () => {
    const { container } = renderPage(async () => makeRasterizer(2));
    addFiles(container, [makePdfFile("a.pdf", [1, 2, 3])]);
    await screen.findByRole("button", { name: "Convertir" });

    expect(screen.getByRole("radio", { name: "PNG" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "JPG" })).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Resolución" }),
    ).toBeInTheDocument();
  });

  it("al Convertir produce n resultados y pasa formato/escala elegidos (R30)", async () => {
    const rasterizer = makeRasterizer(3);
    const { container } = renderPage(async () => rasterizer);
    addFiles(container, [makePdfFile("a.pdf", [1, 2, 3])]);
    await screen.findByRole("button", { name: "Convertir" });

    // Elige JPG y resolución alta (escala 3).
    fireEvent.click(screen.getByRole("radio", { name: "JPG" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Resolución" }), {
      target: { value: "high" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Convertir" }));

    await waitFor(() => {
      expect(
        screen.getAllByRole("button", { name: /Descargar la página/ }),
      ).toHaveLength(3);
    });
    expect(rasterizer.options).toHaveLength(3);
    expect(rasterizer.options[0].format).toBe("jpeg");
    expect(rasterizer.options[0].scale).toBe(3);
  });

  it("muestra una barra de progreso mientras convierte (R31)", async () => {
    let resolveRender: ((blob: Blob) => void) | undefined;
    const rasterizer: PageRasterizer = {
      pageCount: () => 2,
      renderPage: (_index, opts) =>
        new Promise<Blob>((resolve) => {
          resolveRender = () =>
            resolve(new Blob([new Uint8Array([1])], { type: imageMimeType(opts.format) }));
        }),
      destroy: () => {},
    };
    const { container } = renderPage(async () => rasterizer);
    addFiles(container, [makePdfFile("a.pdf", [1, 2])]);
    await screen.findByRole("button", { name: "Convertir" });

    fireEvent.click(screen.getByRole("button", { name: "Convertir" }));

    expect(await screen.findByRole("progressbar")).toBeInTheDocument();
    resolveRender?.(new Blob());
  });

  it("descarga individual llama downloadBlob con blob y nombre pagina-<n>.<ext> (R32)", async () => {
    const { container } = renderPage(async () => makeRasterizer(2));
    addFiles(container, [makePdfFile("a.pdf", [1, 2, 3])]);
    await screen.findByRole("button", { name: "Convertir" });
    fireEvent.click(screen.getByRole("button", { name: "Convertir" }));

    const downloads = await screen.findAllByRole("button", {
      name: /Descargar la página/,
    });
    fireEvent.click(downloads[0]);

    expect(downloadBlob).toHaveBeenCalledTimes(1);
    const [blob, name] = vi.mocked(downloadBlob).mock.calls[0];
    expect(blob).toBeInstanceOf(Blob);
    expect(name).toBe("pagina-1.png");
  });

  it("Descargar ZIP pasa un application/zip a downloadBlob como imagenes.zip (R33)", async () => {
    const { container } = renderPage(async () => makeRasterizer(2));
    addFiles(container, [makePdfFile("a.pdf", [1, 2, 3])]);
    await screen.findByRole("button", { name: "Convertir" });
    fireEvent.click(screen.getByRole("button", { name: "Convertir" }));

    const zipButton = await screen.findByRole("button", {
      name: "Descargar ZIP",
    });
    fireEvent.click(zipButton);

    await waitFor(() => {
      expect(downloadBlob).toHaveBeenCalledTimes(1);
    });
    const [blob, name] = vi.mocked(downloadBlob).mock.calls[0];
    expect((blob as Blob).type).toBe("application/zip");
    expect(name).toBe("imagenes.zip");
  });

  it("con createRasterizer que rechaza muestra alert y sin descargas (R34)", async () => {
    const { container } = renderPage(async () => {
      throw new Error("no se pudo abrir");
    });
    addFiles(container, [makePdfFile("a.pdf", [1, 2])]);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("No se pudo abrir el PDF");
    expect(
      screen.queryByRole("button", { name: "Descargar ZIP" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Descargar la página/ }),
    ).not.toBeInTheDocument();
  });
});
