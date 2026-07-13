import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { downloadBlob } from "@/lib/download";
import type { Annotation } from "@/pdf/annotate";
import type {
  FieldFill,
  FillFormsOptions,
  FormModel,
} from "@/pdf/fillForms";
import type { PageCounter } from "@/pdf/pageCount";
import type { PageRasterizer, PageRasterizerFactory } from "@/pdf/rasterize";
import { FillForms, NO_FIELDS_NOTICE } from "@/routes/FillForms";
import type { PdfClient } from "@/workers/pdfClient";

beforeEach(() => {
  vi.mocked(downloadBlob).mockClear();
  URL.createObjectURL = vi.fn(() => "blob:mock") as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL;
  // jsdom no carga imágenes: simulamos dimensiones naturales para el onLoad de
  // LivePreview (necesario para que se monte la capa interactiva de campos).
  Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", {
    configurable: true,
    get: () => 300,
  });
  Object.defineProperty(HTMLImageElement.prototype, "naturalHeight", {
    configurable: true,
    get: () => 400,
  });
  // Tamaño del lienzo del editor de anotaciones (modo sin campos).
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
});

vi.mock("@/lib/download", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/download")>();
  return { ...actual, downloadBlob: vi.fn() };
});

interface MockRasterizer {
  factory: PageRasterizerFactory;
  renderedIndexes: number[];
}

function mockRasterizer(pageCount = 1): MockRasterizer {
  const renderedIndexes: number[] = [];
  const rasterizer: PageRasterizer = {
    pageCount: () => pageCount,
    renderPage: (index) => {
      renderedIndexes.push(index);
      return Promise.resolve(
        new Blob([new Uint8Array([1])], { type: "image/png" }),
      );
    },
    destroy: () => {},
  };
  return { factory: async () => rasterizer, renderedIndexes };
}

function fakeCounter(pages: number): PageCounter {
  return async () => pages;
}

function makePdfFile(bytes: number[]): File {
  return new File([new Uint8Array(bytes)], "form.pdf", {
    type: "application/pdf",
  });
}

function fileInputs(container: HTMLElement): HTMLInputElement[] {
  return Array.from(
    container.querySelectorAll('input[type="file"]'),
  ) as HTMLInputElement[];
}

function addPdf(container: HTMLElement, file: File): void {
  fireEvent.change(fileInputs(container)[0], { target: { files: [file] } });
}

/** Cliente falso: `detectForm`/`fillForms`/`annotate` inyectables o por defecto. */
function fakeClient(overrides: Partial<PdfClient> = {}): PdfClient {
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
    async annotate() {
      return new Uint8Array([9]);
    },
    async detectForm() {
      return { hasFields: false, fields: [] };
    },
    async fillForms() {
      return new Uint8Array([9]);
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
    ...overrides,
  };
}

function renderAt(
  client: PdfClient,
  raster: MockRasterizer = mockRasterizer(),
) {
  return render(
    <MemoryRouter initialEntries={["/rellenar-formularios"]}>
      <Routes>
        <Route
          path="/rellenar-formularios"
          element={
            <FillForms
              client={client}
              createRasterizer={raster.factory}
              countPages={fakeCounter(2)}
              createId={() => "fixed-id"}
            />
          }
        />
        <Route path="/anotar" element={<div>Ruta anotar</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const TEXT_MODEL: FormModel = {
  hasFields: true,
  fields: [{ name: "nombre", type: "text", value: "" }],
};

/** Modelo con widgets: `nombre` en la página 0, `firma` en la página 1. */
const WIDGET_MODEL: FormModel = {
  hasFields: true,
  fields: [
    {
      name: "nombre",
      type: "text",
      value: "",
      widgets: [{ pageIndex: 0, rect: { x: 20, y: 350, width: 200, height: 20 } }],
    },
    {
      name: "firma",
      type: "text",
      value: "",
      widgets: [{ pageIndex: 1, rect: { x: 10, y: 100, width: 80, height: 20 } }],
    },
  ],
};

describe("FillForms — con campos: rellenado y aplanado (R19, R20, R22, R23)", () => {
  it("rellena vía fillForms y descarga los bytes localmente (R19, R22, R23)", async () => {
    let capturedInput: Uint8Array | undefined;
    let capturedOptions: FillFormsOptions | undefined;
    const client = fakeClient({
      async detectForm() {
        return TEXT_MODEL;
      },
      async fillForms(input, options) {
        capturedInput = input;
        capturedOptions = options;
        return new Uint8Array([1, 2, 3]);
      },
    });
    const { container } = renderAt(client);

    addPdf(container, makePdfFile([10, 20, 30]));

    const input = await screen.findByLabelText("nombre");
    fireEvent.change(input, { target: { value: "Ada" } });

    fireEvent.click(
      screen.getByRole("button", { name: "Rellenar y descargar" }),
    );

    await waitFor(() => expect(capturedInput).toBeDefined());
    expect(capturedInput && Array.from(capturedInput)).toEqual([10, 20, 30]);
    const fills = capturedOptions?.fills as FieldFill[];
    expect(fills).toEqual([{ name: "nombre", kind: "text", value: "Ada" }]);

    // Flujo click-driven (#39 R11, R16): la descarga la dispara el botón guiado
    // del estado `done`, no una descarga automática.
    const downloadBtn = await screen.findByRole("button", {
      name: "⇩ Descargar documento",
    });
    expect(downloadBtn).toHaveClass("download-cta");
    expect(downloadBlob).not.toHaveBeenCalled();
    fireEvent.click(downloadBtn);

    expect(downloadBlob).toHaveBeenCalledTimes(1);
    const [blob, name] = vi.mocked(downloadBlob).mock.calls[0];
    expect(blob).toBeInstanceOf(Blob);
    expect(name).toBe("formulario-relleno.pdf");
  });

  it("propaga el toggle de aplanar a fillForms (R20)", async () => {
    let capturedOptions: FillFormsOptions | undefined;
    const client = fakeClient({
      async detectForm() {
        return TEXT_MODEL;
      },
      async fillForms(_input, options) {
        capturedOptions = options;
        return new Uint8Array([1]);
      },
    });
    const { container } = renderAt(client);

    addPdf(container, makePdfFile([1]));
    await screen.findByLabelText("nombre");

    fireEvent.click(screen.getByLabelText(/Aplanar el formulario/i));
    fireEvent.click(
      screen.getByRole("button", { name: "Rellenar y descargar" }),
    );

    await waitFor(() => expect(capturedOptions).toBeDefined());
    expect(capturedOptions?.flatten).toBe(true);
  });
});

describe("FillForms — overlay visual de campos (R8, R11, R12)", () => {
  it("dibuja marcadores sobre la vista previa y el clic enfoca el editor (R8, R11)", async () => {
    const client = fakeClient({
      async detectForm() {
        return WIDGET_MODEL;
      },
    });
    const { container } = renderAt(client, mockRasterizer(2));

    addPdf(container, makePdfFile([1, 2, 3]));

    const img = await screen.findByRole("img");
    fireEvent.load(img); // fija el pageSize real → se monta el overlay

    const marker = await screen.findByLabelText("Campo nombre"); // (R8)
    fireEvent.click(marker); // (R11)

    // El clic enfoca el input del campo…
    expect(await screen.findByLabelText("nombre")).toHaveFocus();
  });

  it("enfocar el editor de un campo destaca su marcador (R12)", async () => {
    const client = fakeClient({
      async detectForm() {
        return WIDGET_MODEL;
      },
    });
    const { container } = renderAt(client, mockRasterizer(2));

    addPdf(container, makePdfFile([1, 2, 3]));

    const img = await screen.findByRole("img");
    fireEvent.load(img);

    await screen.findByLabelText("Campo nombre");
    fireEvent.focus(screen.getByLabelText("nombre")); // (R12)

    await waitFor(() =>
      expect(screen.getByLabelText("Campo nombre")).toHaveAttribute(
        "aria-current",
        "true",
      ),
    );
  });
});

describe("FillForms — salto de página al enfocar (R13)", () => {
  it("enfocar un campo con widget en otra página cambia la vista previa (R13)", async () => {
    const client = fakeClient({
      async detectForm() {
        return WIDGET_MODEL;
      },
    });
    const raster = mockRasterizer(2);
    const { container } = renderAt(client, raster);

    addPdf(container, makePdfFile([1, 2, 3]));

    const img = await screen.findByRole("img");
    fireEvent.load(img);
    await screen.findByLabelText("Campo nombre");

    // `firma` tiene su widget en la página 1; enfocarlo salta la vista previa.
    fireEvent.focus(screen.getByLabelText("firma"));

    // El rasterizador recibe el índice de la nueva página (1).
    await waitFor(() => expect(raster.renderedIndexes).toContain(1));
    // …y el marcador de `firma` (página 1) aparece.
    expect(await screen.findByLabelText("Campo firma")).toBeInTheDocument();
  });
});

describe("FillForms — sin campos: editor de anotaciones inline (R14, R15, R18)", () => {
  it("muestra el aviso y el editor inline, sin enlazar a /anotar (R14, R15, R18)", async () => {
    const client = fakeClient({
      async detectForm() {
        return { hasFields: false, fields: [] };
      },
    });
    const { container } = renderAt(client);

    addPdf(container, makePdfFile([1, 2]));

    expect(await screen.findByText(NO_FIELDS_NOTICE)).toBeInTheDocument(); // (R18)
    // El editor de anotaciones rico se monta inline (R14, R15).
    expect(
      await screen.findByRole("region", { name: /editor de anotaciones/i }),
    ).toBeInTheDocument();
    // Ya NO existe el enlace a la ruta /anotar.
    expect(
      screen.queryByRole("link", { name: /añadir texto/i }),
    ).not.toBeInTheDocument();
  });
});

describe("FillForms — sin campos: exportar por annotate (R16, R17, R22, R23)", () => {
  it("el botón está deshabilitado sin anotaciones (R17)", async () => {
    const client = fakeClient({
      async detectForm() {
        return { hasFields: false, fields: [] };
      },
    });
    const { container } = renderAt(client);

    addPdf(container, makePdfFile([1, 2]));

    const button = await screen.findByRole("button", {
      name: "Añadir texto encima y descargar",
    });
    expect(button).toBeDisabled(); // (R17)
  });

  it("tras añadir texto, exportar invoca annotate y descarga local (R16, R22, R23)", async () => {
    let capturedInput: Uint8Array | undefined;
    let capturedAnnotations: readonly Annotation[] | undefined;
    const client = fakeClient({
      async detectForm() {
        return { hasFields: false, fields: [] };
      },
      async annotate(input, anns) {
        capturedInput = input;
        capturedAnnotations = anns;
        return new Uint8Array([7]);
      },
    });
    const { container } = renderAt(client);

    addPdf(container, makePdfFile([4, 5, 6]));

    // Flujo real del editor #29: herramienta texto → clic lienzo → escribir → añadir.
    const textTool = await screen.findByRole("button", { name: "Texto" });
    fireEvent.click(textTool);
    const overlay = await screen.findByTestId("annotation-overlay");
    fireEvent.click(overlay, { clientX: 20, clientY: 30 });
    const textInput = await screen.findByTestId("annotation-text-input");
    fireEvent.change(textInput, { target: { value: "Encima" } });
    fireEvent.click(screen.getByRole("button", { name: "Añadir" }));

    fireEvent.click(
      screen.getByRole("button", { name: "Añadir texto encima y descargar" }),
    );

    await waitFor(() => expect(capturedInput).toBeDefined());
    expect(capturedInput && Array.from(capturedInput)).toEqual([4, 5, 6]); // (R22)
    expect(capturedAnnotations).toHaveLength(1);
    expect(capturedAnnotations?.[0].kind).toBe("text"); // (R16)

    // Click-driven (#39 R11, R16): descarga al pulsar el botón guiado. (R23)
    const downloadBtn = await screen.findByRole("button", {
      name: "⇩ Descargar documento",
    });
    expect(downloadBlob).not.toHaveBeenCalled();
    fireEvent.click(downloadBtn);
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(1));
    const [blob, name] = vi.mocked(downloadBlob).mock.calls[0];
    expect(blob).toBeInstanceOf(Blob);
    expect(name).toBe("documento-anotado.pdf");
  });
});

describe("FillForms — anuncio accesible y copy en `done` (#39 R15, R16)", () => {
  it("anuncia el resultado con role=status y copy 'listo para descargar' sin robar foco", async () => {
    const client = fakeClient({
      async detectForm() {
        return TEXT_MODEL;
      },
      async fillForms() {
        return new Uint8Array([1, 2, 3]);
      },
    });
    const { container } = renderAt(client);

    addPdf(container, makePdfFile([10, 20, 30]));
    await screen.findByLabelText("nombre");
    fireEvent.click(
      screen.getByRole("button", { name: "Rellenar y descargar" }),
    );

    const status = await screen.findByRole("status"); // (R15)
    expect(status.textContent).toMatch(/descárgalo abajo/i); // (R16)
    expect(status.textContent).not.toMatch(/se ha\s+descargado/i); // (R16)
    const downloadBtn = screen.getByRole("button", {
      name: "⇩ Descargar documento",
    });
    expect(document.activeElement).not.toBe(downloadBtn); // no roba foco (R5)
  });
});

describe("FillForms — deshacer/rehacer de la capa de anotación (#37 R28, R33)", () => {
  // La capa versionada por el historial es la de ANOTACIONES del modo SIN
  // campos; los campos AcroForm usan el undo NATIVO del input (R20), no este
  // historial. Estos tests operan sobre un PDF sin campos.
  async function addNoFieldAnnotation(text: string): Promise<void> {
    const textTool = await screen.findByRole("button", { name: "Texto" });
    fireEvent.click(textTool);
    const overlay = await screen.findByTestId("annotation-overlay");
    fireEvent.click(overlay, { clientX: 20, clientY: 30 });
    const textInput = await screen.findByTestId("annotation-text-input");
    fireEvent.change(textInput, { target: { value: text } });
    fireEvent.click(screen.getByRole("button", { name: "Añadir" }));
  }

  it("añade una anotación y la deshace/rehace con el botón (R28)", async () => {
    const client = fakeClient({
      async detectForm() {
        return { hasFields: false, fields: [] };
      },
    });
    const { container } = renderAt(client);

    addPdf(container, makePdfFile([1, 2]));
    await addNoFieldAnnotation("Nota");
    expect(screen.getByTestId("annotation-text")).toHaveTextContent("Nota");

    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }));
    expect(screen.queryByTestId("annotation-text")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Rehacer" }));
    expect(screen.getByTestId("annotation-text")).toHaveTextContent("Nota");
  });

  it("cambiar de archivo limpia el historial de anotaciones (R33)", async () => {
    const client = fakeClient({
      async detectForm() {
        return { hasFields: false, fields: [] };
      },
    });
    const { container } = renderAt(client);

    addPdf(container, makePdfFile([1, 2]));
    await addNoFieldAnnotation("Vieja");
    expect(screen.getByRole("button", { name: "Deshacer" })).toBeEnabled();

    addPdf(container, makePdfFile([7, 8]));
    await screen.findByTestId("annotation-overlay");
    expect(screen.getByRole("button", { name: "Deshacer" })).toBeDisabled();
    expect(screen.queryByTestId("annotation-text")).not.toBeInTheDocument();
  });
});

describe("FillForms — previsualización (R10)", () => {
  it("previsualiza el PDF cargado con LivePreview (R10)", async () => {
    const client = fakeClient({
      async detectForm() {
        return TEXT_MODEL;
      },
    });
    const { container } = renderAt(client);

    addPdf(container, makePdfFile([1, 2, 3]));

    expect(
      await screen.findByRole("region", { name: /vista previa/i }),
    ).toBeInTheDocument();
  });
});
