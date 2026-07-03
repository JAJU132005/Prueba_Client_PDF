import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// El fuente del componente se lee como texto vía `?raw` de Vite (sin `node:fs`),
// para verificar estáticamente qué módulos importa (R23b) corriendo en jsdom.
import livePreviewSource from "@/components/LivePreview.tsx?raw";
import { LivePreview, PREVIEW_DEBOUNCE_MS } from "@/components/LivePreview";
import type { PreviewOverlay } from "@/pdf/previewModel";
import type {
  PageRasterizer,
  PageRasterizerFactory,
  RasterizeOptions,
} from "@/pdf/rasterize";
import { InvalidPdfError } from "@/pdf/types";

interface MockRasterizer {
  factory: PageRasterizerFactory;
  renderedIndexes: number[];
  signals: AbortSignal[];
  options: RasterizeOptions[];
  destroyCalls: () => number;
}

interface MockOptions {
  pageCount?: number;
  reject?: boolean;
  neverResolve?: boolean;
}

function createMockRasterizer(opts: MockOptions = {}): MockRasterizer {
  const { pageCount = 3, reject = false, neverResolve = false } = opts;
  const renderedIndexes: number[] = [];
  const signals: AbortSignal[] = [];
  const options: RasterizeOptions[] = [];
  let destroyCount = 0;

  const rasterizer: PageRasterizer = {
    pageCount: () => pageCount,
    renderPage: (index, renderOptions, signal) => {
      renderedIndexes.push(index);
      signals.push(signal);
      options.push(renderOptions);
      if (neverResolve) {
        return new Promise<Blob>(() => {});
      }
      return Promise.resolve(
        new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
      );
    },
    destroy: () => {
      destroyCount += 1;
    },
  };

  const factory: PageRasterizerFactory = async () => {
    if (reject) {
      throw new InvalidPdfError();
    }
    return rasterizer;
  };

  return {
    factory,
    renderedIndexes,
    signals,
    options,
    destroyCalls: () => destroyCount,
  };
}

function makePdfFile(name = "doc.pdf"): File {
  const bytes = new Uint8Array([37, 80, 68, 70]);
  const file = new File([bytes], name, { type: "application/pdf" });
  // `arrayBuffer` resuelto en un microtask (sin FileReader), determinista bajo
  // `vi.useFakeTimers()`: el polyfill de jsdom con FileReader no avanza con los
  // timers falsos y dejaría la carga del documento sin resolver.
  file.arrayBuffer = (): Promise<ArrayBuffer> =>
    Promise.resolve(bytes.buffer.slice(0));
  return file;
}

function textOverlay(text: string): PreviewOverlay {
  return {
    x: 10,
    y: 20,
    width: 100,
    height: 12,
    opacity: 1,
    rotationDegrees: 0,
    content: { kind: "text", text, fontSize: 12 },
  };
}

const created: string[] = [];
const revoked: string[] = [];

beforeEach(() => {
  created.length = 0;
  revoked.length = 0;
  let counter = 0;
  URL.createObjectURL = vi.fn(() => {
    const url = `blob:mock-${counter++}`;
    created.push(url);
    return url;
  }) as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn((url: string) => {
    revoked.push(url);
  }) as unknown as typeof URL.revokeObjectURL;
  // jsdom no carga imágenes: simulamos dimensiones naturales para el onLoad.
  Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", {
    configurable: true,
    get: () => 612,
  });
  Object.defineProperty(HTMLImageElement.prototype, "naturalHeight", {
    configurable: true,
    get: () => 792,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("LivePreview — render de la página (R13, R15, R23a)", () => {
  it("monta con un PDF válido y muestra la página de pageIndex (R13)", async () => {
    const mock = createMockRasterizer({ pageCount: 5 });
    render(
      <LivePreview
        file={makePdfFile()}
        pageIndex={2}
        overlays={[]}
        createRasterizer={mock.factory}
      />,
    );
    expect(await screen.findByRole("img")).toBeInTheDocument();
    await waitFor(() => expect(mock.renderedIndexes).toContain(2));
  });

  it("rasteriza ÚNICAMENTE la página pageIndex y ninguna otra (R15)", async () => {
    const mock = createMockRasterizer({ pageCount: 5 });
    render(
      <LivePreview
        file={makePdfFile()}
        pageIndex={3}
        overlays={[]}
        createRasterizer={mock.factory}
      />,
    );
    await screen.findByRole("img");
    expect(mock.renderedIndexes).toEqual([3]);
  });

  it("usa el rasterizador recibido por props (R23a)", async () => {
    const mock = createMockRasterizer();
    render(
      <LivePreview
        file={makePdfFile()}
        pageIndex={0}
        overlays={[]}
        createRasterizer={mock.factory}
      />,
    );
    await screen.findByRole("img");
    expect(mock.renderedIndexes.length).toBeGreaterThan(0);
  });
});

describe("LivePreview — overlays (R14)", () => {
  it("al cambiar overlays se re-posicionan sin re-rasterizar la página (R14)", async () => {
    const mock = createMockRasterizer();
    // Mismo `File` en ambos renders: solo cambian los overlays (si cambiara la
    // identidad del archivo se recargaría y re-rasterizaría el documento).
    const file = makePdfFile();
    const { rerender } = render(
      <LivePreview
        file={file}
        pageIndex={0}
        overlays={[textOverlay("A")]}
        createRasterizer={mock.factory}
      />,
    );
    const img = await screen.findByRole("img");
    fireEvent.load(img); // fija pageSize desde el tamaño natural simulado

    await waitFor(() =>
      expect(screen.getByText("A")).toBeInTheDocument(),
    );
    const rendersBefore = mock.renderedIndexes.length;

    rerender(
      <LivePreview
        file={file}
        pageIndex={0}
        overlays={[textOverlay("B")]}
        createRasterizer={mock.factory}
      />,
    );

    // El overlay refleja el nuevo valor…
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.queryByText("A")).not.toBeInTheDocument();
    // …y no se ha vuelto a rasterizar la página.
    expect(mock.renderedIndexes.length).toBe(rendersBefore);
  });
});

describe("LivePreview — debounce y cancelación (R16, R17)", () => {
  it("coalesce cambios rápidos de pageIndex en una sola rasterización (R16)", async () => {
    vi.useFakeTimers();
    const mock = createMockRasterizer({ pageCount: 5 });
    const props = {
      file: makePdfFile(),
      overlays: [],
      createRasterizer: mock.factory,
    };
    const { rerender } = render(
      <LivePreview {...props} pageIndex={0} />,
    );
    // Deja resolver la carga async del documento.
    await vi.advanceTimersByTimeAsync(0);

    // Varios cambios dentro de la ventana de debounce.
    rerender(<LivePreview {...props} pageIndex={1} />);
    rerender(<LivePreview {...props} pageIndex={2} />);
    rerender(<LivePreview {...props} pageIndex={4} />);

    await vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS);

    expect(mock.renderedIndexes).toEqual([4]);
  });

  it("aborta el AbortSignal del render previo al cambiar pageIndex (R17)", async () => {
    const mock = createMockRasterizer({ pageCount: 5, neverResolve: true });
    const props = {
      file: makePdfFile(),
      overlays: [],
      createRasterizer: mock.factory,
    };
    const { rerender } = render(<LivePreview {...props} pageIndex={0} />);

    await waitFor(() => expect(mock.signals).toHaveLength(1));
    expect(mock.signals[0].aborted).toBe(false);

    rerender(<LivePreview {...props} pageIndex={1} />);

    await waitFor(() => expect(mock.signals[0].aborted).toBe(true));
    await waitFor(() => expect(mock.renderedIndexes).toContain(1));
  });
});

describe("LivePreview — red, recursos (R18, R19, R20)", () => {
  it("rasterizar no hace peticiones de red con los bytes del PDF (R18)", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const openSpy = vi.spyOn(XMLHttpRequest.prototype, "open");
    const sendSpy = vi.spyOn(XMLHttpRequest.prototype, "send");

    const mock = createMockRasterizer();
    render(
      <LivePreview
        file={makePdfFile()}
        pageIndex={0}
        overlays={[]}
        createRasterizer={mock.factory}
      />,
    );
    await screen.findByRole("img");

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("al desmontar libera el rasterizador (destroy) y revoca la object URL (R19, R20)", async () => {
    const mock = createMockRasterizer();
    const { unmount } = render(
      <LivePreview
        file={makePdfFile()}
        pageIndex={0}
        overlays={[]}
        createRasterizer={mock.factory}
      />,
    );
    await screen.findByRole("img");
    await waitFor(() => expect(created).toHaveLength(1));

    unmount();

    expect(mock.destroyCalls()).toBe(1);
    expect(revoked).toContain(created[0]);
  });
});

describe("LivePreview — PDF inválido y accesibilidad (R21, R22, R23b, R24)", () => {
  it("PDF inválido muestra error accesible y ninguna página (R21, R22)", async () => {
    const mock = createMockRasterizer({ reject: true });
    render(
      <LivePreview
        file={makePdfFile()}
        pageIndex={0}
        overlays={[]}
        createRasterizer={mock.factory}
      />,
    );
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/no es un pdf válido/i);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(mock.renderedIndexes).toHaveLength(0);
  });

  it("expone una región etiquetada e indicador de carga aria-live (R24)", async () => {
    const mock = createMockRasterizer({ neverResolve: true });
    render(
      <LivePreview
        file={makePdfFile()}
        pageIndex={0}
        overlays={[]}
        createRasterizer={mock.factory}
      />,
    );
    expect(
      screen.getByRole("region", { name: "Vista previa del resultado" }),
    ).toBeInTheDocument();
    const loading = await screen.findByText(/generando vista previa/i);
    expect(loading).toHaveAttribute("aria-live", "polite");
  });

  it("no importa módulos específicos de una herramienta (R23b)", () => {
    expect(livePreviewSource).not.toMatch(/from ["']@\/pdf\/watermark["']/);
    expect(livePreviewSource).not.toMatch(/from ["']@\/pdf\/pageNumbers["']/);
  });
});
