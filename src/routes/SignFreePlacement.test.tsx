import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { downloadBlob } from "@/lib/download";
import type { Annotation } from "@/pdf/annotate";
import type { PageCounter } from "@/pdf/pageCount";
import type { PageRasterizer, PageRasterizerFactory } from "@/pdf/rasterize";
import { formatSignatureDate } from "@/pdf/signature";
import { AnnotateFailedError } from "@/pdf/types";
import { SignFreePlacement } from "@/routes/SignFreePlacement";
import type { PdfClient } from "@/workers/pdfClient";

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:mock") as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

vi.mock("@/lib/download", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/download")>();
  return { ...actual, downloadBlob: vi.fn() };
});

vi.mock("@/lib/signatureCanvasToPng", () => ({
  signatureCanvasToPng: vi.fn(async () => DRAWN_BYTES),
}));

/** Bytes PNG conocidos que devuelve la costura de dibujo mockeada. (R16) */
const DRAWN_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 7, 7, 7]);

function mockRasterizer(pageCount = 3): PageRasterizerFactory {
  const rasterizer: PageRasterizer = {
    pageCount: () => pageCount,
    renderPage: () =>
      Promise.resolve(new Blob([new Uint8Array([1])], { type: "image/png" })),
    destroy: () => {},
  };
  return async () => rasterizer;
}

function fakeCounter(pages: number): PageCounter {
  return async () => pages;
}

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
  const inputs = fileInputs(container);
  fireEvent.change(inputs[inputs.length - 1], { target: { files: [file] } });
}

/** Cliente falso que captura la llamada a annotate y devuelve bytes fijos. */
function fakeClient(annotate: PdfClient["annotate"]): PdfClient {
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
    async protect() {
      return new Uint8Array();
    },
    annotate,
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

function renderAt(
  client: PdfClient,
  counter: PageCounter = fakeCounter(3),
  createRasterizer: PageRasterizerFactory = mockRasterizer(),
) {
  return render(
    <MemoryRouter initialEntries={["/firmar-libre"]}>
      <Routes>
        <Route
          path="/firmar-libre"
          element={
            <SignFreePlacement
              client={client}
              countPages={counter}
              createRasterizer={createRasterizer}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

/** Sube PDF + firma subida y espera a que «Firmar PDF» quede habilitado. */
async function loadPdfAndSignature(
  container: HTMLElement,
  pdf: File,
  image: File,
): Promise<HTMLButtonElement> {
  addPdf(container, pdf);
  addImage(container, image);
  const button = screen.getByRole("button", {
    name: "Firmar PDF",
  }) as HTMLButtonElement;
  await waitFor(() => expect(button).not.toBeDisabled());
  return button;
}

function imageAnnotations(anns: readonly Annotation[]): Annotation[] {
  return anns.filter((a) => a.kind === "image");
}

function textAnnotations(anns: readonly Annotation[]): Annotation[] {
  return anns.filter((a) => a.kind === "text");
}

describe("SignFreePlacement — multipágina en una sola exportación (R14, R20)", () => {
  it("firma cada página seleccionada con una anotación image en una sola llamada", async () => {
    let captured: readonly Annotation[] | undefined;
    const annotate = vi.fn(async (_input: Uint8Array, anns: readonly Annotation[]) => {
      captured = anns;
      return new Uint8Array([9]);
    });
    const { container } = renderAt(fakeClient(annotate));

    addPdf(container, makePdfFile("a.pdf", [1, 2, 3]));
    addImage(container, makeImageFile("firma.png", [0x89, 0x50, 0x4e, 0x47]));

    // Selecciona TODAS las páginas (3) con el atajo del selector.
    const selectAll = await screen.findByRole("button", { name: "Todas" });
    fireEvent.click(selectAll);

    const button = screen.getByRole("button", { name: "Firmar PDF" });
    await waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);

    await waitFor(() => expect(annotate).toHaveBeenCalledTimes(1));
    const images = imageAnnotations(captured ?? []);
    expect(images).toHaveLength(3);
    expect(images.map((a) => a.pageIndex).sort((x, y) => x - y)).toEqual([
      0, 1, 2,
    ]);
  });
});

describe("SignFreePlacement — bytes de la firma subida (R15)", () => {
  it("usa los bytes de la imagen subida como data de la anotación image", async () => {
    let captured: readonly Annotation[] | undefined;
    const annotate = vi.fn(async (_input: Uint8Array, anns: readonly Annotation[]) => {
      captured = anns;
      return new Uint8Array([9]);
    });
    const { container } = renderAt(fakeClient(annotate));

    const button = await loadPdfAndSignature(
      container,
      makePdfFile("a.pdf", [1]),
      makeImageFile("firma.png", [0x89, 0x50, 0x4e, 0x47]),
    );
    fireEvent.click(button);

    await waitFor(() => expect(captured).toBeDefined());
    const image = imageAnnotations(captured ?? [])[0];
    expect(image.kind).toBe("image");
    if (image.kind === "image") {
      expect(Array.from(image.data)).toEqual([0x89, 0x50, 0x4e, 0x47]);
    }
  });
});

describe("SignFreePlacement — firma dibujada (R16)", () => {
  it("usa los bytes PNG de la costura de dibujo mockeada como firma", async () => {
    let captured: readonly Annotation[] | undefined;
    const annotate = vi.fn(async (_input: Uint8Array, anns: readonly Annotation[]) => {
      captured = anns;
      return new Uint8Array([9]);
    });
    const { container } = renderAt(fakeClient(annotate));

    addPdf(container, makePdfFile("a.pdf", [1]));
    // Cambia el origen de firma a "Dibujar".
    fireEvent.change(screen.getByLabelText("Origen de la firma"), {
      target: { value: "draw" },
    });
    const canvas = await screen.findByTestId("signature-pad-canvas");
    // Un pointerDown habilita el botón de confirmación del pad.
    fireEvent.pointerDown(canvas, { clientX: 5, clientY: 5, pointerId: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Usar esta firma" }));

    const button = screen.getByRole("button", { name: "Firmar PDF" });
    await waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);

    await waitFor(() => expect(captured).toBeDefined());
    const image = imageAnnotations(captured ?? [])[0];
    if (image.kind === "image") {
      expect(Array.from(image.data)).toEqual(Array.from(DRAWN_BYTES));
    }
  });
});

describe("SignFreePlacement — extra de fecha (R17)", () => {
  it("añade un extra cuyo texto es formatSignatureDate y aparece como anotación text", async () => {
    vi.setSystemTime(new Date("2026-07-07T10:00:00Z"));
    let captured: readonly Annotation[] | undefined;
    const annotate = vi.fn(async (_input: Uint8Array, anns: readonly Annotation[]) => {
      captured = anns;
      return new Uint8Array([9]);
    });
    const { container } = renderAt(fakeClient(annotate));

    addPdf(container, makePdfFile("a.pdf", [1]));
    addImage(container, makeImageFile("firma.png", [0x89, 0x50, 0x4e, 0x47]));
    const addDate = await screen.findByRole("button", { name: "Añadir fecha" });
    fireEvent.click(addDate);

    const button = screen.getByRole("button", { name: "Firmar PDF" });
    await waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);

    await waitFor(() => expect(captured).toBeDefined());
    const expected = formatSignatureDate(new Date("2026-07-07T10:00:00Z"));
    const texts = textAnnotations(captured ?? []);
    expect(texts.some((a) => a.kind === "text" && a.text === expected)).toBe(
      true,
    );
    vi.useRealTimers();
  });
});

describe("SignFreePlacement — extra de iniciales/nombre (R18)", () => {
  it("añade una anotación text con el texto exacto introducido", async () => {
    let captured: readonly Annotation[] | undefined;
    const annotate = vi.fn(async (_input: Uint8Array, anns: readonly Annotation[]) => {
      captured = anns;
      return new Uint8Array([9]);
    });
    const { container } = renderAt(fakeClient(annotate));

    addPdf(container, makePdfFile("a.pdf", [1]));
    addImage(container, makeImageFile("firma.png", [0x89, 0x50, 0x4e, 0x47]));
    await screen.findByLabelText("Iniciales o nombre");
    fireEvent.change(screen.getByLabelText("Iniciales o nombre"), {
      target: { value: "J. Panda" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Añadir texto" }));

    const button = screen.getByRole("button", { name: "Firmar PDF" });
    await waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);

    await waitFor(() => expect(captured).toBeDefined());
    const texts = textAnnotations(captured ?? []);
    expect(texts.some((a) => a.kind === "text" && a.text === "J. Panda")).toBe(
      true,
    );
  });
});

describe("SignFreePlacement — aviso de firma visual (R19)", () => {
  it("muestra que la firma es visual y no una firma digital certificada", () => {
    renderAt(fakeClient(async () => new Uint8Array([1])));
    const notice = screen.getByText(/firma visual/i);
    expect(notice.textContent).toMatch(/no es una firma digital certificada/i);
  });
});

describe("SignFreePlacement — descarga local (R21)", () => {
  it("tras éxito, Descargar dispara downloadBlob con firmado.pdf", async () => {
    const { container } = renderAt(
      fakeClient(async () => new Uint8Array([1, 2, 3])),
    );

    const button = await loadPdfAndSignature(
      container,
      makePdfFile("a.pdf", [1]),
      makeImageFile("firma.png", [0x89, 0x50, 0x4e, 0x47]),
    );
    fireEvent.click(button);

    const download = await screen.findByRole("button", {
      name: /descargar resultado/i,
    });
    fireEvent.click(download);

    expect(downloadBlob).toHaveBeenCalledTimes(1);
    const [blob, name] = vi.mocked(downloadBlob).mock.calls[0];
    expect(blob).toBeInstanceOf(Blob);
    expect(name).toBe("firmado.pdf");
  });
});

describe("SignFreePlacement — botón deshabilitado (R22)", () => {
  it("deshabilitado sin PDF, sin firma; habilitado con ambos", async () => {
    const { container } = renderAt(fakeClient(async () => new Uint8Array([9])));
    const button = screen.getByRole("button", { name: "Firmar PDF" });
    expect(button).toBeDisabled();

    addPdf(container, makePdfFile("a.pdf", [1]));
    expect(button).toBeDisabled();

    addImage(container, makeImageFile("firma.png", [0x89, 0x50, 0x4e, 0x47]));
    await waitFor(() => expect(button).not.toBeDisabled());
  });
});

describe("SignFreePlacement — error de dominio (R23)", () => {
  it("ante AnnotateFailedError muestra alert y no ofrece descarga", async () => {
    const client = fakeClient(async () => {
      throw new AnnotateFailedError();
    });
    const { container } = renderAt(client);

    const button = await loadPdfAndSignature(
      container,
      makePdfFile("a.pdf", [1]),
      makeImageFile("firma.png", [0x89, 0x50, 0x4e, 0x47]),
    );
    fireEvent.click(button);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("No se pudo firmar el PDF");
    expect(
      screen.queryByRole("button", { name: /descargar resultado/i }),
    ).not.toBeInTheDocument();
  });
});

describe("SignFreePlacement — cero red (R24)", () => {
  it("colocar, firmar y descargar no realizan ninguna petición de red", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const openSpy = vi.spyOn(XMLHttpRequest.prototype, "open");
    const sendSpy = vi.spyOn(XMLHttpRequest.prototype, "send");

    const { container } = renderAt(
      fakeClient(async () => new Uint8Array([1, 2, 3])),
    );

    const button = await loadPdfAndSignature(
      container,
      makePdfFile("a.pdf", [1]),
      makeImageFile("firma.png", [0x89, 0x50, 0x4e, 0x47]),
    );
    fireEvent.click(button);
    const download = await screen.findByRole("button", {
      name: /descargar resultado/i,
    });
    fireEvent.click(download);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
    expect(sendSpy).not.toHaveBeenCalled();
  });
});

describe("SignFreePlacement — vista previa (R25)", () => {
  it("renderiza un preview-overlay de imagen para la firma", async () => {
    class StubImage {
      onload: (() => void) | null = null;
      naturalWidth = 200;
      naturalHeight = 100;
      private _src = "";
      set src(value: string) {
        this._src = value;
        this.onload?.();
      }
      get src(): string {
        return this._src;
      }
    }
    vi.stubGlobal("Image", StubImage);
    Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", {
      configurable: true,
      get: () => 400,
    });
    Object.defineProperty(HTMLImageElement.prototype, "naturalHeight", {
      configurable: true,
      get: () => 600,
    });

    const { container } = renderAt(fakeClient(async () => new Uint8Array([9])));

    addPdf(container, makePdfFile("a.pdf", [1]));
    addImage(container, makeImageFile("firma.png", [0x89, 0x50, 0x4e, 0x47]));

    const previewImg = await screen.findByAltText(/vista previa de la página/i);
    fireEvent.load(previewImg);

    const overlays = await screen.findAllByTestId("preview-overlay");
    expect(overlays.length).toBeGreaterThan(0);
  });
});
