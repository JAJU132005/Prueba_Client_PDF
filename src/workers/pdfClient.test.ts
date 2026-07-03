import { describe, expect, it } from "vitest";

import {
  AnnotateFailedError,
  CompressFailedError,
  FillFormFailedError,
  ImagesToPdfFailedError,
  IncorrectPasswordError,
  InvalidImageError,
  InvalidPageOrderError,
  InvalidPdfError,
  InvalidRangeError,
  InvalidRotationError,
  MergeFailedError,
  OcrFailedError,
  OrganizeFailedError,
  PageNumbersFailedError,
  ProtectFailedError,
  RotateFailedError,
  SignFailedError,
  SplitFailedError,
  WatermarkFailedError,
  type ProgressCallback,
} from "@/pdf/types";
import type {
  CompressPdfResult,
  FormModel,
  OcrResult,
  PdfWorkerApi,
  ProbeInput,
  ProbeResult,
  SignOptions,
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
      async protect(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async annotate(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async sign(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async detectForm(): Promise<FormModel> {
        return { hasFields: false, fields: [] };
      },
      async fillForms(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async ocr(): Promise<OcrResult> {
        return { text: "" };
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
      async protect(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async annotate(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async sign(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async detectForm(): Promise<FormModel> {
        return { hasFields: false, fields: [] };
      },
      async fillForms(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async ocr(): Promise<OcrResult> {
        return { text: "" };
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
      async protect(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async annotate(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async sign(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async detectForm(): Promise<FormModel> {
        return { hasFields: false, fields: [] };
      },
      async fillForms(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async ocr(): Promise<OcrResult> {
        return { text: "" };
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
      async protect(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async annotate(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async sign(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async detectForm(): Promise<FormModel> {
        return { hasFields: false, fields: [] };
      },
      async fillForms(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async ocr(): Promise<OcrResult> {
        return { text: "" };
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
      async protect(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async annotate(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async sign(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async detectForm(): Promise<FormModel> {
        return { hasFields: false, fields: [] };
      },
      async fillForms(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async ocr(): Promise<OcrResult> {
        return { text: "" };
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
      async protect(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async annotate(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async sign(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async detectForm(): Promise<FormModel> {
        return { hasFields: false, fields: [] };
      },
      async fillForms(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async ocr(): Promise<OcrResult> {
        return { text: "" };
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
      async protect(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async annotate(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async sign(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async detectForm(): Promise<FormModel> {
        return { hasFields: false, fields: [] };
      },
      async fillForms(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async ocr(): Promise<OcrResult> {
        return { text: "" };
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
      async protect(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async annotate(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async sign(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async detectForm(): Promise<FormModel> {
        return { hasFields: false, fields: [] };
      },
      async fillForms(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async ocr(): Promise<OcrResult> {
        return { text: "" };
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
      async protect(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async annotate(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async sign(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async detectForm(): Promise<FormModel> {
        return { hasFields: false, fields: [] };
      },
      async fillForms(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async ocr(): Promise<OcrResult> {
        return { text: "" };
      },
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

describe("createPdfClient — protect", () => {
  function clientWith(protect: PdfWorkerApi["protect"]) {
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
      async compress(): Promise<CompressPdfResult> {
        return emptyCompressResult();
      },
      protect,
      async annotate(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async sign(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async detectForm(): Promise<FormModel> {
        return { hasFields: false, fields: [] };
      },
      async fillForms(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async ocr(): Promise<OcrResult> {
        return { text: "" };
      },
    };
    return createPdfClient(api);
  }

  it("con API inyectada devuelve los bytes del worker (R18)", async () => {
    const expected = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const client = clientWith(async () => expected);
    const result = await client.protect(new Uint8Array([0]), {
      mode: "protect",
      password: "x",
    });
    expect(result).toEqual(expected);
  });

  it("reenvía el callback de progreso al protect (R19)", async () => {
    const client = clientWith(async (_input, _options, onProgress) => {
      onProgress?.(0);
      onProgress?.(0.5);
      onProgress?.(1);
      return new Uint8Array([9]);
    });
    const progress: number[] = [];
    const onProgress: ProgressCallback = (p) => progress.push(p);
    await client.protect(
      new Uint8Array([0]),
      { mode: "protect", password: "x" },
      onProgress,
    );
    expect(progress).toEqual([0, 0.5, 1]);
  });

  it("preserva el name de IncorrectPasswordError al cruzar el cliente (R20)", async () => {
    const client = clientWith(async () => {
      throw new IncorrectPasswordError();
    });
    await expect(
      client.protect(new Uint8Array([0]), { mode: "unlock", password: "mala" }),
    ).rejects.toMatchObject({ name: "IncorrectPasswordError" });
  });

  it("isPdfWorkerError reconoce IncorrectPasswordError y ProtectFailedError (R20)", () => {
    expect(isPdfWorkerError(new IncorrectPasswordError())).toBe(true);
    expect(isPdfWorkerError(new ProtectFailedError())).toBe(true);
  });
});

describe("createPdfClient — annotate", () => {
  function clientWith(annotate: PdfWorkerApi["annotate"]) {
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
      async compress(): Promise<CompressPdfResult> {
        return emptyCompressResult();
      },
      async protect(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      annotate,
      async sign(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async detectForm(): Promise<FormModel> {
        return { hasFields: false, fields: [] };
      },
      async fillForms(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async ocr(): Promise<OcrResult> {
        return { text: "" };
      },
    };
    return createPdfClient(api);
  }

  it("con API inyectada delega en annotate y devuelve los bytes (R22, R23)", async () => {
    let capturedInput: Uint8Array | undefined;
    const expected = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const client = clientWith(async (input) => {
      capturedInput = input;
      return expected;
    });
    const result = await client.annotate(new Uint8Array([1, 2]), [
      {
        id: "a",
        pageIndex: 0,
        kind: "text",
        at: { x: 1, y: 2 },
        text: "hola",
        fontSize: 12,
        color: { r: 0, g: 0, b: 0 },
      },
    ]);
    expect(capturedInput && Array.from(capturedInput)).toEqual([1, 2]);
    expect(result).toEqual(expected);
  });

  it("reenvía el callback de progreso al annotate (R22)", async () => {
    const client = clientWith(async (_input, _annotations, onProgress) => {
      onProgress?.(0);
      onProgress?.(0.5);
      onProgress?.(1);
      return new Uint8Array([9]);
    });
    const progress: number[] = [];
    const onProgress: ProgressCallback = (p) => progress.push(p);
    await client.annotate(new Uint8Array([0]), [], onProgress);
    expect(progress).toEqual([0, 0.5, 1]);
  });

  it("preserva el name de AnnotateFailedError al cruzar el cliente (R30)", async () => {
    const client = clientWith(async () => {
      throw new AnnotateFailedError();
    });
    await expect(
      client.annotate(new Uint8Array([0]), []),
    ).rejects.toMatchObject({ name: "AnnotateFailedError" });
  });

  it("isPdfWorkerError reconoce AnnotateFailedError", () => {
    expect(isPdfWorkerError(new AnnotateFailedError())).toBe(true);
  });
});

describe("createPdfClient — sign", () => {
  const baseOptions: SignOptions = {
    pageIndex: 0,
    position: "center",
    widthPts: 50,
    image: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
  };

  function clientWith(sign: PdfWorkerApi["sign"]) {
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
      async compress(): Promise<CompressPdfResult> {
        return emptyCompressResult();
      },
      async protect(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async annotate(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      sign,
      async detectForm(): Promise<FormModel> {
        return { hasFields: false, fields: [] };
      },
      async fillForms(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async ocr(): Promise<OcrResult> {
        return { text: "" };
      },
    };
    return createPdfClient(api);
  }

  it("con API inyectada delega en sign con los bytes y las opciones (R11)", async () => {
    let capturedInput: Uint8Array | undefined;
    let capturedOptions: SignOptions | undefined;
    const expected = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const client = clientWith(async (input, options) => {
      capturedInput = input;
      capturedOptions = options;
      return expected;
    });
    const result = await client.sign(new Uint8Array([1, 2]), baseOptions);
    expect(capturedInput && Array.from(capturedInput)).toEqual([1, 2]);
    expect(capturedOptions).toEqual(baseOptions);
    expect(result).toEqual(expected);
  });

  it("reenvía el callback de progreso al sign (R11)", async () => {
    const client = clientWith(async (_input, _options, onProgress) => {
      onProgress?.(0);
      onProgress?.(0.5);
      onProgress?.(1);
      return new Uint8Array([9]);
    });
    const progress: number[] = [];
    const onProgress: ProgressCallback = (p) => progress.push(p);
    await client.sign(new Uint8Array([0]), baseOptions, onProgress);
    expect(progress).toEqual([0, 0.5, 1]);
  });

  it("preserva el name de SignFailedError al cruzar el cliente (R12)", async () => {
    const client = clientWith(async () => {
      throw new SignFailedError();
    });
    await expect(
      client.sign(new Uint8Array([0]), baseOptions),
    ).rejects.toMatchObject({ name: "SignFailedError" });
  });

  it("isPdfWorkerError reconoce SignFailedError (R12)", () => {
    expect(isPdfWorkerError(new SignFailedError())).toBe(true);
  });
});

describe("createPdfClient — detectForm / fillForms", () => {
  function clientWith(
    detectForm: PdfWorkerApi["detectForm"],
    fillForms: PdfWorkerApi["fillForms"],
  ) {
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
      async compress(): Promise<CompressPdfResult> {
        return emptyCompressResult();
      },
      async protect(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async annotate(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async sign(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      detectForm,
      fillForms,
      async ocr(): Promise<OcrResult> {
        return { text: "" };
      },
    };
    return createPdfClient(api);
  }

  it("fillForms vía cliente inyectado rellena y opcional aplana (R17,R18)", async () => {
    const model: FormModel = {
      hasFields: true,
      fields: [{ name: "nombre", type: "text", value: "" }],
    };
    let capturedInput: Uint8Array | undefined;
    let capturedFlatten: boolean | undefined;
    const expected = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const client = clientWith(
      async () => model,
      async (input, options) => {
        capturedInput = input;
        capturedFlatten = options.flatten;
        return expected;
      },
    );

    const detected = await client.detectForm(new Uint8Array([1, 2]));
    expect(detected).toEqual(model);

    const out = await client.fillForms(new Uint8Array([3, 4]), {
      fills: [{ name: "nombre", kind: "text", value: "Ada" }],
      flatten: true,
    });
    expect(capturedInput && Array.from(capturedInput)).toEqual([3, 4]);
    expect(capturedFlatten).toBe(true);
    expect(out).toEqual(expected);
  });

  it("reenvía el callback de progreso al fillForms (R19)", async () => {
    const client = clientWith(
      async () => ({ hasFields: false, fields: [] }),
      async (_input, _options, onProgress) => {
        onProgress?.(0);
        onProgress?.(0.5);
        onProgress?.(1);
        return new Uint8Array([9]);
      },
    );
    const progress: number[] = [];
    const onProgress: ProgressCallback = (p) => progress.push(p);
    await client.fillForms(
      new Uint8Array([0]),
      { fills: [], flatten: false },
      onProgress,
    );
    expect(progress).toEqual([0, 0.5, 1]);
  });

  it("preserva el name de FillFormFailedError al cruzar el cliente (R21)", async () => {
    const client = clientWith(
      async () => ({ hasFields: false, fields: [] }),
      async () => {
        throw new FillFormFailedError();
      },
    );
    await expect(
      client.fillForms(new Uint8Array([0]), {
        fills: [{ name: "x", kind: "text", value: "y" }],
        flatten: false,
      }),
    ).rejects.toMatchObject({ name: "FillFormFailedError" });
  });

  it("isPdfWorkerError reconoce FillFormFailedError (R21)", () => {
    expect(isPdfWorkerError(new FillFormFailedError())).toBe(true);
  });
});

describe("createPdfClient — ocr", () => {
  function clientWith(ocr: PdfWorkerApi["ocr"]) {
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
      async compress(): Promise<CompressPdfResult> {
        return emptyCompressResult();
      },
      async protect(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async annotate(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async sign(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async detectForm(): Promise<FormModel> {
        return { hasFields: false, fields: [] };
      },
      async fillForms(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      ocr,
    };
    return createPdfClient(api);
  }

  it("con API inyectada devuelve el OcrResult del worker (R23)", async () => {
    const expected: OcrResult = {
      text: "hola mundo",
      pdfBytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
    };
    const client = clientWith(async () => expected);
    const result = await client.ocr(
      [{ bytes: new Uint8Array([1]), mimeType: "image/png" }],
      { language: "spa", output: "both" },
    );
    expect(result).toEqual(expected);
  });

  it("reenvía el callback de progreso al ocr [0, 0.5, 1] (R24)", async () => {
    const client = clientWith(async (_pages, _options, onProgress) => {
      onProgress?.(0);
      onProgress?.(0.5);
      onProgress?.(1);
      return { text: "x" };
    });
    const progress: number[] = [];
    const onProgress: ProgressCallback = (p) => progress.push(p);
    await client.ocr(
      [{ bytes: new Uint8Array([1]), mimeType: "image/png" }],
      { language: "eng", output: "text" },
      onProgress,
    );
    expect(progress).toEqual([0, 0.5, 1]);
  });

  it("preserva el name de OcrFailedError al cruzar el cliente (R25)", async () => {
    const client = clientWith(async () => {
      throw new OcrFailedError();
    });
    await expect(
      client.ocr([], { language: "eng", output: "text" }),
    ).rejects.toMatchObject({ name: "OcrFailedError" });
  });

  it("isPdfWorkerError reconoce OcrFailedError (R25)", () => {
    expect(isPdfWorkerError(new OcrFailedError())).toBe(true);
  });
});
