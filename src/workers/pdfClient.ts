import * as Comlink from "comlink";

import type { Annotation } from "@/pdf/annotate";
import type {
  CompressOptions,
  CompressPdfResult,
} from "@/pdf/compressPdf";
import type { FillFormsOptions, FormModel } from "@/pdf/fillForms";
import type { ImagesToPdfOptions } from "@/pdf/imagesToPdf";
import type { OcrImageInput, OcrOptions, OcrResult } from "@/pdf/ocrPdf";
import type { PageNumbersOptions } from "@/pdf/pageNumbers";
import type { ProtectOptions } from "@/pdf/protectPdf";
import type { RotateOptions } from "@/pdf/rotateOptions";
import type { SignOptions } from "@/pdf/signature";
import type { ProgressCallback } from "@/pdf/types";
import type { WatermarkOptions } from "@/pdf/watermark";
import type {
  PdfWorkerApi,
  ProbeInput,
  ProbeResult,
} from "@/workers/contract";

export interface PdfClient {
  probe(input: ProbeInput, onProgress?: ProgressCallback): Promise<ProbeResult>;
  /**
   * Une los PDFs `inputs` (en orden) en un único PDF y devuelve sus bytes. La
   * lógica corre en el worker; aquí solo se transporta la llamada. (R16)
   */
  merge(
    inputs: readonly Uint8Array[],
    onProgress?: ProgressCallback,
  ): Promise<Uint8Array>;
  /**
   * Extrae de `input` las páginas de `rangeSpec` y devuelve un único PDF. La
   * lógica corre en el worker; aquí solo se transporta la llamada. (R27)
   */
  split(
    input: Uint8Array,
    rangeSpec: string,
    onProgress?: ProgressCallback,
  ): Promise<Uint8Array>;
  /**
   * Rota las páginas de `input` según `options` y devuelve un único PDF. La
   * lógica corre en el worker; aquí solo se transporta la llamada. (R29)
   */
  rotate(
    input: Uint8Array,
    options: RotateOptions,
    onProgress?: ProgressCallback,
  ): Promise<Uint8Array>;
  /**
   * Reescribe `input` conservando solo las páginas de `pageOrder`, en ese orden,
   * y devuelve un único PDF. La lógica corre en el worker; aquí solo se
   * transporta la llamada. (R27)
   */
  organize(
    input: Uint8Array,
    pageOrder: readonly number[],
    onProgress?: ProgressCallback,
  ): Promise<Uint8Array>;
  /**
   * Construye un PDF (una imagen por página) a partir de `images` (JPG/PNG, en
   * orden) y devuelve sus bytes. La lógica corre en el worker; aquí solo se
   * transporta la llamada. (R35)
   */
  imagesToPdf(
    images: readonly Uint8Array[],
    options: ImagesToPdfOptions,
    onProgress?: ProgressCallback,
  ): Promise<Uint8Array>;
  /**
   * Dibuja un número en cada página de `input` según `options` y devuelve sus
   * bytes. La lógica corre en el worker; aquí solo se transporta la llamada.
   * (R31)
   */
  addPageNumbers(
    input: Uint8Array,
    options: PageNumbersOptions,
    onProgress?: ProgressCallback,
  ): Promise<Uint8Array>;
  /**
   * Superpone una marca (texto o imagen) en `input` según `options` y devuelve
   * sus bytes. La lógica corre en el worker; aquí solo se transporta la llamada.
   * (R41)
   */
  addWatermark(
    input: Uint8Array,
    options: WatermarkOptions,
    onProgress?: ProgressCallback,
  ): Promise<Uint8Array>;
  /**
   * Recomprime las imágenes de `input` según `options` y devuelve los bytes más
   * un reporte honesto. La lógica corre en el worker; aquí solo se transporta la
   * llamada. (R23)
   */
  compress(
    input: Uint8Array,
    options: CompressOptions,
    onProgress?: ProgressCallback,
  ): Promise<CompressPdfResult>;
  /**
   * Protege (cifra) o desbloquea (descifra) `input` según `options` y devuelve
   * los bytes resultantes. La lógica corre en el worker; aquí solo se transporta
   * la llamada. (R18)
   */
  protect(
    input: Uint8Array,
    options: ProtectOptions,
    onProgress?: ProgressCallback,
  ): Promise<Uint8Array>;
  /**
   * Aplana la capa de `annotations` sobre `input` y devuelve los bytes. La
   * lógica corre en el worker; aquí solo se transporta la llamada. (R22, R23)
   */
  annotate(
    input: Uint8Array,
    annotations: readonly Annotation[],
    onProgress?: ProgressCallback,
  ): Promise<Uint8Array>;
  /**
   * Coloca la imagen de firma de `options` en `input` (firma visual) y devuelve
   * los bytes. La lógica corre en el worker; aquí solo se transporta la llamada.
   * (R11)
   */
  sign(
    input: Uint8Array,
    options: SignOptions,
    onProgress?: ProgressCallback,
  ): Promise<Uint8Array>;
  /**
   * Detecta los campos AcroForm de `input` y devuelve el modelo del formulario.
   * La lógica corre en el worker; aquí solo se transporta la llamada. (R17, R18)
   */
  detectForm(input: Uint8Array): Promise<FormModel>;
  /**
   * Rellena (y opcionalmente aplana) el formulario de `input` según `options` y
   * devuelve los bytes. La lógica corre en el worker; aquí solo se transporta la
   * llamada. (R18, R19)
   */
  fillForms(
    input: Uint8Array,
    options: FillFormsOptions,
    onProgress?: ProgressCallback,
  ): Promise<Uint8Array>;
  /**
   * Reconoce el texto (OCR) de las páginas rasterizadas `pages` y devuelve el
   * `OcrResult` (texto y, opcionalmente, PDF buscable). La lógica corre en el
   * worker; aquí solo se transporta la llamada. (R23, R24)
   */
  ocr(
    pages: readonly OcrImageInput[],
    options: OcrOptions,
    onProgress?: ProgressCallback,
  ): Promise<OcrResult>;
  /** Libera el worker subyacente (no-op si la API fue inyectada). */
  dispose(): void;
}

/**
 * Nombres estables de los errores de dominio que cruzan el límite del worker.
 * Comlink serializa los `Error` preservando `name`, así que el cliente puede
 * reconocerlos en el hilo principal sin acceso a las clases originales.
 */
const PDF_WORKER_ERROR_NAMES = new Set<string>([
  "PdfWorkerError",
  "ProbeFailedError",
  "InvalidPdfError",
  "MergeFailedError",
  "InvalidRangeError",
  "SplitFailedError",
  "InvalidRotationError",
  "RotateFailedError",
  "OrganizeFailedError",
  "InvalidPageOrderError",
  "InvalidImageError",
  "ImagesToPdfFailedError",
  "PageNumbersFailedError",
  "WatermarkFailedError",
  "CompressFailedError",
  "IncorrectPasswordError",
  "ProtectFailedError",
  "AnnotateFailedError",
  "SignFailedError",
  "FillFormFailedError",
  "OcrFailedError",
]);

/**
 * Type guard: comprueba si `e` es un error de dominio del worker observando su
 * `name` estable (lo único que Comlink garantiza tras serializar el `Error`).
 */
export function isPdfWorkerError(e: unknown): e is Error {
  return (
    e instanceof Error && PDF_WORKER_ERROR_NAMES.has((e as Error).name)
  );
}

/**
 * Crea el cliente. Sin argumento: instancia el worker real (Vite) y lo envuelve
 * con Comlink. Con `injectedApi`: usa esa implementación sin crear ningún
 * Worker, para tests en jsdom.
 */
export function createPdfClient(injectedApi?: PdfWorkerApi): PdfClient {
  if (injectedApi !== undefined) {
    return {
      async probe(input, onProgress) {
        try {
          return await injectedApi.probe(input, onProgress);
        } catch (error) {
          throw error;
        }
      },
      async merge(inputs, onProgress) {
        try {
          // Rama inyectada (tests): el callback se pasa directo, sin Comlink.
          return await injectedApi.merge(inputs, onProgress);
        } catch (error) {
          throw error;
        }
      },
      async split(input, rangeSpec, onProgress) {
        try {
          // Rama inyectada (tests): el callback se pasa directo, sin Comlink.
          return await injectedApi.split(input, rangeSpec, onProgress);
        } catch (error) {
          throw error;
        }
      },
      async rotate(input, options, onProgress) {
        try {
          // Rama inyectada (tests): el callback se pasa directo, sin Comlink.
          return await injectedApi.rotate(input, options, onProgress);
        } catch (error) {
          throw error;
        }
      },
      async organize(input, pageOrder, onProgress) {
        try {
          // Rama inyectada (tests): el callback se pasa directo, sin Comlink.
          return await injectedApi.organize(input, pageOrder, onProgress);
        } catch (error) {
          throw error;
        }
      },
      async imagesToPdf(images, options, onProgress) {
        try {
          // Rama inyectada (tests): el callback se pasa directo, sin Comlink.
          return await injectedApi.imagesToPdf(images, options, onProgress);
        } catch (error) {
          throw error;
        }
      },
      async addPageNumbers(input, options, onProgress) {
        try {
          // Rama inyectada (tests): el callback se pasa directo, sin Comlink.
          return await injectedApi.addPageNumbers(input, options, onProgress);
        } catch (error) {
          throw error;
        }
      },
      async addWatermark(input, options, onProgress) {
        try {
          // Rama inyectada (tests): el callback se pasa directo, sin Comlink.
          return await injectedApi.addWatermark(input, options, onProgress);
        } catch (error) {
          throw error;
        }
      },
      async compress(input, options, onProgress) {
        try {
          // Rama inyectada (tests): el callback se pasa directo, sin Comlink.
          return await injectedApi.compress(input, options, onProgress);
        } catch (error) {
          throw error;
        }
      },
      async protect(input, options, onProgress) {
        try {
          // Rama inyectada (tests): el callback se pasa directo, sin Comlink.
          return await injectedApi.protect(input, options, onProgress);
        } catch (error) {
          throw error;
        }
      },
      async annotate(input, annotations, onProgress) {
        try {
          // Rama inyectada (tests): el callback se pasa directo, sin Comlink.
          return await injectedApi.annotate(input, annotations, onProgress);
        } catch (error) {
          throw error;
        }
      },
      async sign(input, options, onProgress) {
        try {
          // Rama inyectada (tests): el callback se pasa directo, sin Comlink.
          return await injectedApi.sign(input, options, onProgress);
        } catch (error) {
          throw error;
        }
      },
      async detectForm(input) {
        try {
          return await injectedApi.detectForm(input);
        } catch (error) {
          throw error;
        }
      },
      async fillForms(input, options, onProgress) {
        try {
          // Rama inyectada (tests): el callback se pasa directo, sin Comlink.
          return await injectedApi.fillForms(input, options, onProgress);
        } catch (error) {
          throw error;
        }
      },
      async ocr(pages, options, onProgress) {
        try {
          // Rama inyectada (tests): el callback se pasa directo, sin Comlink.
          return await injectedApi.ocr(pages, options, onProgress);
        } catch (error) {
          throw error;
        }
      },
      dispose() {
        // No-op: la API fue inyectada, no hay worker que liberar.
      },
    };
  }

  const worker = new Worker(
    new URL("./pdf.worker.ts", import.meta.url),
    { type: "module" },
  );
  const remote = Comlink.wrap<PdfWorkerApi>(worker);

  return {
    async probe(input, onProgress) {
      try {
        return await remote.probe(
          input,
          onProgress ? Comlink.proxy(onProgress) : undefined,
        );
      } catch (error) {
        throw error;
      }
    },
    async merge(inputs, onProgress) {
      try {
        // El trabajo pesado (pdf-lib) corre en el worker; el callback de
        // progreso cruza el límite vía Comlink.proxy. (R16, R17)
        return await remote.merge(
          inputs,
          onProgress ? Comlink.proxy(onProgress) : undefined,
        );
      } catch (error) {
        throw error;
      }
    },
    async split(input, rangeSpec, onProgress) {
      try {
        // El trabajo pesado (pdf-lib) corre en el worker; el callback de
        // progreso cruza el límite vía Comlink.proxy. (R27, R28)
        return await remote.split(
          input,
          rangeSpec,
          onProgress ? Comlink.proxy(onProgress) : undefined,
        );
      } catch (error) {
        throw error;
      }
    },
    async rotate(input, options, onProgress) {
      try {
        // El trabajo pesado (pdf-lib) corre en el worker; el callback de
        // progreso cruza el límite vía Comlink.proxy. (R29, R30)
        return await remote.rotate(
          input,
          options,
          onProgress ? Comlink.proxy(onProgress) : undefined,
        );
      } catch (error) {
        throw error;
      }
    },
    async organize(input, pageOrder, onProgress) {
      try {
        // El trabajo pesado (pdf-lib) corre en el worker; el callback de
        // progreso cruza el límite vía Comlink.proxy. (R27, R28)
        return await remote.organize(
          input,
          pageOrder,
          onProgress ? Comlink.proxy(onProgress) : undefined,
        );
      } catch (error) {
        throw error;
      }
    },
    async imagesToPdf(images, options, onProgress) {
      try {
        // El trabajo pesado (pdf-lib) corre en el worker; el callback de
        // progreso cruza el límite vía Comlink.proxy. (R36)
        return await remote.imagesToPdf(
          images,
          options,
          onProgress ? Comlink.proxy(onProgress) : undefined,
        );
      } catch (error) {
        throw error;
      }
    },
    async addPageNumbers(input, options, onProgress) {
      try {
        // El trabajo pesado (pdf-lib) corre en el worker; el callback de
        // progreso cruza el límite vía Comlink.proxy. (R32)
        return await remote.addPageNumbers(
          input,
          options,
          onProgress ? Comlink.proxy(onProgress) : undefined,
        );
      } catch (error) {
        throw error;
      }
    },
    async addWatermark(input, options, onProgress) {
      try {
        // El trabajo pesado (pdf-lib) corre en el worker; el callback de
        // progreso cruza el límite vía Comlink.proxy. (R42)
        return await remote.addWatermark(
          input,
          options,
          onProgress ? Comlink.proxy(onProgress) : undefined,
        );
      } catch (error) {
        throw error;
      }
    },
    async compress(input, options, onProgress) {
      try {
        // El trabajo pesado (pdf-lib + canvas) corre en el worker; el callback
        // de progreso cruza el límite vía Comlink.proxy. (R23, R24)
        return await remote.compress(
          input,
          options,
          onProgress ? Comlink.proxy(onProgress) : undefined,
        );
      } catch (error) {
        throw error;
      }
    },
    async protect(input, options, onProgress) {
      try {
        // El cifrado/descifrado (@cantoo/pdf-lib) corre en el worker; el callback
        // de progreso cruza el límite vía Comlink.proxy. La contraseña viaja en
        // `options` solo hasta el worker del mismo navegador; nunca a la red.
        // (R19, R33)
        return await remote.protect(
          input,
          options,
          onProgress ? Comlink.proxy(onProgress) : undefined,
        );
      } catch (error) {
        throw error;
      }
    },
    async annotate(input, annotations, onProgress) {
      try {
        // El aplanado pesado (pdf-lib) corre en el worker; el callback de
        // progreso cruza el límite vía Comlink.proxy. (R22, R23)
        return await remote.annotate(
          input,
          annotations,
          onProgress ? Comlink.proxy(onProgress) : undefined,
        );
      } catch (error) {
        throw error;
      }
    },
    async sign(input, options, onProgress) {
      try {
        // El aplanado pesado (pdf-lib) corre en el worker; el callback de
        // progreso cruza el límite vía Comlink.proxy. (R11)
        return await remote.sign(
          input,
          options,
          onProgress ? Comlink.proxy(onProgress) : undefined,
        );
      } catch (error) {
        throw error;
      }
    },
    async detectForm(input) {
      try {
        // La detección (pdf-lib) corre en el worker. (R17, R18)
        return await remote.detectForm(input);
      } catch (error) {
        throw error;
      }
    },
    async fillForms(input, options, onProgress) {
      try {
        // El rellenado/aplanado (pdf-lib) corre en el worker; el callback de
        // progreso cruza el límite vía Comlink.proxy. (R18, R19)
        return await remote.fillForms(
          input,
          options,
          onProgress ? Comlink.proxy(onProgress) : undefined,
        );
      } catch (error) {
        throw error;
      }
    },
    async ocr(pages, options, onProgress) {
      try {
        // El OCR (Tesseract.js WASM) y el ensamblado (pdf-lib) corren en el
        // worker; el callback de progreso REAL cruza el límite vía
        // Comlink.proxy. (R23, R24)
        return await remote.ocr(
          pages,
          options,
          onProgress ? Comlink.proxy(onProgress) : undefined,
        );
      } catch (error) {
        throw error;
      }
    },
    dispose() {
      worker.terminate();
    },
  };
}
