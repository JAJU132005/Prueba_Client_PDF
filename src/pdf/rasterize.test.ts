import { describe, expect, it } from "vitest";

import {
  IMAGE_FORMATS,
  imageFileExtension,
  imageFileName,
  imageMimeType,
  rasterizePages,
  scaleForResolution,
  type ImageResolution,
  type PageRasterizer,
  type RasterizeOptions,
  type RasterizedPage,
} from "@/pdf/rasterize";

/**
 * Rasterizador falso (sin pdf.js): devuelve un Blob sintético del MIME pedido y
 * registra las opciones y signals recibidos.
 */
function makeRasterizer(
  pageCount: number,
  render?: PageRasterizer["renderPage"],
): PageRasterizer & {
  options: RasterizeOptions[];
  signals: AbortSignal[];
  indices: number[];
} {
  const options: RasterizeOptions[] = [];
  const signals: AbortSignal[] = [];
  const indices: number[] = [];
  return {
    options,
    signals,
    indices,
    pageCount: () => pageCount,
    async renderPage(index, opts, signal) {
      indices.push(index);
      options.push(opts);
      signals.push(signal);
      if (render) return render(index, opts, signal);
      return new Blob([new Uint8Array([0x01])], {
        type: imageMimeType(opts.format),
      });
    },
    destroy() {
      // no-op
    },
  };
}

describe("helpers de formato", () => {
  it("IMAGE_FORMATS contiene exactamente png y jpeg (R1)", () => {
    expect([...IMAGE_FORMATS]).toEqual(["png", "jpeg"]);
  });

  it("imageMimeType devuelve el MIME correcto (R2)", () => {
    expect(imageMimeType("png")).toBe("image/png");
    expect(imageMimeType("jpeg")).toBe("image/jpeg");
  });

  it("imageFileExtension devuelve png/jpg (R3)", () => {
    expect(imageFileExtension("png")).toBe("png");
    expect(imageFileExtension("jpeg")).toBe("jpg");
  });

  it("imageFileName usa pagina-<n>.<ext> 1-indexado (R4)", () => {
    expect(imageFileName(0, "png")).toBe("pagina-1.png");
    expect(imageFileName(4, "jpeg")).toBe("pagina-5.jpg");
  });

  it("scaleForResolution es positivo para cada resolución (R5a)", () => {
    const resolutions: ImageResolution[] = ["low", "medium", "high"];
    for (const r of resolutions) {
      expect(scaleForResolution(r)).toBeGreaterThan(0);
    }
  });

  it("scaleForResolution es estrictamente creciente high>medium>low (R5b)", () => {
    expect(scaleForResolution("high")).toBeGreaterThan(
      scaleForResolution("medium"),
    );
    expect(scaleForResolution("medium")).toBeGreaterThan(
      scaleForResolution("low"),
    );
  });
});

describe("rasterizePages", () => {
  const opts: RasterizeOptions = { format: "png", scale: 2, quality: 0.9 };

  it("emite una imagen por página en orden 0..n-1 (R6)", async () => {
    const rasterizer = makeRasterizer(3);
    const pages: RasterizedPage[] = [];
    await rasterizePages(
      rasterizer,
      opts,
      (p) => pages.push(p),
      new AbortController().signal,
    );
    expect(pages.map((p) => p.index)).toEqual([0, 1, 2]);
  });

  it("emite el Blob de renderPage, no vacío y del tipo pedido; pasa la escala (R7 — A4)", async () => {
    for (const format of IMAGE_FORMATS) {
      const rasterizer = makeRasterizer(1);
      const pages: RasterizedPage[] = [];
      const options: RasterizeOptions = { format, scale: 3 };
      await rasterizePages(
        rasterizer,
        options,
        (p) => pages.push(p),
        new AbortController().signal,
      );
      expect(pages).toHaveLength(1);
      expect(pages[0].blob.size).toBeGreaterThan(0);
      expect(pages[0].blob.type).toBe(imageMimeType(format));
      expect(rasterizer.options[0].scale).toBe(3);
      expect(rasterizer.options[0].format).toBe(format);
    }
  });

  it("espera (await) cada página antes de iniciar la siguiente (R8)", async () => {
    const resolvers: Array<(blob: Blob) => void> = [];
    const started: number[] = [];
    const rasterizer = makeRasterizer(
      2,
      (index) =>
        new Promise<Blob>((resolve) => {
          started.push(index);
          resolvers.push(resolve);
        }),
    );
    const pages: RasterizedPage[] = [];
    const done = rasterizePages(
      rasterizer,
      opts,
      (p) => pages.push(p),
      new AbortController().signal,
    );

    // Solo la página 0 ha empezado; la 1 espera a que resuelva la 0.
    await Promise.resolve();
    expect(started).toEqual([0]);

    resolvers[0](new Blob([new Uint8Array([1])]));
    await Promise.resolve();
    await Promise.resolve();
    expect(started).toEqual([0, 1]);

    resolvers[1](new Blob([new Uint8Array([1])]));
    await done;
    expect(pages.map((p) => p.index)).toEqual([0, 1]);
  });

  it("pasa el mismo signal a cada renderPage (R9)", async () => {
    const rasterizer = makeRasterizer(3);
    const signal = new AbortController().signal;
    await rasterizePages(rasterizer, opts, () => {}, signal);
    expect(rasterizer.signals).toHaveLength(3);
    for (const s of rasterizer.signals) {
      expect(s).toBe(signal);
    }
  });

  it("signal ya abortado → no invoca onPage (R10)", async () => {
    const rasterizer = makeRasterizer(3);
    const controller = new AbortController();
    controller.abort();
    const pages: RasterizedPage[] = [];
    await rasterizePages(rasterizer, opts, (p) => pages.push(p), controller.signal);
    expect(pages).toHaveLength(0);
  });

  it("abortar tras la primera página → no invoca onPage posteriores (R10)", async () => {
    const controller = new AbortController();
    const rasterizer = makeRasterizer(3, (index, optsArg) => {
      if (index === 0) controller.abort();
      return Promise.resolve(
        new Blob([new Uint8Array([1])], { type: imageMimeType(optsArg.format) }),
      );
    });
    const pages: RasterizedPage[] = [];
    await rasterizePages(rasterizer, opts, (p) => pages.push(p), controller.signal);
    expect(pages).toHaveLength(0);
  });

  it("onProgress emite valores en [0,1], uno por página, y el último es 1 (R11, R12)", async () => {
    const rasterizer = makeRasterizer(4);
    const values: number[] = [];
    await rasterizePages(
      rasterizer,
      opts,
      () => {},
      new AbortController().signal,
      (p) => values.push(p),
    );
    expect(values).toHaveLength(4);
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(values[values.length - 1]).toBe(1);
  });
});
