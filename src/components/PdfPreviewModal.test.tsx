import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PdfPreviewModal } from "@/components/PdfPreviewModal";
import { InvalidPdfError } from "@/pdf/types";
import type {
  PageRasterizer,
  PageRasterizerFactory,
  RasterizeOptions,
} from "@/pdf/rasterize";

/** Registro observable de un factory de rasterizador mock (sin pdf.js/canvas). */
interface MockRasterizer {
  factory: PageRasterizerFactory;
  /** Índices (0-based) pasados a `renderPage`, en orden. */
  renderedIndexes: number[];
  /** `AbortSignal` recibido en cada `renderPage`, en orden. */
  signals: AbortSignal[];
  /** Opciones recibidas en cada `renderPage`. */
  options: RasterizeOptions[];
  /** Nº de veces que se llamó `destroy`. */
  destroyCalls: () => number;
}

interface MockOptions {
  pageCount?: number;
  /** El factory rechaza con `InvalidPdfError` (PDF inválido). */
  reject?: boolean;
  /** `renderPage` nunca resuelve (render en curso). */
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
  return new File([new Uint8Array([37, 80, 68, 70])], name, {
    type: "application/pdf",
  });
}

/** Monta el visor; al pulsar cerrar se desmonta (como haría el `Dropzone`). */
function Harness({
  file,
  factory,
}: {
  file: File;
  factory: PageRasterizerFactory;
}): JSX.Element | null {
  const [open, setOpen] = useState(true);
  if (!open) {
    return null;
  }
  return (
    <PdfPreviewModal
      file={file}
      onClose={() => setOpen(false)}
      createRasterizer={factory}
    />
  );
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
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PdfPreviewModal", () => {
  it("monta con un PDF y muestra la página actual y el indicador de páginas (R8, R24)", async () => {
    const mock = createMockRasterizer({ pageCount: 3 });
    render(
      <PdfPreviewModal
        file={makePdfFile()}
        onClose={vi.fn()}
        createRasterizer={mock.factory}
      />,
    );
    expect(await screen.findByRole("img")).toBeInTheDocument();
    expect(screen.getByText("1 de 3")).toBeInTheDocument();
  });

  it("expone role dialog con aria-modal='true' (R19)", async () => {
    const mock = createMockRasterizer();
    render(
      <PdfPreviewModal
        file={makePdfFile()}
        onClose={vi.fn()}
        createRasterizer={mock.factory}
      />,
    );
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("'siguiente' rasteriza y muestra la página resultante (R25)", async () => {
    const mock = createMockRasterizer({ pageCount: 3 });
    render(
      <PdfPreviewModal
        file={makePdfFile()}
        onClose={vi.fn()}
        createRasterizer={mock.factory}
      />,
    );
    await screen.findByRole("img");
    fireEvent.click(screen.getByRole("button", { name: /página siguiente/i }));
    expect(await screen.findByText("2 de 3")).toBeInTheDocument();
    await waitFor(() => expect(mock.renderedIndexes).toContain(1));
  });

  it("un PDF inválido muestra un error accesible y ninguna página rasterizada (R12a, R12b)", async () => {
    const mock = createMockRasterizer({ reject: true });
    render(
      <PdfPreviewModal
        file={makePdfFile()}
        onClose={vi.fn()}
        createRasterizer={mock.factory}
      />,
    );
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/no es un pdf válido/i);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(mock.renderedIndexes).toHaveLength(0);
  });

  it("al cerrar libera el documento (destroy) y revoca la object URL (R13, R15)", async () => {
    const mock = createMockRasterizer();
    render(<Harness file={makePdfFile()} factory={mock.factory} />);
    await screen.findByRole("img");
    await waitFor(() => expect(created).toHaveLength(1));

    fireEvent.click(screen.getByRole("button", { name: /cerrar vista previa/i }));

    await waitFor(() => expect(mock.destroyCalls()).toBe(1));
    expect(revoked).toContain(created[0]);
  });

  it("Escape cierra el visor (R21)", async () => {
    const onClose = vi.fn();
    const mock = createMockRasterizer();
    render(
      <PdfPreviewModal
        file={makePdfFile()}
        onClose={onClose}
        createRasterizer={mock.factory}
      />,
    );
    const dialog = await screen.findByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // T11 — R9
  it("rasteriza ÚNICAMENTE la página actual y ninguna otra (R9)", async () => {
    const mock = createMockRasterizer({ pageCount: 5 });
    render(
      <PdfPreviewModal
        file={makePdfFile()}
        onClose={vi.fn()}
        createRasterizer={mock.factory}
      />,
    );
    await screen.findByRole("img");
    // Estando en la página 1, solo se ha rasterizado el índice 0.
    expect(mock.renderedIndexes).toEqual([0]);
  });

  // T12 — R10
  it("al navegar aborta el AbortSignal del render anterior antes del nuevo (R10)", async () => {
    const mock = createMockRasterizer({ pageCount: 3 });
    render(
      <PdfPreviewModal
        file={makePdfFile()}
        onClose={vi.fn()}
        createRasterizer={mock.factory}
      />,
    );
    await screen.findByRole("img");
    expect(mock.signals[0].aborted).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: /página siguiente/i }));

    await waitFor(() => expect(mock.signals[0].aborted).toBe(true));
    // Se inició un nuevo render (índice 1) tras abortar el anterior.
    await waitFor(() => expect(mock.renderedIndexes).toContain(1));
  });

  it("al hacer zoom aborta el AbortSignal del render anterior (R10)", async () => {
    const mock = createMockRasterizer({ pageCount: 3 });
    render(
      <PdfPreviewModal
        file={makePdfFile()}
        onClose={vi.fn()}
        createRasterizer={mock.factory}
      />,
    );
    await screen.findByRole("img");
    const before = mock.signals.length;

    fireEvent.click(screen.getByRole("button", { name: /aumentar zoom/i }));

    await waitFor(() => expect(mock.signals[before - 1].aborted).toBe(true));
    await waitFor(() => expect(mock.signals.length).toBeGreaterThan(before));
  });

  // T13 — R11
  it("abrir y rasterizar no hace peticiones de red con los bytes del PDF (R11)", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const openSpy = vi.spyOn(XMLHttpRequest.prototype, "open");
    const sendSpy = vi.spyOn(XMLHttpRequest.prototype, "send");

    const mock = createMockRasterizer();
    render(
      <PdfPreviewModal
        file={makePdfFile()}
        onClose={vi.fn()}
        createRasterizer={mock.factory}
      />,
    );
    await screen.findByRole("img");

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
    expect(sendSpy).not.toHaveBeenCalled();
  });

  // T14 — R14
  it("al cerrar con un render en curso aborta el AbortSignal pendiente (R14)", async () => {
    const mock = createMockRasterizer({ neverResolve: true });
    render(<Harness file={makePdfFile()} factory={mock.factory} />);
    // El render nunca resuelve: hay un render en curso con su signal registrado.
    await waitFor(() => expect(mock.signals).toHaveLength(1));
    expect(mock.signals[0].aborted).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: /cerrar vista previa/i }));

    await waitFor(() => expect(mock.signals[0].aborted).toBe(true));
    expect(mock.destroyCalls()).toBe(1);
  });

  // T15 — R20, R22, R23
  it("al abrir traslada el foco a un elemento dentro del diálogo (R20)", async () => {
    const mock = createMockRasterizer();
    render(
      <PdfPreviewModal
        file={makePdfFile()}
        onClose={vi.fn()}
        createRasterizer={mock.factory}
      />,
    );
    const dialog = await screen.findByRole("dialog");
    await waitFor(() =>
      expect(dialog.contains(document.activeElement)).toBe(true),
    );
  });

  it("el foco no escapa del diálogo al tabular (focus trap) (R22)", async () => {
    const mock = createMockRasterizer();
    render(
      <PdfPreviewModal
        file={makePdfFile()}
        onClose={vi.fn()}
        createRasterizer={mock.factory}
      />,
    );
    const dialog = await screen.findByRole("dialog");
    await screen.findByRole("img");

    const focusables = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled])',
      ),
    );
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    // Tab desde el último → vuelve al primero.
    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    // Shift+Tab desde el primero → salta al último.
    first.focus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("el control de cierre expone un aria-label (R23)", async () => {
    const mock = createMockRasterizer();
    render(
      <PdfPreviewModal
        file={makePdfFile()}
        onClose={vi.fn()}
        createRasterizer={mock.factory}
      />,
    );
    expect(
      await screen.findByRole("button", { name: /cerrar vista previa/i }),
    ).toBeInTheDocument();
  });

  it("rasteriza siempre en formato png (invariante de render)", async () => {
    const mock = createMockRasterizer();
    render(
      <PdfPreviewModal
        file={makePdfFile()}
        onClose={vi.fn()}
        createRasterizer={mock.factory}
      />,
    );
    await screen.findByRole("img");
    expect(mock.options[0].format).toBe("png");
  });
});
