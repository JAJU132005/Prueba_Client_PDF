import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { mergePdfs } from "@/pdf/merge";
import type { OcrEngine } from "@/pdf/ocrPdf";
import { organizePdf } from "@/pdf/organize";
import { probe } from "@/pdf/probe";
import { rotatePdf } from "@/pdf/rotate";
import { signPdf } from "@/pdf/signature";
import { splitPdf } from "@/pdf/split";
import type { PdfCryptoEngine } from "@/pdf/protectPdf";
import {
  AnnotateFailedError,
  InvalidPageOrderError,
  InvalidPdfError,
  InvalidRangeError,
  InvalidRotationError,
  OrganizeFailedError,
  ProbeFailedError,
  RedactFailedError,
  SignFailedError,
} from "@/pdf/types";
import { createPdfWorkerApi } from "@/workers/pdfWorkerApi";

async function makePdf(n: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < n; i++) {
    doc.addPage([100, 100]);
  }
  return doc.save();
}

/** PNG 1×1 válido e incrustable por pdf-lib (transparente). */
function makePng1x1(): Uint8Array {
  const base64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAen63NgAAAAASUVORK5CYII=";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

describe("createPdfWorkerApi", () => {
  it("delega en probe y resuelve al mismo resultado (R6, R8)", async () => {
    const api = createPdfWorkerApi();
    const result = await api.probe({ values: [1, 2] });
    expect(result).toEqual(probe({ values: [1, 2] }));
    expect(result).toEqual({ sum: 3, count: 2 });
  });

  it("reenvía el progreso emitido por probe terminando en 1 (R6)", async () => {
    const api = createPdfWorkerApi();
    const progress: number[] = [];
    await api.probe({ values: [1, 2, 3] }, (p) => progress.push(p));
    expect(progress.length).toBeGreaterThan(0);
    expect(progress[progress.length - 1]).toBe(1);
  });

  it("propaga ProbeFailedError como rechazo de Promise (R6)", async () => {
    const api = createPdfWorkerApi();
    await expect(api.probe({ values: [1, 2], fail: true })).rejects.toBeInstanceOf(
      ProbeFailedError,
    );
  });

  it("merge delega en mergePdfs y produce el mismo conteo de páginas (R15)", async () => {
    const api = createPdfWorkerApi();
    const a = await makePdf(2);
    const b = await makePdf(3);

    const viaApi = await api.merge([a, b]);
    const viaDomain = await mergePdfs([a, b]);

    const outApi = await PDFDocument.load(viaApi);
    const outDomain = await PDFDocument.load(viaDomain);
    expect(outApi.getPageCount()).toBe(5);
    expect(outApi.getPageCount()).toBe(outDomain.getPageCount());
  });

  it("merge propaga InvalidPdfError ante un input no-PDF (R15)", async () => {
    const api = createPdfWorkerApi();
    const valid = await makePdf(1);
    const invalid = new Uint8Array([0x68, 0x69]);
    await expect(api.merge([valid, invalid])).rejects.toBeInstanceOf(
      InvalidPdfError,
    );
  });

  it("split delega en splitPdf y produce el mismo conteo de páginas (R26)", async () => {
    const api = createPdfWorkerApi();
    const pdf5 = await makePdf(5);

    const viaApi = await api.split(pdf5, "1-3,5");
    const viaDomain = await splitPdf(pdf5, "1-3,5");

    const outApi = await PDFDocument.load(viaApi);
    const outDomain = await PDFDocument.load(viaDomain);
    expect(outApi.getPageCount()).toBe(4);
    expect(outApi.getPageCount()).toBe(outDomain.getPageCount());
  });

  it("split propaga InvalidRangeError ante un rango inválido (R26)", async () => {
    const api = createPdfWorkerApi();
    const pdf3 = await makePdf(3);
    await expect(api.split(pdf3, "9")).rejects.toBeInstanceOf(InvalidRangeError);
  });

  it("split propaga InvalidPdfError ante bytes no-PDF (R26)", async () => {
    const api = createPdfWorkerApi();
    const invalid = new Uint8Array([0x68, 0x69]);
    await expect(api.split(invalid, "1")).rejects.toBeInstanceOf(
      InvalidPdfError,
    );
  });

  it("rotate delega en rotatePdf y refleja la misma rotación en la salida (R28)", async () => {
    const api = createPdfWorkerApi();
    const pdf3 = await makePdf(3);

    const viaApi = await api.rotate(pdf3, { angle: 90, pages: "all" });
    const viaDomain = await rotatePdf(pdf3, { angle: 90, pages: "all" });

    const outApi = await PDFDocument.load(viaApi);
    const outDomain = await PDFDocument.load(viaDomain);
    const apiAngles = outApi.getPages().map((p) => p.getRotation().angle);
    const domainAngles = outDomain.getPages().map((p) => p.getRotation().angle);
    expect(apiAngles).toEqual([90, 90, 90]);
    expect(apiAngles).toEqual(domainAngles);
  });

  it("rotate propaga InvalidRotationError ante un ángulo inválido (R28)", async () => {
    const api = createPdfWorkerApi();
    const pdf3 = await makePdf(3);
    await expect(
      api.rotate(pdf3, { angle: 45, pages: "all" }),
    ).rejects.toBeInstanceOf(InvalidRotationError);
  });

  it("rotate propaga InvalidPdfError ante bytes no-PDF (R28)", async () => {
    const api = createPdfWorkerApi();
    const invalid = new Uint8Array([0x68, 0x69]);
    await expect(
      api.rotate(invalid, { angle: 90, pages: "all" }),
    ).rejects.toBeInstanceOf(InvalidPdfError);
  });

  it("organize delega en organizePdf y produce el mismo conteo/orden (R26)", async () => {
    const api = createPdfWorkerApi();
    const pdf3 = await makePdf(3);

    const viaApi = await api.organize(pdf3, [2, 0]);
    const viaDomain = await organizePdf(pdf3, [2, 0]);

    const outApi = await PDFDocument.load(viaApi);
    const outDomain = await PDFDocument.load(viaDomain);
    expect(outApi.getPageCount()).toBe(2);
    expect(outApi.getPageCount()).toBe(outDomain.getPageCount());
  });

  it("organize propaga InvalidPdfError ante bytes no-PDF (R26)", async () => {
    const api = createPdfWorkerApi();
    const invalid = new Uint8Array([0x68, 0x69]);
    await expect(api.organize(invalid, [0])).rejects.toBeInstanceOf(
      InvalidPdfError,
    );
  });

  it("organize propaga OrganizeFailedError ante pageOrder vacío (R26)", async () => {
    const api = createPdfWorkerApi();
    const pdf3 = await makePdf(3);
    await expect(api.organize(pdf3, [])).rejects.toBeInstanceOf(
      OrganizeFailedError,
    );
  });

  it("organize propaga InvalidPageOrderError ante índice fuera de rango (R26)", async () => {
    const api = createPdfWorkerApi();
    const pdf3 = await makePdf(3);
    await expect(api.organize(pdf3, [5])).rejects.toBeInstanceOf(
      InvalidPageOrderError,
    );
  });

  it("addWatermark delega en el dominio y conserva el conteo de páginas (R40)", async () => {
    const api = createPdfWorkerApi();
    const pdf3 = await makePdf(3);

    const viaApi = await api.addWatermark(pdf3, {
      mode: "text",
      text: "CONFIDENCIAL",
      image: null,
      position: "center",
      opacity: 0.3,
      angle: 45,
      fontSize: 24,
      pages: "all",
    });

    const outApi = await PDFDocument.load(viaApi);
    expect(outApi.getPageCount()).toBe(3);
  });

  it("addWatermark propaga InvalidPdfError ante bytes no-PDF (R40)", async () => {
    const api = createPdfWorkerApi();
    const invalid = new Uint8Array([0x68, 0x69]);
    await expect(
      api.addWatermark(invalid, {
        mode: "text",
        text: "CONFIDENCIAL",
        image: null,
        position: "center",
        opacity: 0.3,
        angle: 45,
        fontSize: 24,
        pages: "all",
      }),
    ).rejects.toBeInstanceOf(InvalidPdfError);
  });

  it("compress delega en compressPdf con un PDF sin imágenes → minimalReduction (R21)", async () => {
    // Recompresor falso: nunca debe invocarse sin imágenes recomprimibles.
    const api = createPdfWorkerApi(async () => new Uint8Array([1]));
    const pdf = await makePdf(2);
    const result = await api.compress(pdf, { level: "medium" });
    expect(result.report.minimalReduction).toBe(true);
    expect(result.report.recompressibleImages).toBe(0);
  });

  it("compress propaga InvalidPdfError ante bytes no-PDF (R22)", async () => {
    const api = createPdfWorkerApi(async () => new Uint8Array([1]));
    const invalid = new Uint8Array([0x68, 0x69]);
    await expect(
      api.compress(invalid, { level: "medium" }),
    ).rejects.toBeInstanceOf(InvalidPdfError);
  });

  it("protect delega en protectPdf con el motor inyectado (R16)", async () => {
    const expected = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    let calls = 0;
    const fakeEngine: PdfCryptoEngine = {
      async encrypt() {
        calls++;
        return expected;
      },
      async decrypt() {
        return new Uint8Array();
      },
    };
    const api = createPdfWorkerApi(async () => new Uint8Array([1]), fakeEngine);
    const result = await api.protect(new Uint8Array([1, 2]), {
      mode: "protect",
      password: "secreta",
    });
    expect(calls).toBe(1);
    expect(result).toBe(expected);
  });

  it("annotate delega en flattenAnnotations y conserva las páginas (R22, R23)", async () => {
    const api = createPdfWorkerApi();
    const pdf2 = await makePdf(2);
    const viaApi = await api.annotate(pdf2, [
      {
        id: "a",
        pageIndex: 0,
        kind: "rect",
        at: { x: 10, y: 10 },
        width: 20,
        height: 20,
        color: { r: 0, g: 0, b: 0 },
        thickness: 1,
      },
    ]);
    const out = await PDFDocument.load(viaApi);
    expect(out.getPageCount()).toBe(2);
  });

  it("annotate propaga AnnotateFailedError ante lista vacía (R31)", async () => {
    const api = createPdfWorkerApi();
    const pdf2 = await makePdf(2);
    await expect(api.annotate(pdf2, [])).rejects.toBeInstanceOf(
      AnnotateFailedError,
    );
  });

  it("annotate propaga InvalidPdfError ante bytes no-PDF (R28)", async () => {
    const api = createPdfWorkerApi();
    const invalid = new Uint8Array([0x68, 0x69]);
    await expect(
      api.annotate(invalid, [
        {
          id: "a",
          pageIndex: 0,
          kind: "text",
          at: { x: 1, y: 1 },
          text: "x",
          fontSize: 12,
          color: { r: 0, g: 0, b: 0 },
        },
      ]),
    ).rejects.toBeInstanceOf(InvalidPdfError);
  });

  it("sign delega en signPdf y produce el mismo resultado (R10)", async () => {
    const api = createPdfWorkerApi();
    const pdf2 = await makePdf(2);
    const png = makePng1x1();
    const options = {
      pageIndex: 1,
      position: "center" as const,
      widthPts: 40,
      image: png,
    };

    const viaApi = await api.sign(pdf2, options);
    const viaDomain = await signPdf(pdf2, options);

    const outApi = await PDFDocument.load(viaApi);
    const outDomain = await PDFDocument.load(viaDomain);
    expect(outApi.getPageCount()).toBe(2);
    expect(outApi.getPageCount()).toBe(outDomain.getPageCount());
  });

  it("sign propaga SignFailedError ante pageIndex fuera de rango (R10)", async () => {
    const api = createPdfWorkerApi();
    const pdf2 = await makePdf(2);
    await expect(
      api.sign(pdf2, {
        pageIndex: 9,
        position: "center",
        widthPts: 40,
        image: makePng1x1(),
      }),
    ).rejects.toBeInstanceOf(SignFailedError);
  });

  it("protect con contraseña vacía → ProtectFailedError sin tocar el motor (R17)", async () => {
    let touched = false;
    const fakeEngine: PdfCryptoEngine = {
      async encrypt() {
        touched = true;
        return new Uint8Array();
      },
      async decrypt() {
        touched = true;
        return new Uint8Array();
      },
    };
    const api = createPdfWorkerApi(async () => new Uint8Array([1]), fakeEngine);
    await expect(
      api.protect(new Uint8Array([1]), { mode: "protect", password: "" }),
    ).rejects.toMatchObject({ name: "ProtectFailedError" });
    expect(touched).toBe(false);
  });

  it("ocr delega en ocrImages con el motor inyectado y resuelve su texto (R21, R22)", async () => {
    const fakeOcrEngine: OcrEngine = {
      async recognize() {
        return { text: "TEXTO DEL MOTOR FALSO", words: [] };
      },
      async terminate() {
        // no-op
      },
    };
    const api = createPdfWorkerApi(
      async () => new Uint8Array([1]),
      {
        async encrypt() {
          return new Uint8Array();
        },
        async decrypt() {
          return new Uint8Array();
        },
      },
      fakeOcrEngine,
    );
    const result = await api.ocr(
      [{ bytes: new Uint8Array([0x89, 0x50]), mimeType: "image/png" }],
      { language: "spa", output: "text" },
    );
    expect(result.text).toBe("TEXTO DEL MOTOR FALSO");
    expect(result.pdfBytes).toBeUndefined();
  });

  it("redact delega en redactPdf: página redactada (imagen) + intacta (R3, R6, R9)", async () => {
    const api = createPdfWorkerApi();
    const pdf2 = await makePdf(2);
    const viaApi = await api.redact(pdf2, [
      { pageIndex: 0, bytes: makePng1x1(), mimeType: "image/png" },
    ]);
    const out = await PDFDocument.load(viaApi);
    // Conserva el conteo de páginas: 1 redactada (imagen) + 1 intacta (copiada).
    expect(out.getPageCount()).toBe(2);
  });

  it("redact propaga RedactFailedError ante lista vacía (R12)", async () => {
    const api = createPdfWorkerApi();
    const pdf2 = await makePdf(2);
    await expect(api.redact(pdf2, [])).rejects.toBeInstanceOf(
      RedactFailedError,
    );
  });

  it("redact propaga InvalidPdfError ante bytes no-PDF (R11)", async () => {
    const api = createPdfWorkerApi();
    const invalid = new Uint8Array([0x68, 0x69]);
    await expect(
      api.redact(invalid, [
        { pageIndex: 0, bytes: makePng1x1(), mimeType: "image/png" },
      ]),
    ).rejects.toBeInstanceOf(InvalidPdfError);
  });
});
