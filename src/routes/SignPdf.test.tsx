import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";
import { ThemeProvider } from "@/design/theme";
import { downloadBlob } from "@/lib/download";
import type { Annotation } from "@/pdf/annotate";
import type { PageCounter } from "@/pdf/pageCount";
import type { PageRasterizer, PageRasterizerFactory } from "@/pdf/rasterize";
import { AnnotateFailedError } from "@/pdf/types";
import { SignPdf } from "@/routes/SignPdf";
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

// El worker real no existe en jsdom; App usa createPdfClient sin inyección.
vi.mock("@/workers/pdfClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/workers/pdfClient")>();
  return {
    ...actual,
    createPdfClient: () =>
      ({ dispose() {} }) as unknown as ReturnType<
        typeof actual.createPdfClient
      >,
  };
});

/** Bytes PNG conocidos que devuelve la costura de dibujo mockeada. (R14) */
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

/** Rect determinista del lienzo: 100×200 px (altura de página = 200 pts). */
function mockRect(): void {
  Element.prototype.getBoundingClientRect = vi.fn(
    () =>
      ({
        left: 0,
        top: 0,
        right: 100,
        bottom: 200,
        width: 100,
        height: 200,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect,
  );
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
    <MemoryRouter initialEntries={["/firmar"]}>
      <Routes>
        <Route
          path="/firmar"
          element={
            <SignPdf
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

/** Sube PDF + firma subida, la añade a la lista y espera a habilitar «Firmar». */
async function loadPdfAndPlaceSignature(
  container: HTMLElement,
  pdf: File,
  image: File,
): Promise<HTMLButtonElement> {
  addPdf(container, pdf);
  addImage(container, image);
  const addBtn = screen.getByRole("button", { name: "Añadir firma" });
  await waitFor(() => expect(addBtn).not.toBeDisabled());
  fireEvent.click(addBtn);
  const signBtn = screen.getByRole("button", {
    name: "Firmar PDF",
  }) as HTMLButtonElement;
  await waitFor(() => expect(signBtn).not.toBeDisabled());
  return signBtn;
}

function imageAnnotations(anns: readonly Annotation[]): Annotation[] {
  return anns.filter((a) => a.kind === "image");
}

describe("SignPdf — firma activa subida (R13)", () => {
  it("subir una imagen JPG/PNG deja la firma activa disponible para colocar", async () => {
    const { container } = renderAt(fakeClient(async () => new Uint8Array()));
    const addBtn = screen.getByRole("button", { name: "Añadir firma" });
    expect(addBtn).toBeDisabled();

    addImage(container, makeImageFile("firma.png", [0x89, 0x50, 0x4e, 0x47]));
    await waitFor(() => expect(addBtn).not.toBeDisabled());
  });
});

describe("SignPdf — firma activa dibujada (R14)", () => {
  it("dibujar + confirmar usa los bytes PNG de la costura como firma", async () => {
    let captured: readonly Annotation[] | undefined;
    const { container } = renderAt(
      fakeClient(async (_input, anns) => {
        captured = anns;
        return new Uint8Array([9]);
      }),
    );

    addPdf(container, makePdfFile("a.pdf", [1]));
    fireEvent.change(screen.getByLabelText("Origen de la firma"), {
      target: { value: "draw" },
    });
    const canvas = await screen.findByTestId("signature-pad-canvas");
    fireEvent.pointerDown(canvas, { clientX: 5, clientY: 5, pointerId: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Usar esta firma" }));

    const addBtn = screen.getByRole("button", { name: "Añadir firma" });
    await waitFor(() => expect(addBtn).not.toBeDisabled());
    fireEvent.click(addBtn);
    const signBtn = screen.getByRole("button", { name: "Firmar PDF" });
    await waitFor(() => expect(signBtn).not.toBeDisabled());
    fireEvent.click(signBtn);

    await waitFor(() => expect(captured).toBeDefined());
    const image = imageAnnotations(captured ?? [])[0];
    if (image.kind === "image") {
      expect(Array.from(image.data)).toEqual(Array.from(DRAWN_BYTES));
    }
  });
});

describe("SignPdf — varias firmas (R15)", () => {
  it("añadir dos veces produce dos entradas en la lista (reutilización)", async () => {
    const { container } = renderAt(fakeClient(async () => new Uint8Array([9])));

    addPdf(container, makePdfFile("a.pdf", [1]));
    addImage(container, makeImageFile("firma.png", [0x89, 0x50, 0x4e, 0x47]));
    const addBtn = screen.getByRole("button", { name: "Añadir firma" });
    await waitFor(() => expect(addBtn).not.toBeDisabled());

    fireEvent.click(addBtn);
    fireEvent.click(addBtn);

    const items = await screen.findAllByTestId("placed-signature-item");
    expect(items).toHaveLength(2);
  });
});

describe("SignPdf — seleccionar/mover/redimensionar/eliminar (R16, R17, R18, R19)", () => {
  it("clic selecciona; arrastre mueve; tirador redimensiona; eliminar la quita", async () => {
    mockRect();
    let captured: readonly Annotation[] | undefined;
    const { container } = renderAt(
      fakeClient(async (_input, anns) => {
        captured = anns;
        return new Uint8Array([9]);
      }),
    );

    addPdf(container, makePdfFile("a.pdf", [1]));
    addImage(container, makeImageFile("firma.png", [0x89, 0x50, 0x4e, 0x47]));
    const addBtn = screen.getByRole("button", { name: "Añadir firma" });
    await waitFor(() => expect(addBtn).not.toBeDisabled());
    fireEvent.click(addBtn);

    const overlay = await screen.findByTestId("signature-placement-overlay");

    // Caja por defecto pts PDF: x∈[40,190], y∈[40,115]. Clic px(50,120) → pdf(50,80).
    fireEvent.pointerDown(overlay, { clientX: 50, clientY: 120, pointerId: 1 });
    fireEvent.pointerUp(overlay, { clientX: 50, clientY: 120, pointerId: 1 });
    // Seleccionada: aparecen tiradores. (R16)
    expect(await screen.findByTestId("signature-handle-se")).toBeInTheDocument();

    // Mover el cuerpo px(50,120) → px(30,120): dx = -20 pts → x pasa a 20. (R17)
    fireEvent.pointerDown(overlay, { clientX: 50, clientY: 120, pointerId: 1 });
    fireEvent.pointerMove(overlay, { clientX: 30, clientY: 120, pointerId: 1 });
    fireEvent.pointerUp(overlay, { clientX: 30, clientY: 120, pointerId: 1 });

    // Redimensionar el tirador `se`: tras mover, se está en pts (170,40) → px(170,160).
    // Arrastrar a px(220,160) crece el ancho preservando el aspecto. (R18)
    fireEvent.pointerDown(overlay, { clientX: 170, clientY: 160, pointerId: 1 });
    fireEvent.pointerMove(overlay, { clientX: 220, clientY: 160, pointerId: 1 });
    fireEvent.pointerUp(overlay, { clientX: 220, clientY: 160, pointerId: 1 });

    // Firmar y comprobar la geometría resultante (move + resize).
    const signBtn = screen.getByRole("button", { name: "Firmar PDF" });
    await waitFor(() => expect(signBtn).not.toBeDisabled());
    fireEvent.click(signBtn);
    await waitFor(() => expect(captured).toBeDefined());
    const image = imageAnnotations(captured ?? [])[0];
    if (image.kind === "image") {
      expect(image.at.x).toBeCloseTo(20); // movida
      expect(image.width).toBeGreaterThan(150); // redimensionada (crecida)
      expect(image.width / image.height).toBeCloseTo(2); // aspecto preservado
    }

    // Eliminar la seleccionada: desaparece de la lista. (R19)
    fireEvent.click(
      screen.getByRole("button", { name: "Eliminar firma seleccionada" }),
    );
    await waitFor(() =>
      expect(screen.queryByTestId("placed-signature-item")).not.toBeInTheDocument(),
    );
  });
});

describe("SignPdf — anotaciones de toda la lista en una exportación (R12, R20, R22)", () => {
  it("2 firmas de cajas distintas y N páginas → varias image, una por firma y página", async () => {
    mockRect();
    let captured: readonly Annotation[] | undefined;
    const annotate = vi.fn(
      async (_input: Uint8Array, anns: readonly Annotation[]) => {
        captured = anns;
        return new Uint8Array([9]);
      },
    );
    const { container } = renderAt(fakeClient(annotate));

    addPdf(container, makePdfFile("a.pdf", [1, 2, 3]));
    addImage(container, makeImageFile("firma.png", [0x89, 0x50, 0x4e, 0x47]));
    const addBtn = screen.getByRole("button", { name: "Añadir firma" });
    await waitFor(() => expect(addBtn).not.toBeDisabled());

    // Firma 1 (auto-seleccionada). La movemos para que su caja difiera.
    fireEvent.click(addBtn);
    const overlay = await screen.findByTestId("signature-placement-overlay");
    // Mover el cuerpo px(50,120) → px(30,120): x pasa de 40 a 20.
    fireEvent.pointerDown(overlay, { clientX: 50, clientY: 120, pointerId: 1 });
    fireEvent.pointerMove(overlay, { clientX: 30, clientY: 120, pointerId: 1 });
    fireEvent.pointerUp(overlay, { clientX: 30, clientY: 120, pointerId: 1 });

    // Firma 2 (queda en la caja por defecto 40,40) y a TODAS las páginas.
    fireEvent.click(addBtn);
    const selectAll = await screen.findByRole("button", { name: "Todas" });
    fireEvent.click(selectAll);

    const signBtn = screen.getByRole("button", { name: "Firmar PDF" });
    await waitFor(() => expect(signBtn).not.toBeDisabled());
    fireEvent.click(signBtn);

    await waitFor(() => expect(annotate).toHaveBeenCalledTimes(1)); // (R22)
    const images = imageAnnotations(captured ?? []);
    // Firma 1: 1 página (movida). Firma 2: 3 páginas (40,40). Total 4.
    expect(images).toHaveLength(4);

    // Firma 2 aparece en cada página con at exacto (40,40), sin rejilla. (R12, R20)
    const atDefault = images.filter(
      (a) => a.kind === "image" && a.at.x === 40 && a.at.y === 40,
    );
    expect(
      atDefault.map((a) => a.pageIndex).sort((x, y) => x - y),
    ).toEqual([0, 1, 2]);
    // Firma 1 tiene una geometría distinta (movida a x=20) en la página 0.
    const moved = images.filter(
      (a) => a.kind === "image" && Math.abs(a.at.x - 20) < 1e-6,
    );
    expect(moved).toHaveLength(1);
    if (moved[0].kind === "image") {
      expect(moved[0].pageIndex).toBe(0);
    }
  });
});

describe("SignPdf — deshacer/rehacer de la lista de firmas (#37 R29, R33)", () => {
  it("añade una firma y la deshace/rehace con el botón (R29)", async () => {
    const { container } = renderAt(fakeClient(async () => new Uint8Array([9])));

    addPdf(container, makePdfFile("a.pdf", [1]));
    addImage(container, makeImageFile("firma.png", [0x89, 0x50, 0x4e, 0x47]));
    const addBtn = screen.getByRole("button", { name: "Añadir firma" });
    await waitFor(() => expect(addBtn).not.toBeDisabled());
    fireEvent.click(addBtn);

    expect(
      await screen.findByTestId("placed-signature-item"),
    ).toBeInTheDocument();

    const undo = await screen.findByRole("button", { name: "Deshacer" });
    fireEvent.click(undo);
    await waitFor(() =>
      expect(
        screen.queryByTestId("placed-signature-item"),
      ).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Rehacer" }));
    expect(
      await screen.findByTestId("placed-signature-item"),
    ).toBeInTheDocument();
  });

  it("cambiar de archivo limpia el historial (Deshacer deshabilitado) (R33)", async () => {
    const { container } = renderAt(fakeClient(async () => new Uint8Array([9])));

    addPdf(container, makePdfFile("a.pdf", [1]));
    addImage(container, makeImageFile("firma.png", [0x89, 0x50, 0x4e, 0x47]));
    const addBtn = screen.getByRole("button", { name: "Añadir firma" });
    await waitFor(() => expect(addBtn).not.toBeDisabled());
    fireEvent.click(addBtn);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Deshacer" })).toBeEnabled(),
    );

    addPdf(container, makePdfFile("b.pdf", [2]));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Deshacer" })).toBeDisabled(),
    );
    expect(
      screen.queryByTestId("placed-signature-item"),
    ).not.toBeInTheDocument();
  });
});

describe("SignPdf — descarga local y cero red (R23, R26)", () => {
  it("tras éxito Descargar usa un Blob local y no hay peticiones de red", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const openSpy = vi.spyOn(XMLHttpRequest.prototype, "open");
    const sendSpy = vi.spyOn(XMLHttpRequest.prototype, "send");

    const { container } = renderAt(
      fakeClient(async () => new Uint8Array([1, 2, 3])),
    );

    const signBtn = await loadPdfAndPlaceSignature(
      container,
      makePdfFile("a.pdf", [1]),
      makeImageFile("firma.png", [0x89, 0x50, 0x4e, 0x47]),
    );
    fireEvent.click(signBtn);

    const download = await screen.findByRole("button", {
      name: /descargar resultado/i,
    });
    fireEvent.click(download);

    expect(downloadBlob).toHaveBeenCalledTimes(1);
    const [blob, name] = vi.mocked(downloadBlob).mock.calls[0];
    expect(blob).toBeInstanceOf(Blob);
    expect(name).toBe("firmado.pdf");

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
    expect(sendSpy).not.toHaveBeenCalled();
  });
});

describe("SignPdf — botón deshabilitado (R24)", () => {
  it("deshabilitado sin PDF y con PDF pero lista de firmas vacía", async () => {
    const { container } = renderAt(fakeClient(async () => new Uint8Array([9])));
    const signBtn = screen.getByRole("button", { name: "Firmar PDF" });
    // Sin PDF.
    expect(signBtn).toBeDisabled();

    // Con PDF pero sin firmas colocadas (aunque haya firma activa subida).
    addPdf(container, makePdfFile("a.pdf", [1]));
    addImage(container, makeImageFile("firma.png", [0x89, 0x50, 0x4e, 0x47]));
    const addBtn = screen.getByRole("button", { name: "Añadir firma" });
    await waitFor(() => expect(addBtn).not.toBeDisabled());
    expect(signBtn).toBeDisabled();

    // Al añadir una firma → habilitado.
    fireEvent.click(addBtn);
    await waitFor(() => expect(signBtn).not.toBeDisabled());
  });
});

describe("SignPdf — error de dominio (R25)", () => {
  it("ante AnnotateFailedError muestra mensaje mapeado y no ofrece descarga", async () => {
    const { container } = renderAt(
      fakeClient(async () => {
        throw new AnnotateFailedError();
      }),
    );

    const signBtn = await loadPdfAndPlaceSignature(
      container,
      makePdfFile("a.pdf", [1]),
      makeImageFile("firma.png", [0x89, 0x50, 0x4e, 0x47]),
    );
    fireEvent.click(signBtn);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("No se pudo firmar el PDF");
    expect(
      screen.queryByRole("button", { name: /descargar resultado/i }),
    ).not.toBeInTheDocument();
  });
});

describe("SignPdf — aviso de firma visual (R21)", () => {
  it("muestra que la firma es visual y no una firma digital certificada", () => {
    renderAt(fakeClient(async () => new Uint8Array([1])));
    const notice = screen.getByText(/firma visual/i);
    expect(notice.textContent).toMatch(/no es una firma digital certificada/i);
  });
});

describe("SignPdf — enrutado unificado (R27, R28)", () => {
  it("navegar a /firmar-libre redirige a /firmar y renderiza la herramienta", () => {
    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={["/firmar-libre"]}>
          <App />
        </MemoryRouter>
      </ThemeProvider>,
    );
    const notice = screen.getByText(/firma visual/i);
    expect(notice.textContent).toMatch(/no es una firma digital certificada/i);
  });
});
