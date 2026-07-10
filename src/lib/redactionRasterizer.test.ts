import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  REDACTION_FILL_STYLE,
  rasterizeRedactedPage,
} from "@/lib/redactionRasterizer";
import type { NormalizedBox } from "@/pdf/redact";
import type { PageRasterizer, RasterizeOptions } from "@/pdf/rasterize";

/** Bytes PNG que devuelve el canvas falso tras redactar. */
const OUT_PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

interface FillRectCall {
  args: [number, number, number, number];
  fillStyle: string;
}

let fillRectCalls: FillRectCall[];
let ctx: {
  globalAlpha: number;
  fillStyle: string;
  drawImage: ReturnType<typeof vi.fn>;
  fillRect: ReturnType<typeof vi.fn>;
};

/** Rasterizador falso: cuenta las páginas pedidas y devuelve un PNG mínimo. */
function fakeRasterizer(rendered: number[]): PageRasterizer {
  return {
    pageCount: () => 1,
    renderPage: (index) => {
      rendered.push(index);
      return Promise.resolve(
        new Blob([new Uint8Array([9])], { type: "image/png" }),
      );
    },
    destroy: () => {},
  };
}

const OPTIONS: RasterizeOptions = { format: "png", scale: 2 };

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:mock") as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL;

  fillRectCalls = [];
  ctx = {
    globalAlpha: 1,
    fillStyle: "",
    drawImage: vi.fn(),
    fillRect: vi.fn((x: number, y: number, w: number, h: number) => {
      fillRectCalls.push({ args: [x, y, w, h], fillStyle: ctx.fillStyle });
    }),
  };

  // Image que se "carga" de inmediato con dimensiones fijas 400×800.
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = 400;
    naturalHeight = 800;
    width = 400;
    height = 800;
    set src(_value: string) {
      queueMicrotask(() => this.onload?.());
    }
  }
  vi.stubGlobal("Image", FakeImage);

  // Canvas falso con getContext espiado y toBlob que entrega OUT_PNG.
  const realCreate = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    if (tag === "canvas") {
      return {
        width: 0,
        height: 0,
        getContext: () => ctx,
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

describe("rasterizeRedactedPage (R5, R2)", () => {
  it("pinta una fillRect opaca por caja con el rect de normalizedBoxToPixels", async () => {
    const boxes: NormalizedBox[] = [
      { pageIndex: 0, left: 0.25, top: 0.5, width: 0.25, height: 0.25 },
      { pageIndex: 0, left: 0, top: 0, width: 0.5, height: 0.1 },
    ];
    const result = await rasterizeRedactedPage(
      fakeRasterizer([]),
      0,
      boxes,
      OPTIONS,
      new AbortController().signal,
    );

    // Una fillRect por caja, en píxeles del bitmap (400×800).
    expect(fillRectCalls).toHaveLength(2);
    expect(fillRectCalls[0].args).toEqual([100, 400, 100, 200]);
    expect(fillRectCalls[1].args).toEqual([0, 0, 200, 80]);
    // Relleno OPACO (opacidad 1, color sólido). (R2)
    expect(ctx.globalAlpha).toBe(1);
    for (const call of fillRectCalls) {
      expect(call.fillStyle).toBe(REDACTION_FILL_STYLE);
    }

    // Devuelve bytes de imagen no vacíos y el índice de la página.
    expect(result.pageIndex).toBe(0);
    expect(result.mimeType).toBe("image/png");
    expect(result.bytes.length).toBeGreaterThan(0);
  });

  it("rasteriza exactamente la página pedida", async () => {
    const rendered: number[] = [];
    await rasterizeRedactedPage(
      fakeRasterizer(rendered),
      3,
      [{ pageIndex: 3, left: 0, top: 0, width: 0.1, height: 0.1 }],
      OPTIONS,
      new AbortController().signal,
    );
    expect(rendered).toEqual([3]);
  });
});
