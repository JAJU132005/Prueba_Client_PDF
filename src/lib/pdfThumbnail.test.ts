import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PDF_THUMBNAIL_SCALE, renderPdfThumbnailUrl } from "@/lib/pdfThumbnail";
import { InvalidPdfError } from "@/pdf/types";
import type {
  PageRasterizer,
  PageRasterizerFactory,
  RasterizeOptions,
} from "@/pdf/rasterize";

interface MockRasterizer {
  factory: PageRasterizerFactory;
  renderedIndexes: number[];
  signals: AbortSignal[];
  options: RasterizeOptions[];
  destroyCalls: () => number;
}

interface MockOptions {
  pageCount?: number;
  /** El factory rechaza con `InvalidPdfError`. */
  reject?: boolean;
  /** `renderPage` nunca resuelve salvo que se aborte el signal. */
  neverResolve?: boolean;
}

function createMockRasterizer(opts: MockOptions = {}): MockRasterizer {
  const { pageCount = 4, reject = false, neverResolve = false } = opts;
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
        return new Promise<Blob>((_resolve, reject) => {
          signal.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        });
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

const bytes = new Uint8Array([37, 80, 68, 70]);

beforeEach(() => {
  let counter = 0;
  URL.createObjectURL = vi.fn(
    () => `blob:thumb-${counter++}`,
  ) as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("renderPdfThumbnailUrl", () => {
  it("rasteriza ÚNICAMENTE el índice 0 y devuelve una object URL (R14)", async () => {
    const mock = createMockRasterizer({ pageCount: 5 });
    const controller = new AbortController();

    const url = await renderPdfThumbnailUrl(
      bytes,
      mock.factory,
      controller.signal,
    );

    expect(mock.renderedIndexes).toEqual([0]);
    expect(url).toBe("blob:thumb-0");
    expect(mock.options[0].scale).toBe(PDF_THUMBNAIL_SCALE);
    expect(mock.destroyCalls()).toBe(1);
  });

  it("propaga el mismo signal a renderPage; al abortar, la generación se cancela (R17)", async () => {
    const mock = createMockRasterizer({ neverResolve: true });
    const controller = new AbortController();

    const promise = renderPdfThumbnailUrl(
      bytes,
      mock.factory,
      controller.signal,
    );
    // Esperar a que renderPage haya registrado el signal.
    await vi.waitFor(() => expect(mock.signals).toHaveLength(1));
    expect(mock.signals[0]).toBe(controller.signal);
    expect(mock.signals[0].aborted).toBe(false);

    controller.abort();

    await expect(promise).rejects.toBeInstanceOf(DOMException);
    expect(mock.signals[0].aborted).toBe(true);
    // El rasterizador se libera aunque el render se aborte. (finally)
    expect(mock.destroyCalls()).toBe(1);
  });

  it("un fallo del rasterizador se propaga para marcar 'unavailable' (R20)", async () => {
    const mock = createMockRasterizer({ reject: true });
    const controller = new AbortController();

    await expect(
      renderPdfThumbnailUrl(bytes, mock.factory, controller.signal),
    ).rejects.toBeInstanceOf(InvalidPdfError);
    // Nunca se llegó a rasterizar ninguna página.
    expect(mock.renderedIndexes).toHaveLength(0);
  });
});
