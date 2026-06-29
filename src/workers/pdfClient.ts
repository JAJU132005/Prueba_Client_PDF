import * as Comlink from "comlink";

import type {
  CompressOptions,
  CompressPdfResult,
} from "@/pdf/compressPdf";
import type { ImagesToPdfOptions } from "@/pdf/imagesToPdf";
import type { PageNumbersOptions } from "@/pdf/pageNumbers";
import type { RotateOptions } from "@/pdf/rotateOptions";
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
    dispose() {
      worker.terminate();
    },
  };
}
