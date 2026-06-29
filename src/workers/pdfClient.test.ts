import { describe, expect, it } from "vitest";

import {
  CompressFailedError,
  ImagesToPdfFailedError,
  InvalidImageError,
  InvalidPageOrderError,
  InvalidPdfError,
  InvalidRangeError,
  InvalidRotationError,
  MergeFailedError,
  OrganizeFailedError,
  PageNumbersFailedError,
  RotateFailedError,
  SplitFailedError,
  WatermarkFailedError,
  type ProgressCallback,
} from "@/pdf/types";
import type {
  CompressPdfResult,
  PdfWorkerApi,
  ProbeInput,
  ProbeResult,
} from "@/workers/contract";
import { createPdfClient, isPdfWorkerError } from "@/workers/pdfClient";
import { createPdfWorkerApi } from "@/workers/pdfWorkerApi";

/** Resultado de compresión vacío reutilizable por los stubs del contrato. */
function emptyCompressResult(): CompressPdfResult {
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
}

describe("createPdfClient", () => {
  it("con API inyectada no instancia un Worker y devuelve resultado tipado (R8, R18)", async () => {
    const client = createPdfClient(createPdfWorkerApi());
    const result: ProbeResult = await client.probe({ values: [1, 2, 3] });
    expect(result).toEqual({ sum: 6, count: 3 });
  });

  it("reenvía el callback de progreso, ejecutado en el hilo principal, terminando en 1 (R16)", async () => {
    const client = createPdfClient(createPdfWorkerApi());
    const progress: number[] = [];
    const onProgress: ProgressCallback = (p) => progress.push(p);
    await client.probe({ values: [1, 2, 3] }, onProgress);

    expect(progress.length).toBeGreaterThan(0);
    for (const p of progress) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
    expect(progress[progress.length - 1]).toBe(1);
  });

  it("rechaza la Promise (sin throw síncrono) preservando el name del error de dominio (R11, R12)", async () => {
    const failingApi: PdfWorkerApi = {
      async probe(_input: ProbeInput): Promise<ProbeResult> {
        const error = new Error("falló");
        error.name = "ProbeFailedError";
        throw error;
      },
      async merge(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async split(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async rotate(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async organize(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async imagesToPdf(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async addPageNumbers(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async addWatermark(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async compress(): Promise<CompressPdfResult> {
        return emptyCompressResult();
      },
    };
    const client = createPdfClient(failingApi);

    const promise = client.probe({ values: [1] });
    expect(promise).toBeInstanceOf(Promise);
    await expect(promise).rejects.toMatchObject({ name: "ProbeFailedError" });

    let caught: unknown;
    try {
      await client.probe({ values: [1] });
    } catch (error) {
      caught = error;
    }
    expect(isPdfWorkerError(caught)).toBe(true);
  });
});

describe("createPdfClient — merge", () => {
  function clientWith(merge: PdfWorkerApi["merge"]) {
    const api: PdfWorkerApi = {
      async probe(input: ProbeInput): Promise<ProbeResult> {
        return { sum: 0, count: input.values.length };
      },
      merge,
      async split(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async rotate(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async organize(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async imagesToPdf(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async addPageNumbers(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async addWatermark(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async compress(): Promise<CompressPdfResult> {
        return emptyCompressResult();
      },
    };
    return createPdfClient(api);
  }

  it("con API inyectada devuelve los bytes del worker (R16)", async () => {
    const expected = new Uint8Array([1, 2, 3, 4]);
    const client = clientWith(async () => expected);
    const result = await client.merge([new Uint8Array([0]), new Uint8Array([1])]);
    expect(result).toEqual(expected);
  });

  it("reenvía el callback de progreso al merge (R16)", async () => {
    const client = clientWith(async (_inputs, onProgress) => {
      onProgress?.(0);
      onProgress?.(0.5);
      onProgress?.(1);
      return new Uint8Array([9]);
    });
    const progress: number[] = [];
    const onProgress: ProgressCallback = (p) => progress.push(p);
    await client.merge([new Uint8Array([0]), new Uint8Array([1])], onProgress);
    expect(progress).toEqual([0, 0.5, 1]);
  });

  it("preserva el name del error de dominio al cruzar el cliente (R18)", async () => {
    const client = clientWith(async () => {
      throw new InvalidPdfError();
    });
    await expect(
      client.merge([new Uint8Array([0]), new Uint8Array([1])]),
    ).rejects.toMatchObject({ name: "InvalidPdfError" });
  });

  it("isPdfWorkerError reconoce InvalidPdfError y MergeFailedError (R19)", () => {
    expect(isPdfWorkerError(new InvalidPdfError())).toBe(true);
    expect(isPdfWorkerError(new MergeFailedError())).toBe(true);
  });
});

describe("createPdfClient — split", () => {
  function clientWith(split: PdfWorkerApi["split"]) {
    const api: PdfWorkerApi = {
      async probe(input: ProbeInput): Promise<ProbeResult> {
        return { sum: 0, count: input.values.length };
      },
      async merge(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      split,
      async rotate(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async organize(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async imagesToPdf(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async addPageNumbers(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async addWatermark(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async compress(): Promise<CompressPdfResult> {
        return emptyCompressResult();
      },
    };
    return createPdfClient(api);
  }

  it("con API inyectada devuelve los bytes del worker (R27)", async () => {
    const expected = new Uint8Array([5, 6, 7, 8]);
    const client = clientWith(async () => expected);
    const result = await client.split(new Uint8Array([0]), "1-3,5");
    expect(result).toEqual(expected);
  });

  it("invoca split con los bytes y la spec de rangos (R27)", async () => {
    let capturedInput: Uint8Array | undefined;
    let capturedSpec: string | undefined;
    const client = clientWith(async (input, rangeSpec) => {
      capturedInput = input;
      capturedSpec = rangeSpec;
      return new Uint8Array([9]);
    });
    await client.split(new Uint8Array([1, 2]), "2-4");
    expect(capturedInput && Array.from(capturedInput)).toEqual([1, 2]);
    expect(capturedSpec).toBe("2-4");
  });

  it("reenvía el callback de progreso al split (R27)", async () => {
    const client = clientWith(async (_input, _spec, onProgress) => {
      onProgress?.(0);
      onProgress?.(1);
      return new Uint8Array([9]);
    });
    const progress: number[] = [];
    const onProgress: ProgressCallback = (p) => progress.push(p);
    await client.split(new Uint8Array([0]), "1", onProgress);
    expect(progress).toEqual([0, 1]);
  });

  it("preserva el name del error de dominio al cruzar el cliente (R29)", async () => {
    const client = clientWith(async () => {
      throw new InvalidRangeError();
    });
    await expect(
      client.split(new Uint8Array([0]), "9"),
    ).rejects.toMatchObject({ name: "InvalidRangeError" });
  });

  it("isPdfWorkerError reconoce InvalidRangeError y SplitFailedError (R30)", () => {
    expect(isPdfWorkerError(new InvalidRangeError())).toBe(true);
    expect(isPdfWorkerError(new SplitFailedError())).toBe(true);
  });
});

describe("createPdfClient — rotate", () => {
  function clientWith(rotate: PdfWorkerApi["rotate"]) {
    const api: PdfWorkerApi = {
      async probe(input: ProbeInput): Promise<ProbeResult> {
        return { sum: 0, count: input.values.length };
      },
      async merge(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async split(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      rotate,
      async organize(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async imagesToPdf(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async addPageNumbers(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async addWatermark(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async compress(): Promise<CompressPdfResult> {
        return emptyCompressResult();
      },
    };
    return createPdfClient(api);
  }

  it("con API inyectada devuelve los bytes del worker (R29)", async () => {
    const expected = new Uint8Array([3, 1, 4, 1]);
    const client = clientWith(async () => expected);
    const result = await client.rotate(new Uint8Array([0]), {
      angle: 90,
      pages: "all",
    });
    expect(result).toEqual(expected);
  });

  it("invoca rotate con los bytes y las opciones (R29)", async () => {
    let capturedInput: Uint8Array | undefined;
    let capturedOptions: { angle: number; pages: string } | undefined;
    const client = clientWith(async (input, options) => {
      capturedInput = input;
      capturedOptions = options;
      return new Uint8Array([9]);
    });
    await client.rotate(new Uint8Array([1, 2]), { angle: 180, pages: "1-3,5" });
    expect(capturedInput && Array.from(capturedInput)).toEqual([1, 2]);
    expect(capturedOptions).toEqual({ angle: 180, pages: "1-3,5" });
  });

  it("reenvía el callback de progreso al rotate (R29)", async () => {
    const client = clientWith(async (_input, _options, onProgress) => {
      onProgress?.(0);
      onProgress?.(1);
      return new Uint8Array([9]);
    });
    const progress: number[] = [];
    const onProgress: ProgressCallback = (p) => progress.push(p);
    await client.rotate(new Uint8Array([0]), { angle: 90, pages: "all" }, onProgress);
    expect(progress).toEqual([0, 1]);
  });

  it("preserva el name del error de dominio al cruzar el cliente (R31)", async () => {
    const client = clientWith(async () => {
      throw new InvalidRotationError();
    });
    await expect(
      client.rotate(new Uint8Array([0]), { angle: 45, pages: "all" }),
    ).rejects.toMatchObject({ name: "InvalidRotationError" });
  });

  it("isPdfWorkerError reconoce InvalidRotationError y RotateFailedError (R32)", () => {
    expect(isPdfWorkerError(new InvalidRotationError())).toBe(true);
    expect(isPdfWorkerError(new RotateFailedError())).toBe(true);
  });
});

describe("createPdfClient — organize", () => {
  function clientWith(organize: PdfWorkerApi["organize"]) {
    const api: PdfWorkerApi = {
      async probe(input: ProbeInput): Promise<ProbeResult> {
        return { sum: 0, count: input.values.length };
      },
      async merge(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async split(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async rotate(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      organize,
      async imagesToPdf(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async addPageNumbers(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async addWatermark(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async compress(): Promise<CompressPdfResult> {
        return emptyCompressResult();
      },
    };
    return createPdfClient(api);
  }

  it("con API inyectada devuelve los bytes del worker (R29)", async () => {
    const expected = new Uint8Array([0xca, 0xfe]);
    const client = clientWith(async () => expected);
    const result = await client.organize(new Uint8Array([0]), [0]);
    expect(result).toEqual(expected);
  });

  it("invoca organize con los bytes y el orden de páginas (R29)", async () => {
    let capturedInput: Uint8Array | undefined;
    let capturedOrder: readonly number[] | undefined;
    const client = clientWith(async (input, pageOrder) => {
      capturedInput = input;
      capturedOrder = pageOrder;
      return new Uint8Array([9]);
    });
    await client.organize(new Uint8Array([1, 2]), [2, 0]);
    expect(capturedInput && Array.from(capturedInput)).toEqual([1, 2]);
    expect(capturedOrder && Array.from(capturedOrder)).toEqual([2, 0]);
  });

  it("reenvía el callback de progreso al organize (R29)", async () => {
    const client = clientWith(async (_input, _order, onProgress) => {
      onProgress?.(0);
      onProgress?.(1);
      return new Uint8Array([9]);
    });
    const progress: number[] = [];
    const onProgress: ProgressCallback = (p) => progress.push(p);
    await client.organize(new Uint8Array([0]), [0], onProgress);
    expect(progress).toEqual([0, 1]);
  });

  it("preserva el name del error de dominio al cruzar el cliente (R29)", async () => {
    const client = clientWith(async () => {
      throw new OrganizeFailedError();
    });
    await expect(
      client.organize(new Uint8Array([0]), []),
    ).rejects.toMatchObject({ name: "OrganizeFailedError" });
  });

  it("isPdfWorkerError reconoce OrganizeFailedError e InvalidPageOrderError (R30)", () => {
    expect(isPdfWorkerError(new OrganizeFailedError())).toBe(true);
    expect(isPdfWorkerError(new InvalidPageOrderError())).toBe(true);
  });
});

describe("createPdfClient — imagesToPdf", () => {
  function clientWith(imagesToPdf: PdfWorkerApi["imagesToPdf"]) {
    const api: PdfWorkerApi = {
      async probe(input: ProbeInput): Promise<ProbeResult> {
        return { sum: 0, count: input.values.length };
      },
      async merge(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async split(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async rotate(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async organize(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      imagesToPdf,
      async addPageNumbers(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async addWatermark(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async compress(): Promise<CompressPdfResult> {
        return emptyCompressResult();
      },
    };
    return createPdfClient(api);
  }

  it("con API inyectada devuelve los bytes del worker (R35)", async () => {
    const expected = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const client = clientWith(async () => expected);
    const result = await client.imagesToPdf([new Uint8Array([0xff])], {
      pageSize: "fit",
    });
    expect(result).toEqual(expected);
  });

  it("invoca imagesToPdf con las imágenes y las opciones (R35)", async () => {
    let capturedImages: readonly Uint8Array[] | undefined;
    let capturedOptions: { pageSize: string } | undefined;
    const client = clientWith(async (images, options) => {
      capturedImages = images;
      capturedOptions = options;
      return new Uint8Array([9]);
    });
    await client.imagesToPdf(
      [new Uint8Array([1]), new Uint8Array([2])],
      { pageSize: "a4" },
    );
    expect(capturedImages?.map((b) => Array.from(b))).toEqual([[1], [2]]);
    expect(capturedOptions).toEqual({ pageSize: "a4" });
  });

  it("reenvía el callback de progreso al imagesToPdf", async () => {
    const client = clientWith(async (_images, _options, onProgress) => {
      onProgress?.(0);
      onProgress?.(0.5);
      onProgress?.(1);
      return new Uint8Array([9]);
    });
    const progress: number[] = [];
    const onProgress: ProgressCallback = (p) => progress.push(p);
    await client.imagesToPdf(
      [new Uint8Array([0])],
      { pageSize: "fit" },
      onProgress,
    );
    expect(progress).toEqual([0, 0.5, 1]);
  });

  it("preserva el name del error de dominio al cruzar el cliente (R37)", async () => {
    const client = clientWith(async () => {
      throw new InvalidImageError();
    });
    await expect(
      client.imagesToPdf([new Uint8Array([0])], { pageSize: "fit" }),
    ).rejects.toMatchObject({ name: "InvalidImageError" });
  });

  it("isPdfWorkerError reconoce InvalidImageError e ImagesToPdfFailedError (R31, R32)", () => {
    expect(isPdfWorkerError(new InvalidImageError())).toBe(true);
    expect(isPdfWorkerError(new ImagesToPdfFailedError())).toBe(true);
  });
});

describe("createPdfClient — addPageNumbers", () => {
  function clientWith(addPageNumbers: PdfWorkerApi["addPageNumbers"]) {
    const api: PdfWorkerApi = {
      async probe(input: ProbeInput): Promise<ProbeResult> {
        return { sum: 0, count: input.values.length };
      },
      async merge(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async split(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async rotate(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async organize(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async imagesToPdf(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      addPageNumbers,
      async addWatermark(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async compress(): Promise<CompressPdfResult> {
        return emptyCompressResult();
      },
    };
    return createPdfClient(api);
  }

  it("con API inyectada devuelve los bytes del worker (R31)", async () => {
    const expected = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const client = clientWith(async () => expected);
    const result = await client.addPageNumbers(new Uint8Array([0]), {
      position: "bottom-center",
      format: "n",
      startNumber: 1,
      fontSize: 12,
    });
    expect(result).toEqual(expected);
  });

  it("invoca addPageNumbers con los bytes y las opciones (R31)", async () => {
    let capturedInput: Uint8Array | undefined;
    let capturedOptions:
      | { position: string; format: string; startNumber: number; fontSize: number }
      | undefined;
    const client = clientWith(async (input, options) => {
      capturedInput = input;
      capturedOptions = options;
      return new Uint8Array([9]);
    });
    await client.addPageNumbers(new Uint8Array([1, 2]), {
      position: "top-right",
      format: "page-n",
      startNumber: 3,
      fontSize: 14,
    });
    expect(capturedInput && Array.from(capturedInput)).toEqual([1, 2]);
    expect(capturedOptions).toEqual({
      position: "top-right",
      format: "page-n",
      startNumber: 3,
      fontSize: 14,
    });
  });

  it("reenvía el callback de progreso al addPageNumbers", async () => {
    const client = clientWith(async (_input, _options, onProgress) => {
      onProgress?.(0);
      onProgress?.(0.5);
      onProgress?.(1);
      return new Uint8Array([9]);
    });
    const progress: number[] = [];
    const onProgress: ProgressCallback = (p) => progress.push(p);
    await client.addPageNumbers(
      new Uint8Array([0]),
      { position: "bottom-center", format: "n", startNumber: 1, fontSize: 12 },
      onProgress,
    );
    expect(progress).toEqual([0, 0.5, 1]);
  });

  it("preserva el name del error de dominio al cruzar el cliente (R33)", async () => {
    const client = clientWith(async () => {
      throw new PageNumbersFailedError();
    });
    await expect(
      client.addPageNumbers(new Uint8Array([0]), {
        position: "bottom-center",
        format: "n",
        startNumber: 1,
        fontSize: 12,
      }),
    ).rejects.toMatchObject({ name: "PageNumbersFailedError" });
  });

  it("isPdfWorkerError reconoce PageNumbersFailedError (R28)", () => {
    expect(isPdfWorkerError(new PageNumbersFailedError())).toBe(true);
  });
});

describe("createPdfClient — addWatermark", () => {
  const baseOptions = {
    mode: "text" as const,
    text: "CONFIDENCIAL",
    image: null,
    position: "center" as const,
    opacity: 0.3,
    angle: 45,
    fontSize: 24,
    pages: "all",
  };

  function clientWith(addWatermark: PdfWorkerApi["addWatermark"]) {
    const api: PdfWorkerApi = {
      async probe(input: ProbeInput): Promise<ProbeResult> {
        return { sum: 0, count: input.values.length };
      },
      async merge(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async split(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async rotate(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async organize(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async imagesToPdf(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async addPageNumbers(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      addWatermark,
      async compress(): Promise<CompressPdfResult> {
        return emptyCompressResult();
      },
    };
    return createPdfClient(api);
  }

  it("con API inyectada devuelve los bytes del worker (R41)", async () => {
    const expected = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const client = clientWith(async () => expected);
    const result = await client.addWatermark(new Uint8Array([0]), baseOptions);
    expect(result).toEqual(expected);
  });

  it("reenvía el callback de progreso al addWatermark", async () => {
    const client = clientWith(async (_input, _options, onProgress) => {
      onProgress?.(0);
      onProgress?.(0.5);
      onProgress?.(1);
      return new Uint8Array([9]);
    });
    const progress: number[] = [];
    const onProgress: ProgressCallback = (p) => progress.push(p);
    await client.addWatermark(new Uint8Array([0]), baseOptions, onProgress);
    expect(progress).toEqual([0, 0.5, 1]);
  });

  it("preserva el name del error de dominio al cruzar el cliente (R43)", async () => {
    const client = clientWith(async () => {
      throw new WatermarkFailedError();
    });
    await expect(
      client.addWatermark(new Uint8Array([0]), baseOptions),
    ).rejects.toMatchObject({ name: "WatermarkFailedError" });
  });

  it("isPdfWorkerError reconoce WatermarkFailedError (R38)", () => {
    expect(isPdfWorkerError(new WatermarkFailedError())).toBe(true);
  });
});

describe("createPdfClient — compress", () => {
  function clientWith(compress: PdfWorkerApi["compress"]) {
    const api: PdfWorkerApi = {
      async probe(input: ProbeInput): Promise<ProbeResult> {
        return { sum: 0, count: input.values.length };
      },
      async merge(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async split(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async rotate(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async organize(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async imagesToPdf(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async addPageNumbers(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async addWatermark(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      compress,
    };
    return createPdfClient(api);
  }

  it("con API inyectada devuelve los bytes y el report del worker (R23)", async () => {
    const expected: CompressPdfResult = {
      bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      report: {
        originalSize: 100,
        compressedSize: 40,
        totalImages: 1,
        recompressibleImages: 1,
        recompressedImages: 1,
        minimalReduction: false,
      },
    };
    const client = clientWith(async () => expected);
    const result = await client.compress(new Uint8Array([0]), {
      level: "medium",
    });
    expect(result).toEqual(expected);
  });

  it("reenvía el callback de progreso al compress (R24)", async () => {
    const client = clientWith(async (_input, _options, onProgress) => {
      onProgress?.(0);
      onProgress?.(0.5);
      onProgress?.(1);
      return emptyCompressResult();
    });
    const progress: number[] = [];
    const onProgress: ProgressCallback = (p) => progress.push(p);
    await client.compress(new Uint8Array([0]), { level: "low" }, onProgress);
    expect(progress).toEqual([0, 0.5, 1]);
  });

  it("preserva el name de CompressFailedError al cruzar el cliente (R25)", async () => {
    const client = clientWith(async () => {
      throw new CompressFailedError();
    });
    await expect(
      client.compress(new Uint8Array([0]), { level: "medium" }),
    ).rejects.toMatchObject({ name: "CompressFailedError" });
  });

  it("isPdfWorkerError reconoce CompressFailedError (R25)", () => {
    expect(isPdfWorkerError(new CompressFailedError())).toBe(true);
  });
});
