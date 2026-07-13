import { describe, expect, it } from "vitest";

import { OCR_LANGUAGES } from "@/pdf/ocrPdf";

/**
 * Presencia de los datos de idioma empaquetados: para CADA idioma de
 * `OCR_LANGUAGES` DEBE existir un fichero PLANO `<lang>.traineddata` servido
 * desde el propio origen bajo `public/tesseract/lang/`. Se resuelve con
 * `import.meta.glob` de Vite (patrón del proyecto, sin `node:fs`), obteniendo la
 * URL de cada asset. (#34 R2, R4)
 */
const TRAINEDDATA_URLS = import.meta.glob(
  "../../public/tesseract/lang/*.traineddata",
  { eager: true, query: "?url", import: "default" },
) as Record<string, string>;

describe("ocr assets — datos de idioma empaquetados (#34 R2, R4)", () => {
  const urls = Object.values(TRAINEDDATA_URLS);

  it("existe un .traineddata por cada idioma de OCR_LANGUAGES (R2)", () => { 
    for (const lang of OCR_LANGUAGES) {
      const found = urls.some((url) => url.endsWith(`/${lang}.traineddata`));
      expect(found, `falta ${lang}.traineddata`).toBe(true);
    }
  });

  it("hay al menos tantos assets como idiomas (R2)", () => {
    expect(urls.length).toBeGreaterThanOrEqual(OCR_LANGUAGES.length);
  });

  it("todas las rutas de asset terminan en .traineddata (formato plano, R4)", () => {
    for (const url of urls) {
      expect(url).toMatch(/\.traineddata$/);
      // Formato plano: NO deben ser `.traineddata.gz`.
      expect(url).not.toMatch(/\.traineddata\.gz$/);
    }
  });
});
