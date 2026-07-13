import { createWorker, type Worker } from "tesseract.js";

import { createWorkerCache } from "@/lib/ocrWorkerCache";
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

/**
 * Crea un worker de Tesseract.js para `language` con rutas del PROPIO ORIGEN
 * (sin redes externas, R20) y `gzip: false` para que solicite el fichero PLANO
 * `<lang>.traineddata` (no `.gz`), coherente con el formato empaquetado (#34 R4).
 */
function createLanguageWorker(language: string): Promise<Worker> {
  return createWorker(language, undefined, {
    workerPath: TESSERACT_WORKER_PATH,
    corePath: TESSERACT_CORE_PATH,
    langPath: TESSERACT_LANG_PATH,
    // Ficheros de idioma PLANOS: pide `<lang>.traineddata` sin descomprimir. (#34 R4)
    gzip: false,
    // Progreso REAL: mapea la fracción emitida durante el reconocimiento. (R11)
    logger: (message: { status: string; progress: number }) => {
      if (message.status === RECOGNIZING_STATUS) {
        activeOnProgress?.(message.progress);
      }
    },
  });
}

/**
 * Workers cacheados por idioma con DESALOJO-EN-RECHAZO: si la creación de un
 * idioma falla, su promesa rechazada NO queda cacheada, permitiendo reintentos
 * (#34 R7, R8a, R8b, R9).
 */
const workerCache = createWorkerCache<Worker>(createLanguageWorker);

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
    const worker = await workerCache.get(language);
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
    const workers = workerCache.values();
    workerCache.clear();
    await Promise.all(
      workers.map(async (workerPromise) => {
        const worker = await workerPromise;
        await worker.terminate();
      }),
    );
  },
};
