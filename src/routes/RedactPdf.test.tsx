import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { downloadBlob } from "@/lib/download";
import type { TextGeometryExtractor } from "@/lib/pdfjsTextExtractor";
import type { RedactedPageImage } from "@/pdf/redact";
import type { PageRasterizer, PageRasterizerFactory } from "@/pdf/rasterize";
import {
  IMAGE_CONVERSION_WARNING,
  NO_MATCHES_MESSAGE,
  RedactPdf,
} from "@/routes/RedactPdf";
import type { PdfClient } from "@/workers/pdfClient";

vi.mock("@/lib/download", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/download")>();
  return { ...actual, downloadBlob: vi.fn() };
});

/** Bytes PNG que devuelve el canvas falso tras redactar. */
const OUT_PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:mock") as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL;

  // Rect determinista del overlay: 100×200 px, origen (0,0).
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

  // Image que se "carga" de inmediato (usada por rasterizeRedactedPage).
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = 200;
    naturalHeight = 400;
    width = 200;
    height = 400;
    set src(_value: string) {
      queueMicrotask(() => this.onload?.());
    }
  }
  vi.stubGlobal("Image", FakeImage);

  // Canvas falso: getContext devuelve un contexto inerte y toBlob entrega OUT_PNG.
  const realCreate = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    if (tag === "canvas") {
      return {
        width: 0,
        height: 0,
        getContext: () => ({
          globalAlpha: 1,
          fillStyle: "",
          drawImage: vi.fn(),
          fillRect: vi.fn(),
        }),
        toBlob: (cb: BlobCallback) => {
          cb(new Blob([OUT_PNG], { type: "image/png" }));
        },
      } as unknown as HTMLElement;
    }
    return realCreate(tag);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function makePdfFile(): File {
  return new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "a.pdf", {
    type: "application/pdf",
  });
}

function fileInputs(container: HTMLElement): HTMLInputElement[] {
  return Array.from(
    container.querySelectorAll('input[type="file"]'),
  ) as HTMLInputElement[];
}

function addPdf(container: HTMLElement): void {
  fireEvent.change(fileInputs(container)[0], {
    target: { files: [makePdfFile()] },
  });
}

/** Rasterizador falso que registra qué páginas se rasterizan. */
function fakeRasterizer(pageCount: number): {
  factory: PageRasterizerFactory;
  rendered: number[];
} {
  const rendered: number[] = [];
  const rasterizer: PageRasterizer = {
    pageCount: () => pageCount,
    renderPage: (index) => {
      rendered.push(index);
      return Promise.resolve(
        new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
      );
    },
    destroy: () => {},
  };
  return { factory: async () => rasterizer, rendered };
}

/** Cliente falso que captura la llamada a redact. */
function fakeClient(redact: PdfClient["redact"]): PdfClient {
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
    redact,
    dispose() {
      // no-op
    },
  };
}

interface RenderOpts {
  extractText?: TextGeometryExtractor;
  createId?: () => string;
}

function renderRedact(
  client: PdfClient,
  factory: PageRasterizerFactory,
  opts?: RenderOpts,
): { container: HTMLElement } {
  const { container } = render(
    <MemoryRouter initialEntries={["/redactar"]}>
      <Routes>
        <Route
          path="/redactar"
          element={
            <RedactPdf
              client={client}
              createRasterizer={factory}
              extractText={opts?.extractText}
              createId={opts?.createId}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );
  return { container };
}

/** Ids deterministas y únicos para los tests que crean varias cajas. */
function seqId(): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `box-${String(n)}`;
  };
}

/**
 * Geometría de texto determinista para la búsqueda: página 0 de 200×300 pts con
 * `count` ítems "SECRETO" (baseline 20,150; 90×18 pts). `findMatches("SECRETO")`
 * deriva por ítem la caja [0.1, 0.44, 0.45, 0.06] en coords normalizadas.
 */
function fakeExtractText(count: number): TextGeometryExtractor {
  const items = Array.from({ length: count }, () => ({
    str: "SECRETO",
    xPts: 20,
    yPts: 150,
    widthPts: 90,
    heightPts: 18,
  }));
  return async () => [
    { pageIndex: 0, pageWidthPts: 200, pageHeightPts: 300, items },
  ];
}

/** Escribe `term` en el buscador y pulsa "Buscar". Requiere PDF ya cargado. */
async function runSearch(term: string): Promise<void> {
  const input = await screen.findByLabelText("Buscar texto para tachar");
  fireEvent.change(input, { target: { value: term } });
  fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
}

/** Dibuja una caja arrastrando de (20,40) a (60,120) sobre el overlay. */
async function drawBox(container: HTMLElement): Promise<void> {
  addPdf(container);
  const overlay = await screen.findByTestId("redaction-overlay");
  fireEvent.mouseDown(overlay, { clientX: 20, clientY: 40 });
  fireEvent.mouseMove(overlay, { clientX: 60, clientY: 120 });
  fireEvent.mouseUp(overlay, { clientX: 60, clientY: 120 });
}

describe("RedactPdf — estructura y aviso (R8)", () => {
  it("monta la página en /redactar con su título", () => {
    renderRedact(
      fakeClient(async () => new Uint8Array()),
      fakeRasterizer(2).factory,
    );
    expect(
      screen.getByRole("heading", { name: "Redactar PDF" }),
    ).toBeInTheDocument();
  });

  it("muestra el aviso de conversión a imagen (R8)", () => {
    renderRedact(
      fakeClient(async () => new Uint8Array()),
      fakeRasterizer(2).factory,
    );
    expect(screen.getByText(IMAGE_CONVERSION_WARNING)).toBeInTheDocument();
    expect(
      screen.getByText(/se convertirán en imagen/i),
    ).toBeInTheDocument();
  });
});

describe("RedactPdf — dibujar cajas (R1, R2)", () => {
  it("arrastrar sobre el preview añade una caja a la lista de la página y un overlay opaco", async () => {
    const { container } = renderRedact(
      fakeClient(async () => new Uint8Array()),
      fakeRasterizer(2).factory,
    );
    await drawBox(container);

    // La caja aparece en la lista de la página activa. (R1)
    const box = await screen.findByTestId("redaction-box");
    expect(screen.getByText(/Cajas en esta página:/).textContent).toContain(
      "Cajas en esta página: 1",
    );
    // Y se renderiza como overlay opaco. (R2)
    expect(box).toBeInTheDocument();
    expect(box).toHaveClass("bg-black");
    expect(box.style.opacity).toBe("1");
    // Posicionada según la caja normalizada (20/100, 40/200, 40/100, 80/200).
    expect(box.style.left).toBe("20%");
    expect(box.style.top).toBe("20%");
    expect(box.style.width).toBe("40%");
    expect(box.style.height).toBe("40%");
  });
});

describe("RedactPdf — exportar (R7, R9, R10)", () => {
  it("rasteriza solo la página con cajas, llama client.redact con esa página y descarga sin red", async () => {
    let capturedInput: Uint8Array | undefined;
    let capturedPages: readonly RedactedPageImage[] | undefined;
    const client = fakeClient(async (input, redactedPages) => {
      capturedInput = input;
      capturedPages = redactedPages;
      return new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    });
    const raster = fakeRasterizer(3);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { container } = renderRedact(client, raster.factory);
    await drawBox(container);

    fireEvent.click(
      screen.getByRole("button", { name: "Redactar y descargar" }),
    );

    await waitFor(() => {
      expect(capturedPages).toBeDefined();
    });

    // Solo se redacta la página con cajas (la 0). (R7)
    expect(capturedPages).toHaveLength(1);
    expect(capturedPages?.[0].pageIndex).toBe(0);
    expect(capturedInput).toBeInstanceOf(Uint8Array);
    // renderPage nunca se invocó para páginas sin cajas (1, 2). (R7)
    expect(raster.rendered).not.toContain(1);
    expect(raster.rendered).not.toContain(2);
    expect(raster.rendered).toContain(0);

    // Descarga local (Blob) sin ninguna petición de red. (R10)
    await waitFor(() => {
      expect(downloadBlob).toHaveBeenCalledTimes(1);
    });
    expect(vi.mocked(downloadBlob).mock.calls[0][1]).toBe("redactado.pdf");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("RedactPdf — buscar y marcar (T18: R1, R2, R7, R8)", () => {
  it("buscar un término conocido lista sus coincidencias con su página", async () => {
    const { container } = renderRedact(
      fakeClient(async () => new Uint8Array()),
      fakeRasterizer(1).factory,
      { extractText: fakeExtractText(2) },
    );
    addPdf(container);
    await runSearch("SECRETO");

    // Una coincidencia por ítem, con su página (0 → "Pág. 1"). (R1)
    const items = await screen.findAllByTestId("match-item");
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain("Pág. 1");
    expect(items[0].textContent).toContain("SECRETO");
  });

  it("'Marcar' añade UNA caja en la posición derivada de la geometría real", async () => {
    const { container } = renderRedact(
      fakeClient(async () => new Uint8Array()),
      fakeRasterizer(1).factory,
      { extractText: fakeExtractText(1), createId: seqId() },
    );
    addPdf(container);
    await runSearch("SECRETO");

    fireEvent.click(await screen.findByRole("button", { name: "Marcar" }));

    // La caja se añade a la página activa. (R7)
    expect(screen.getByText(/Cajas en esta página:/).textContent).toContain(
      "Cajas en esta página: 1",
    );
    // Posición derivada de la geometría real del texto, NO tamaño fijo. (R2)
    // left 20/200=10%; top (300-(150+18))/300=44%; width 90/200=45%; height 18/300=6%.
    const box = await screen.findByTestId("redaction-box");
    expect(box.style.left).toBe("10%");
    expect(box.style.top).toBe("44%");
    expect(box.style.width).toBe("45%");
    expect(box.style.height).toBe("6%");
  });

  it("'Marcar todas' añade la caja de cada coincidencia (R8)", async () => {
    const { container } = renderRedact(
      fakeClient(async () => new Uint8Array()),
      fakeRasterizer(1).factory,
      { extractText: fakeExtractText(3), createId: seqId() },
    );
    addPdf(container);
    await runSearch("SECRETO");

    fireEvent.click(
      await screen.findByRole("button", { name: /Marcar todas \(3\)/ }),
    );

    expect(screen.getByText(/Cajas en esta página:/).textContent).toContain(
      "Cajas en esta página: 3",
    );
    expect(screen.getAllByTestId("redaction-box")).toHaveLength(3);
  });

  it("sin coincidencias muestra el mensaje en la UI y NO añade ninguna caja (R6)", async () => {
    // Geometría real pero SIN el término buscado → findMatches devuelve [].
    const extractText: TextGeometryExtractor = async () => [
      {
        pageIndex: 0,
        pageWidthPts: 200,
        pageHeightPts: 300,
        items: [
          { str: "INTACTO", xPts: 20, yPts: 150, widthPts: 90, heightPts: 18 },
        ],
      },
    ];
    const { container } = renderRedact(
      fakeClient(async () => new Uint8Array()),
      fakeRasterizer(1).factory,
      { extractText },
    );
    addPdf(container);
    await runSearch("SECRETO");

    // Se INDICA en la UI que no hubo coincidencias. (R6)
    expect(await screen.findByText(NO_MATCHES_MESSAGE)).toBeInTheDocument();
    // Y no se añadió ninguna caja al conjunto. (R6)
    expect(screen.queryByTestId("match-item")).not.toBeInTheDocument();
    expect(screen.queryByTestId("redaction-box")).not.toBeInTheDocument();
    expect(screen.getByText(/Cajas en esta página:/).textContent).toContain(
      "Cajas en esta página: 0",
    );
  });
});

describe("RedactPdf — editar cajas (T19: R13, R14, R17)", () => {
  it("mover una caja seleccionada refleja su nueva posición (R13)", async () => {
    const { container } = renderRedact(
      fakeClient(async () => new Uint8Array()),
      fakeRasterizer(2).factory,
      { createId: seqId() },
    );
    // Dibuja una caja norm (0.2,0.2,0.4,0.4): abarca x[0.2,0.6] y[0.2,0.6].
    await drawBox(container);
    const overlay = await screen.findByTestId("redaction-overlay");

    // mousedown dentro de la caja (30,60)→(0.3,0.3) inicia el traslado (R12);
    // arrastrar a (50,100)→(0.5,0.5) desplaza (dx,dy)=(0.2,0.2).
    fireEvent.mouseDown(overlay, { clientX: 30, clientY: 60 });
    fireEvent.mouseMove(overlay, { clientX: 50, clientY: 100 });
    fireEvent.mouseUp(overlay, { clientX: 50, clientY: 100 });

    const box = await screen.findByTestId("redaction-box");
    // left 0.2+0.2=0.4 → 40%; top igual. Tamaño intacto (40%×40%).
    expect(box.style.left).toBe("40%");
    expect(box.style.top).toBe("40%");
    expect(box.style.width).toBe("40%");
    expect(box.style.height).toBe("40%");
  });

  it("redimensionar por el tirador 'se' mantiene la esquina opuesta fija (R14)", async () => {
    const { container } = renderRedact(
      fakeClient(async () => new Uint8Array()),
      fakeRasterizer(2).factory,
      { createId: seqId() },
    );
    // Caja norm (0.2,0.2,0.4,0.4); al dibujarla queda SELECCIONADA → hay tiradores.
    await drawBox(container);
    const overlay = await screen.findByTestId("redaction-overlay");

    // Arrastra el tirador 'se' hasta (80,160)→(0.8,0.8); esquina fija nw=(0.2,0.2).
    const handle = await screen.findByTestId("redaction-handle-se");
    fireEvent.mouseDown(handle, { clientX: 60, clientY: 120 });
    fireEvent.mouseMove(overlay, { clientX: 80, clientY: 160 });
    fireEvent.mouseUp(overlay, { clientX: 80, clientY: 160 });

    const box = await screen.findByTestId("redaction-box");
    // left/top fijos en 20%; ancho/alto crecen a 0.8-0.2=0.6 → 60% (con
    // tolerancia por la resta en coma flotante 0.8-0.2).
    expect(box.style.left).toBe("20%");
    expect(box.style.top).toBe("20%");
    expect(parseFloat(box.style.width)).toBeCloseTo(60, 6);
    expect(parseFloat(box.style.height)).toBeCloseTo(60, 6);
  });

  it("'Quitar' elimina la caja del conjunto (R17)", async () => {
    const { container } = renderRedact(
      fakeClient(async () => new Uint8Array()),
      fakeRasterizer(2).factory,
      { createId: seqId() },
    );
    await drawBox(container);
    expect(await screen.findByTestId("redaction-box")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Quitar" }));

    expect(screen.getByText(/Cajas en esta página:/).textContent).toContain(
      "Cajas en esta página: 0",
    );
    expect(screen.queryByTestId("redaction-box")).not.toBeInTheDocument();
  });
});

describe("RedactPdf — exportar tras búsqueda (T20: R19, R20, R23, R24)", () => {
  it("exporta la página marcada por búsqueda por el pipeline de #27 y descarga sin red", async () => {
    let capturedInput: Uint8Array | undefined;
    let capturedPages: readonly RedactedPageImage[] | undefined;
    // Espía DIRECTO del ensamblado en worker (client.redact). (R23)
    const client = fakeClient(async (input, redactedPages) => {
      capturedInput = input;
      capturedPages = redactedPages;
      return new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    });
    const raster = fakeRasterizer(3);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { container } = renderRedact(client, raster.factory, {
      extractText: fakeExtractText(1),
      createId: seqId(),
    });
    addPdf(container);
    await runSearch("SECRETO");
    fireEvent.click(await screen.findByRole("button", { name: "Marcar" }));

    fireEvent.click(
      screen.getByRole("button", { name: "Redactar y descargar" }),
    );

    await waitFor(() => {
      expect(capturedPages).toBeDefined();
    });

    // Solo la página con la caja de BÚSQUEDA (la 0) se rasteriza y entra en el
    // pipeline seguro de #27, SIN ramas nuevas. (R19)
    expect(capturedPages).toHaveLength(1);
    expect(capturedPages?.[0].pageIndex).toBe(0);
    expect(capturedInput).toBeInstanceOf(Uint8Array);
    expect(raster.rendered).toContain(0);
    expect(raster.rendered).not.toContain(1);
    expect(raster.rendered).not.toContain(2);

    // Descarga local (Blob) sin ninguna petición de red. (R24)
    await waitFor(() => {
      expect(downloadBlob).toHaveBeenCalledTimes(1);
    });
    expect(vi.mocked(downloadBlob).mock.calls[0][1]).toBe("redactado.pdf");
    expect(fetchSpy).not.toHaveBeenCalled();

    // NOTA (observación 2 del critic, R20): la destrucción REAL del texto de la
    // página rasterizada se prueba por round-trip en `redactSearch.security.test.ts`
    // y a nivel de pipeline en `redact.test.ts` de #27. Aquí el entorno jsdom usa
    // canvas/Image/worker FALSOS (no producen un PDF real), por lo que un
    // round-trip determinista no es factible; la aserción es por PROXY: la caja de
    // búsqueda entra en el MISMO `rasterizeRedactedPage`+`client.redact` que aquel
    // test demuestra que elimina el texto.
  });
});
