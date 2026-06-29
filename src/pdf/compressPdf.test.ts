import { PDFDocument, PDFName, PDFRawStream, type PDFDict } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";

import {
  COMPRESSION_LEVELS,
  compressPdf,
  extractImageXObjects,
  isRecompressibleImage,
  qualityForLevel,
  type CompressionLevel,
  type ImageRecompressor,
} from "@/pdf/compressPdf";
import { CompressFailedError, InvalidPdfError } from "@/pdf/types";

interface ImageSpec {
  filter?: string;
  colorSpace?: string;
  width?: number;
  height?: number;
  contents: Uint8Array;
  smask?: boolean;
  decode?: boolean;
  imageMask?: boolean;
}

/** Construye un PDF de 1 página con un XObject de imagen sintético (raw stream). */
async function makePdfWithImage(spec: ImageSpec): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([100, 100]);
  const ctx = doc.context;
  const literal: Record<string, unknown> = {
    Type: "XObject",
    Subtype: "Image",
    Width: spec.width ?? 64,
    Height: spec.height ?? 64,
    BitsPerComponent: 8,
    Filter: spec.filter ?? "DCTDecode",
    ColorSpace: spec.colorSpace ?? "DeviceRGB",
    Length: spec.contents.length,
  };
  if (spec.decode) {
    literal.Decode = [1, 0, 1, 0, 1, 0];
  }
  if (spec.imageMask) {
    literal.ImageMask = true;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- literal dict de pdf-lib
  const dict = ctx.obj(literal as any) as unknown as PDFDict;
  const stream = PDFRawStream.of(dict, spec.contents);
  const ref = ctx.register(stream);
  page.node.setXObject(PDFName.of("Im0"), ref);

  if (spec.smask) {
    const smaskContents = new Uint8Array([1, 2, 3, 4]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- literal dict de pdf-lib
    const smaskDict = ctx.obj({
      Type: "XObject",
      Subtype: "Image",
      Width: spec.width ?? 64,
      Height: spec.height ?? 64,
      BitsPerComponent: 8,
      Filter: "DCTDecode",
      ColorSpace: "DeviceGray",
      Length: smaskContents.length,
    } as any) as unknown as PDFDict;
    const smaskRef = ctx.register(PDFRawStream.of(smaskDict, smaskContents));
    dict.set(PDFName.of("SMask"), smaskRef);
  }

  return doc.save();
}

/** PDF de solo páginas, sin imágenes. */
async function makePagesPdf(n: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < n; i++) {
    doc.addPage([100, 100]);
  }
  return doc.save();
}

/** Devuelve los bytes crudos del primer XObject de imagen de un PDF. */
async function firstImageContents(bytes: Uint8Array): Promise<number[]> {
  const doc = await PDFDocument.load(bytes);
  const images = extractImageXObjects(doc);
  const stream = doc.context.lookup(images[0].ref);
  if (!(stream instanceof PDFRawStream)) {
    throw new Error("no se encontró el XObject de imagen");
  }
  return Array.from(stream.contents);
}

/** Recompresor falso que siempre devuelve `out`, registrando sus argumentos. */
function fixedRecompressor(out: Uint8Array): {
  fn: ImageRecompressor;
  calls: { mimeType: string; quality: number; byteLength: number }[];
} {
  const calls: { mimeType: string; quality: number; byteLength: number }[] = [];
  const fn: ImageRecompressor = async (bytes, mimeType, quality) => {
    calls.push({ mimeType, quality, byteLength: bytes.byteLength });
    return out;
  };
  return { fn, calls };
}

describe("COMPRESSION_LEVELS y qualityForLevel", () => {
  it("expone exactamente low/medium/high en ese orden (R1)", () => {
    expect([...COMPRESSION_LEVELS]).toEqual(["low", "medium", "high"]);
  });

  it("devuelve una calidad en (0,1] para cada nivel (R2)", () => {
    for (const level of COMPRESSION_LEVELS) {
      const q = qualityForLevel(level);
      expect(q).toBeGreaterThan(0);
      expect(q).toBeLessThanOrEqual(1);
    }
  });

  it("mapea los niveles a calidades crecientes high>medium>low (R3)", () => {
    expect(qualityForLevel("high")).toBeGreaterThan(qualityForLevel("medium"));
    expect(qualityForLevel("medium")).toBeGreaterThan(qualityForLevel("low"));
  });
});

describe("isRecompressibleImage", () => {
  it("es true para DCTDecode DeviceRGB sin SMask (R6)", () => {
    expect(
      isRecompressibleImage({
        filter: "DCTDecode",
        colorSpace: "DeviceRGB",
        hasSMask: false,
      }),
    ).toBe(true);
  });

  it("es false para un filtro no soportado (FlateDecode) (R6, R7)", () => {
    expect(
      isRecompressibleImage({
        filter: "FlateDecode",
        colorSpace: "DeviceRGB",
        hasSMask: false,
      }),
    ).toBe(false);
  });

  it("es false para DCTDecode DeviceRGB con SMask (R6, R7)", () => {
    expect(
      isRecompressibleImage({
        filter: "DCTDecode",
        colorSpace: "DeviceRGB",
        hasSMask: true,
      }),
    ).toBe(false);
  });

  it("es false para espacios de color no-RGB y filtros no soportados (R7)", () => {
    const nonRgbSpaces = ["DeviceGray", "DeviceCMYK", "Indexed", "ICCBased"];
    for (const colorSpace of nonRgbSpaces) {
      expect(
        isRecompressibleImage({
          filter: "DCTDecode",
          colorSpace,
          hasSMask: false,
        }),
      ).toBe(false);
    }
    for (const filter of ["JPXDecode", "CCITTFaxDecode"]) {
      expect(
        isRecompressibleImage({
          filter,
          colorSpace: "DeviceRGB",
          hasSMask: false,
        }),
      ).toBe(false);
    }
  });

  it("es false si actúa como máscara o invierte color (isSMask, /Decode, ImageMask) (R7)", () => {
    const base = {
      filter: "DCTDecode",
      colorSpace: "DeviceRGB",
      hasSMask: false,
    };
    expect(isRecompressibleImage({ ...base, isSMask: true })).toBe(false);
    expect(isRecompressibleImage({ ...base, hasDecode: true })).toBe(false);
    expect(isRecompressibleImage({ ...base, hasMask: true })).toBe(false);
    expect(isRecompressibleImage({ ...base, isImageMask: true })).toBe(false);
  });
});

describe("extractImageXObjects", () => {
  it("devuelve una entrada por XObject de imagen y ninguna sin imágenes (R4)", async () => {
    const withImage = await makePdfWithImage({
      contents: new Uint8Array(200).fill(7),
    });
    const docA = await PDFDocument.load(withImage);
    expect(extractImageXObjects(docA)).toHaveLength(1);

    const noImage = await makePagesPdf(2);
    const docB = await PDFDocument.load(noImage);
    expect(extractImageXObjects(docB)).toHaveLength(0);
  });

  it("incluye ref, width, height, filter, colorSpace, hasSMask y byteLength (R5)", async () => {
    const contents = new Uint8Array(120).fill(9);
    const bytes = await makePdfWithImage({
      contents,
      width: 32,
      height: 48,
      colorSpace: "DeviceRGB",
    });
    const doc = await PDFDocument.load(bytes);
    const [info] = extractImageXObjects(doc);
    expect(info.width).toBe(32);
    expect(info.height).toBe(48);
    expect(info.filter).toBe("DCTDecode");
    expect(info.colorSpace).toBe("DeviceRGB");
    expect(info.hasSMask).toBe(false);
    expect(info.byteLength).toBe(120);
    expect(info.recompressible).toBe(true);
    expect(info.ref).toBeDefined();
  });

  it("marca como no recomprimible una imagen DeviceGray (R7)", async () => {
    const bytes = await makePdfWithImage({
      contents: new Uint8Array(120).fill(3),
      colorSpace: "DeviceGray",
    });
    const doc = await PDFDocument.load(bytes);
    const [info] = extractImageXObjects(doc);
    expect(info.colorSpace).toBe("DeviceGray");
    expect(info.recompressible).toBe(false);
  });
});

describe("compressPdf — orquestación", () => {
  const level: CompressionLevel = "medium";

  it("produce un PDF estrictamente menor cuando la imagen se recomprime (R8)", async () => {
    const input = await makePdfWithImage({
      contents: new Uint8Array(8000).fill(0xab),
    });
    const { fn } = fixedRecompressor(new Uint8Array(40).fill(1));
    const result = await compressPdf(input, { level }, fn);
    expect(result.bytes.byteLength).toBeLessThan(input.byteLength);

    // El PDF resultante se recarga sin error y conserva páginas e imágenes. (R11)
    const out = await PDFDocument.load(result.bytes);
    expect(out.getPageCount()).toBe(1);
    expect(extractImageXObjects(out)).toHaveLength(1);
  });

  it("conserva el flujo original si la recompresión no encoge (R10)", async () => {
    const original = new Uint8Array(300).fill(0x5a);
    const input = await makePdfWithImage({ contents: original });
    const { fn } = fixedRecompressor(new Uint8Array(900).fill(2)); // más grande
    const result = await compressPdf(input, { level }, fn);

    expect(result.report.recompressedImages).toBe(0);
    expect(await firstImageContents(result.bytes)).toEqual(Array.from(original));
  });

  it("invoca recompress con MIME image/jpeg y la calidad del nivel (R9)", async () => {
    const input = await makePdfWithImage({
      contents: new Uint8Array(500).fill(0x11),
    });
    const { fn, calls } = fixedRecompressor(new Uint8Array(10));
    await compressPdf(input, { level: "high" }, fn);
    expect(calls).toHaveLength(1);
    expect(calls[0].mimeType).toBe("image/jpeg");
    expect(calls[0].quality).toBe(qualityForLevel("high"));
  });

  it("reasigna el flujo recomprimido con ColorSpace=DeviceRGB (R11)", async () => {
    const input = await makePdfWithImage({
      contents: new Uint8Array(2000).fill(0x33),
    });
    const { fn } = fixedRecompressor(new Uint8Array(20).fill(8));
    const result = await compressPdf(input, { level }, fn);
    const out = await PDFDocument.load(result.bytes);
    const [info] = extractImageXObjects(out);
    expect(info.filter).toBe("DCTDecode");
    expect(info.colorSpace).toBe("DeviceRGB");
    expect(await firstImageContents(result.bytes)).toEqual(
      Array.from(new Uint8Array(20).fill(8)),
    );
  });

  it("devuelve un report con todos los campos (R12)", async () => {
    const input = await makePdfWithImage({
      contents: new Uint8Array(2000).fill(0x44),
    });
    const { fn } = fixedRecompressor(new Uint8Array(20));
    const { report } = await compressPdf(input, { level }, fn);
    expect(report).toMatchObject({
      originalSize: input.byteLength,
      totalImages: 1,
      recompressibleImages: 1,
      recompressedImages: 1,
      minimalReduction: false,
    });
    expect(typeof report.compressedSize).toBe("number");
  });

  it("minimalReduction es true si y solo si recompressibleImages===0 (R13)", async () => {
    const noImages = await makePagesPdf(1);
    const { fn } = fixedRecompressor(new Uint8Array(1));
    const a = await compressPdf(noImages, { level }, fn);
    expect(a.report.minimalReduction).toBe(true);

    const withImage = await makePdfWithImage({
      contents: new Uint8Array(2000).fill(1),
    });
    const b = await compressPdf(withImage, { level }, fn);
    expect(b.report.minimalReduction).toBe(false);
  });

  it("sin imágenes recomprimibles no lanza y no invoca recompress (R14, R14b)", async () => {
    const input = await makePagesPdf(2);
    const spy = vi.fn(
      async (_bytes: Uint8Array, _mime: string, _q: number) =>
        new Uint8Array(1),
    );
    const result = await compressPdf(input, { level }, spy);
    expect(spy).not.toHaveBeenCalled();
    expect(result.report.recompressibleImages).toBe(0);
    expect(result.report.minimalReduction).toBe(true);
  });

  it("rechaza con InvalidPdfError ante bytes no-PDF (R15)", async () => {
    const { fn } = fixedRecompressor(new Uint8Array(1));
    await expect(
      compressPdf(new Uint8Array([0x68, 0x69]), { level }, fn),
    ).rejects.toBeInstanceOf(InvalidPdfError);
  });

  it("rechaza con CompressFailedError ante un nivel inválido (R16)", async () => {
    const input = await makePagesPdf(1);
    const { fn } = fixedRecompressor(new Uint8Array(1));
    await expect(
      compressPdf(
        input,
        { level: "ultra" as unknown as CompressionLevel },
        fn,
      ),
    ).rejects.toBeInstanceOf(CompressFailedError);
  });

  it("emite progreso en [0,1] terminando en 1, con y sin imágenes (R17, R17b)", async () => {
    const { fn } = fixedRecompressor(new Uint8Array(10));

    const withImage = await makePdfWithImage({
      contents: new Uint8Array(2000).fill(1),
    });
    const progressA: number[] = [];
    await compressPdf(withImage, { level }, fn, (p) => progressA.push(p));
    for (const p of progressA) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
    expect(progressA[progressA.length - 1]).toBe(1);

    const noImage = await makePagesPdf(1);
    const progressB: number[] = [];
    await compressPdf(noImage, { level }, fn, (p) => progressB.push(p));
    for (const p of progressB) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
    expect(progressB[progressB.length - 1]).toBe(1);
  });

  it("deja intacta una imagen no-RGB (DeviceGray) sin invocarla en recompress (R7b)", async () => {
    const original = new Uint8Array(2000).fill(0x6c);
    const input = await makePdfWithImage({
      contents: original,
      colorSpace: "DeviceGray",
    });
    const spy = vi.fn(
      async (_bytes: Uint8Array, _mime: string, _q: number) =>
        new Uint8Array(1),
    );
    const result = await compressPdf(input, { level }, spy);

    expect(spy).not.toHaveBeenCalled();
    expect(result.report.recompressibleImages).toBe(0);
    expect(await firstImageContents(result.bytes)).toEqual(
      Array.from(original),
    );
  });
});
