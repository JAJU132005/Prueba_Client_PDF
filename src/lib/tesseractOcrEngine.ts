import { createWorker, type Worker } from "tesseract.js";

import type {
  OcrEngine,
  OcrImageInput,
  OcrPageRecognition,
  OcrWord,
} from "@/pdf/ocrPdf";
import type { ProgressCallback } from "@/pdf/types";

/**
 * Rutas LOCALES (propio origen) de los assets de Tesseract.js. Se empaquetan en
 * `app/public/tesseract/` y se sirven desde la misma app, sin redes externas,
 * para cumplir cero-red y funcionar offline (PWA #15), igual que el worker de
 * pdf.js se sirve como asset estático de la propia app. Solo se referencian
 * rutas relativas del propio origen bajo `/tesseract/`. (R20)
 */
const TESSERACT_WORKER_PATH = "/tesseract/worker.min.js";
const TESSERACT_CORE_PATH = "/tesseract/";
const TESSERACT_LANG_PATH = "/tesseract/lang";

/** Estado de Tesseract que indica reconocimiento en curso (progreso real). */
const RECOGNIZING_STATUS = "recognizing text";

/** Callback de progreso activo durante la llamada en curso (una a la vez). */
let activeOnProgress: ProgressCallback | undefined;

/** Workers cacheados por idioma; se crean bajo demanda con rutas locales. */
const workersByLanguage = new Map<string, Promise<Worker>>();

function getWorker(language: string): Promise<Worker> {
  const existing = workersByLanguage.get(language);
  if (existing) {
    return existing;
  }
  // createWorker configurado con rutas del PROPIO ORIGEN (sin redes externas). (R20)
  const created = createWorker(language, undefined, {
    workerPath: TESSERACT_WORKER_PATH,
    corePath: TESSERACT_CORE_PATH,
    langPath: TESSERACT_LANG_PATH,
    // Progreso REAL: mapea la fracción emitida durante el reconocimiento. (R11)
    logger: (message: { status: string; progress: number }) => {
      if (message.status === RECOGNIZING_STATUS) {
        activeOnProgress?.(message.progress);
      }
    },
  });
  workersByLanguage.set(language, created);
  return created;
}

function toWords(rawWords: unknown): OcrWord[] {
  if (!Array.isArray(rawWords)) {
    return [];
  }
  const words: OcrWord[] = [];
  for (const raw of rawWords as Array<{
    text?: string;
    bbox?: { x0: number; y0: number; x1: number; y1: number };
  }>) {
    if (raw.bbox && typeof raw.text === "string") {
      words.push({
        text: raw.text,
        x0: raw.bbox.x0,
        y0: raw.bbox.y0,
        x1: raw.bbox.x1,
        y1: raw.bbox.y1,
      });
    }
  }
  return words;
}

/**
 * Motor OCR concreto (Tesseract.js). Configura los assets con rutas del propio
 * origen (`workerPath`/`corePath`/`langPath` bajo `/tesseract/…`), sin redes
 * externas, para cero-red y offline. Solo se ejercita dentro del Web Worker; no
 * se cubre en jsdom, igual que `pdfjsPageRasterizer`. (R20)
 */
export const tesseractOcrEngine: OcrEngine = {
  async recognize(
    image: OcrImageInput,
    language: string,
    onProgress?: ProgressCallback,
  ): Promise<OcrPageRecognition> {
    const worker = await getWorker(language);
    activeOnProgress = onProgress;
    try {
      const blob = new Blob([image.bytes as BlobPart], {
        type: image.mimeType,
      });
      const result = await worker.recognize(blob);
      return {
        text: result.data.text,
        words: toWords((result.data as { words?: unknown }).words),
      };
    } finally {
      activeOnProgress = undefined;
    }
  },

  async terminate(): Promise<void> {
    const workers = Array.from(workersByLanguage.values());
    workersByLanguage.clear();
    await Promise.all(
      workers.map(async (workerPromise) => {
        const worker = await workerPromise;
        await worker.terminate();
      }),
    );
  },
};
