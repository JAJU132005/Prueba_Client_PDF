import { PDFDocument } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";

import {
  INVISIBLE_TEXT_OPACITY,
  OCR_LANGUAGES,
  OCR_MIN_WORD_FONT_SIZE,
  OCR_PAGE_SEPARATOR,
  buildSearchablePdf,
  layoutInvisibleText,
  ocrImages,
  ocrLanguageLabel,
  wordFontSize,
  type OcrEngine,
  type OcrImageInput,
  type OcrPageRecognition,
  type OcrWord,
} from "@/pdf/ocrPdf";
import { OcrFailedError } from "@/pdf/types";

/** PNG rojo de dimensiones conocidas (generado offline; header IHDR = w×h). */
const PNG_120x80 =
  "iVBORw0KGgoAAAANSUhEUgAAAHgAAABQCAIAAABd+SbeAAAAqElEQVR4nO3QAQkAIBDAQDN9/wDGsoXCPFiAcWvP6ELr+cEngQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnSrAwF+9IYbxA2QAAAAAElFTkSuQmCC";
const PNG_60x40 =
  "iVBORw0KGgoAAAANSUhEUgAAADwAAAAoCAIAAAAt2Q6oAAAAQUlEQVR4nO3OAQkAIBAAsc/0/QMYyxieMFiAzdn9zjwfSIdJS0sHSEtLB0hLSwdIS0sHSEtLB0hLSwdIS0sHfJm+N6/9F+Owu+sAAAAASUVORK5CYII=";

function pngInput(base64: string): OcrImageInput {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return { bytes, mimeType: "image/png" };
}

/** Motor falso determinista: devuelve, por página, texto y palabras fijados. */
function fakeEngine(
  pages: { text: string; words?: OcrWord[] }[],
): OcrEngine & { calls: { index: number; language: string }[] } {
  let index = 0;
  const calls: { index: number; language: string }[] = [];
  return {
    calls,
    async recognize(
      _image: OcrImageInput,
      language: string,
    ): Promise<OcrPageRecognition> {
      const i = index++;
      calls.push({ index: i, language });
      return { text: pages[i].text, words: pages[i].words ?? [] };
    },
    async terminate() {
      // no-op
    },
  };
}

describe("ocrPdf — modelo de idioma (R1, R2)", () => {
  it("OCR_LANGUAGES no está vacío e incluye spa y eng (R1)", () => {
    expect(OCR_LANGUAGES.length).toBeGreaterThan(0);
    expect(OCR_LANGUAGES).toContain("spa");
    expect(OCR_LANGUAGES).toContain("eng");
  });

  it("ocrLanguageLabel devuelve un string no vacío por idioma (R2)", () => {
    for (const lang of OCR_LANGUAGES) {
      expect(ocrLanguageLabel(lang).trim().length).toBeGreaterThan(0);
    }
  });
});

describe("ocrPdf — catálogo ampliado #32 (R1, R2, R3)", () => {
  it("OCR_LANGUAGES tiene > 6 idiomas, incluye spa/eng y ≥ 1 nuevo (#32 R1)", () => {
    expect(OCR_LANGUAGES.length).toBeGreaterThan(6);
    expect(OCR_LANGUAGES).toContain("spa");
    expect(OCR_LANGUAGES).toContain("eng");
    // Al menos un código fuera del catálogo base de #26.
    const base = new Set(["spa", "eng", "fra", "deu", "por", "ita"]);
    expect(OCR_LANGUAGES.some((lang) => !base.has(lang))).toBe(true);
  });

  it("OCR_LANGUAGES no contiene duplicados (#32 R2)", () => {
    expect(new Set(OCR_LANGUAGES).size).toBe(OCR_LANGUAGES.length);
  });

  it("ocrLanguageLabel devuelve etiqueta no vacía por idioma (#32 R3)", () => {
    for (const lang of OCR_LANGUAGES) {
      expect(ocrLanguageLabel(lang).trim().length).toBeGreaterThan(0);
    }
  });
});

describe("ocrPdf — tamaño de fuente por caja #32 (R11, R12, R13, R14, R16)", () => {
  it("wordFontSize = altura de caja cuando ≥ OCR_MIN_WORD_FONT_SIZE (#32 R11)", () => {
    const word: OcrWord = { text: "alto", x0: 5, y0: 10, x1: 40, y1: 40 };
    expect(word.y1 - word.y0).toBeGreaterThanOrEqual(OCR_MIN_WORD_FONT_SIZE);
    expect(wordFontSize(word)).toBe(word.y1 - word.y0);
  });

  it("layoutInvisibleText usa size = y1 - y0 con caja alta (#32 R11)", () => {
    const word: OcrWord = { text: "alto", x0: 5, y0: 10, x1: 40, y1: 40 };
    const ops = layoutInvisibleText([word], 100);
    expect(ops[0].size).toBe(word.y1 - word.y0);
  });

  it("caja más baja que el mínimo → OCR_MIN_WORD_FONT_SIZE (#32 R13)", () => {
    expect(OCR_MIN_WORD_FONT_SIZE).toBeGreaterThan(0);
    const word: OcrWord = { text: "bajo", x0: 0, y0: 0, x1: 10, y1: 1 };
    expect(word.y1 - word.y0).toBeLessThan(OCR_MIN_WORD_FONT_SIZE);
    expect(wordFontSize(word)).toBe(OCR_MIN_WORD_FONT_SIZE);
    const ops = layoutInvisibleText([word], 50);
    expect(ops[0].size).toBe(OCR_MIN_WORD_FONT_SIZE);
  });

  it("posiciona x = x0, y = pageHeight - y1; 3 palabras → 3 ops (#32 R12, R14)", () => {
    const words: OcrWord[] = [
      { text: "uno", x0: 3, y0: 5, x1: 20, y1: 25 },
      { text: "dos", x0: 30, y0: 5, x1: 50, y1: 25 },
      { text: "tres", x0: 60, y0: 5, x1: 90, y1: 25 },
    ];
    const pageHeight = 200;
    const ops = layoutInvisibleText(words, pageHeight);
    expect(ops).toHaveLength(3);
    expect(ops.map((o) => o.text)).toEqual(["uno", "dos", "tres"]);
    expect(ops[0].x).toBe(3);
    expect(ops[0].y).toBe(pageHeight - 25);
  });

  it("A5 determinista: palabra conocida del motor → op exacta y PDF válido (#32 R15, R16)", async () => {
    const word: OcrWord = { text: "HOLA", x0: 12, y0: 8, x1: 70, y1: 30 };
    const pageHeight = 80;

    // (1) El mapeo caja→coords PDF es lógica pura y determinista.
    const [op] = layoutInvisibleText([word], pageHeight);
    expect(op.text).toBe("HOLA");
    expect(op.x).toBe(word.x0);
    expect(op.y).toBe(pageHeight - word.y1);
    expect(op.size).toBe(word.y1 - word.y0);

    // (2) Un motor falso que devuelve esa palabra produce el mismo
    //     posicionamiento a través de ocrImages → buildSearchablePdf.
    const engine = fakeEngine([{ text: "HOLA", words: [word] }]);
    const result = await ocrImages([pngInput(PNG_120x80)], engine, {
      language: "eng",
      output: "searchable-pdf",
    });
    const withWord = result.pdfBytes as Uint8Array;
    const doc = await PDFDocument.load(withWord);
    expect(doc.getPageCount()).toBe(1);

    // (3) La página con la palabra pesa más que sin ella.
    const withoutWord = await buildSearchablePdf([
      { image: pngInput(PNG_120x80), words: [] },
    ]);
    expect(withWord.byteLength).toBeGreaterThan(withoutWord.byteLength);
  });

  it("progreso #32 con 2 páginas en [0,1], último 1, sin tocar el DOM (#32 R17, R24)", async () => {
    const createElement = vi.spyOn(document, "createElement");
    const engine: OcrEngine = {
      async recognize(_image, _language, onProgress) {
        onProgress?.(0.5);
        return { text: "p", words: [] };
      },
      async terminate() {
        // no-op
      },
    };
    const progress: number[] = [];
    await ocrImages(
      [pngInput(PNG_120x80), pngInput(PNG_60x40)],
      engine,
      { language: "eng", output: "text" },
      (p) => progress.push(p),
    );
    for (const p of progress) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
    expect(progress[progress.length - 1]).toBe(1);
    expect(createElement).not.toHaveBeenCalled();
    createElement.mockRestore();
  });
});

describe("ocrPdf — layoutInvisibleText (R14, R15, R16)", () => {
  it("produce una operación por palabra con su texto (R14)", () => {
    const words: OcrWord[] = [
      { text: "uno", x0: 1, y0: 2, x1: 3, y1: 4 },
      { text: "dos", x0: 5, y0: 6, x1: 7, y1: 8 },
      { text: "tres", x0: 9, y0: 10, x1: 11, y1: 12 },
    ];
    const ops = layoutInvisibleText(words, 100);
    expect(ops).toHaveLength(3);
    expect(ops.map((o) => o.text)).toEqual(["uno", "dos", "tres"]);
  });

  it("voltea la Y a bottom-left (y = pageHeight - word.y1) (R15)", () => {
    const words: OcrWord[] = [{ text: "x", x0: 0, y0: 0, x1: 10, y1: 30 }];
    const ops = layoutInvisibleText(words, 80);
    expect(ops[0].y).toBe(80 - 30);
    expect(ops[0].x).toBe(0);
  });

  it("INVISIBLE_TEXT_OPACITY es 0 (R16)", () => {
    expect(INVISIBLE_TEXT_OPACITY).toBe(0);
  });
});

describe("ocrPdf — buildSearchablePdf (R13, R17, R18)", () => {
  it("una página por entrada y tamaño de página = px de la imagen (R13, R17)", async () => {
    const bytes = await buildSearchablePdf([
      { image: pngInput(PNG_120x80), words: [] },
      { image: pngInput(PNG_60x40), words: [] },
    ]);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
    const [p0, p1] = doc.getPages();
    expect(p0.getWidth()).toBe(120);
    expect(p0.getHeight()).toBe(80);
    expect(p1.getWidth()).toBe(60);
    expect(p1.getHeight()).toBe(40);
  });

  it("una página con palabras pesa más que sin palabras (ambas válidas) (R18)", async () => {
    const withWords = await buildSearchablePdf([
      {
        image: pngInput(PNG_120x80),
        words: [
          { text: "hola", x0: 10, y0: 10, x1: 40, y1: 30 },
          { text: "mundo", x0: 45, y0: 10, x1: 90, y1: 30 },
        ],
      },
    ]);
    const withoutWords = await buildSearchablePdf([
      { image: pngInput(PNG_120x80), words: [] },
    ]);
    expect(withWords.byteLength).toBeGreaterThan(withoutWords.byteLength);
    const a = await PDFDocument.load(withWords);
    const b = await PDFDocument.load(withoutWords);
    expect(a.getPageCount()).toBe(1);
    expect(b.getPageCount()).toBe(1);
  });
});

describe("ocrPdf — ocrImages (R3–R13, R19)", () => {
  it("una imagen con texto conocido → ese texto (A5, R6)", async () => {
    const engine = fakeEngine([{ text: "HELLO WORLD" }]);
    const result = await ocrImages(
      [pngInput(PNG_120x80)],
      engine,
      { language: "eng", output: "text" },
    );
    expect(result.text).toBe("HELLO WORLD");
  });

  it("concatena páginas con OCR_PAGE_SEPARATOR y llama recognize en orden (R3, R5)", async () => {
    const engine = fakeEngine([{ text: "AAA" }, { text: "BBB" }]);
    const result = await ocrImages(
      [pngInput(PNG_120x80), pngInput(PNG_60x40)],
      engine,
      { language: "spa", output: "text" },
    );
    expect(result.text).toBe("AAA" + OCR_PAGE_SEPARATOR + "BBB");
    expect(engine.calls.map((c) => c.index)).toEqual([0, 1]);
  });

  it("pasa options.language al motor en cada llamada (R4)", async () => {
    const engine = fakeEngine([{ text: "a" }, { text: "b" }]);
    await ocrImages(
      [pngInput(PNG_120x80), pngInput(PNG_60x40)],
      engine,
      { language: "fra", output: "text" },
    );
    expect(engine.calls.map((c) => c.language)).toEqual(["fra", "fra"]);
  });

  it("output 'text' no incluye pdfBytes (R12)", async () => {
    const engine = fakeEngine([{ text: "x" }]);
    const result = await ocrImages([pngInput(PNG_120x80)], engine, {
      language: "eng",
      output: "text",
    });
    expect(result.pdfBytes).toBeUndefined();
  });

  it("output 'both'/'searchable-pdf' incluye pdfBytes con una página por entrada (R13)", async () => {
    const engine = fakeEngine([{ text: "a" }, { text: "b" }]);
    const both = await ocrImages(
      [pngInput(PNG_120x80), pngInput(PNG_60x40)],
      engine,
      { language: "eng", output: "both" },
    );
    expect(both.pdfBytes).toBeDefined();
    const doc = await PDFDocument.load(both.pdfBytes as Uint8Array);
    expect(doc.getPageCount()).toBe(2);

    const engine2 = fakeEngine([{ text: "a" }]);
    const onlyPdf = await ocrImages([pngInput(PNG_120x80)], engine2, {
      language: "eng",
      output: "searchable-pdf",
    });
    expect(onlyPdf.pdfBytes).toBeDefined();
  });

  it("pages vacío → OcrFailedError sin invocar al motor (R7)", async () => {
    const engine = fakeEngine([]);
    await expect(
      ocrImages([], engine, { language: "eng", output: "text" }),
    ).rejects.toBeInstanceOf(OcrFailedError);
    expect(engine.calls).toHaveLength(0);
  });

  it("idioma inválido → OcrFailedError sin invocar al motor (R8)", async () => {
    const engine = fakeEngine([{ text: "x" }]);
    await expect(
      ocrImages([pngInput(PNG_120x80)], engine, {
        language: "klingon" as never,
        output: "text",
      }),
    ).rejects.toBeInstanceOf(OcrFailedError);
    expect(engine.calls).toHaveLength(0);
  });

  it("progreso real: todo en [0,1], último 1, y ≈0.25/≈0.75 a mitad de cada página (R9, R10, R11)", async () => {
    // Motor que emite 0.5 a mitad de cada página (2 páginas).
    const engine: OcrEngine = {
      async recognize(_image, _language, onProgress) {
        onProgress?.(0.5);
        return { text: "p", words: [] };
      },
      async terminate() {
        // no-op
      },
    };
    const progress: number[] = [];
    await ocrImages(
      [pngInput(PNG_120x80), pngInput(PNG_60x40)],
      engine,
      { language: "eng", output: "text" },
      (p) => progress.push(p),
    );
    for (const p of progress) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
    expect(progress[progress.length - 1]).toBe(1);
    // A mitad de la página 1 (índice 0) → (0 + 0.5)/2 = 0.25.
    expect(progress).toContain(0.25);
    // A mitad de la página 2 (índice 1) → (1 + 0.5)/2 = 0.75.
    expect(progress).toContain(0.75);
  });

  it("camino feliz: texto conocido en 1-2 páginas → texto concatenado sin lanzar (#34 R1)", async () => {
    const one = fakeEngine([{ text: "SOLO UNA" }]);
    const single = await ocrImages([pngInput(PNG_120x80)], one, {
      language: "spa",
      output: "text",
    });
    expect(single.text).toBe("SOLO UNA");

    const two = fakeEngine([{ text: "PAGINA UNO" }, { text: "PAGINA DOS" }]);
    const multi = await ocrImages(
      [pngInput(PNG_120x80), pngInput(PNG_60x40)],
      two,
      { language: "eng", output: "text" },
    );
    expect(multi.text).toBe("PAGINA UNO" + OCR_PAGE_SEPARATOR + "PAGINA DOS");
  });

  it("el motor lanza en recognize → ocrImages rechaza con OcrFailedError (#34 R5)", async () => {
    const throwingEngine: OcrEngine = {
      async recognize(): Promise<OcrPageRecognition> {
        throw new Error("fallo crudo del motor WASM");
      },
      async terminate() {
        // no-op
      },
    };
    await expect(
      ocrImages([pngInput(PNG_120x80)], throwingEngine, {
        language: "eng",
        output: "text",
      }),
    ).rejects.toBeInstanceOf(OcrFailedError);
  });

  it("un OcrFailedError del motor se relanza tal cual (no se re-envuelve) (#34 R5)", async () => {
    const marker = new OcrFailedError("mensaje específico del motor");
    const failingEngine: OcrEngine = {
      async recognize(): Promise<OcrPageRecognition> {
        throw marker;
      },
      async terminate() {
        // no-op
      },
    };
    await expect(
      ocrImages([pngInput(PNG_120x80)], failingEngine, {
        language: "eng",
        output: "text",
      }),
    ).rejects.toBe(marker);
  });

  it("ocrImages corre en jsdom sin tocar el DOM (R19)", async () => {
    const createElement = vi.spyOn(document, "createElement");
    const engine = fakeEngine([{ text: "sin dom" }]);
    await ocrImages([pngInput(PNG_120x80)], engine, {
      language: "eng",
      output: "text",
    });
    expect(createElement).not.toHaveBeenCalled();
    createElement.mockRestore();
  });
});
