// @ts-nocheck
/**
 * Script de CONVENIENCIA (Node) para (re)generar los datos de idioma de OCR.
 *
 * Descarga los 13 ficheros `<lang>.traineddata` de la variante oficial
 * `tessdata_fast` (formato PLANO, sin comprimir) y los coloca en
 * `app/public/tesseract/lang/<lang>.traineddata`.
 *
 * IMPORTANTE:
 * - NO forma parte del pipeline de build ni de test. Los ficheros comprometidos
 *   al repo son la única fuente de verdad; este script solo sirve para
 *   regenerarlos/actualizarlos manualmente.
 * - La aplicación en tiempo de uso NUNCA hace red: sirve estos assets desde el
 *   propio origen (`/tesseract/lang/`). La descarga ocurre aquí, en DEV, no en
 *   runtime del navegador.
 * - Formato PLANO + `gzip: false` en `createWorker` (ver
 *   `src/lib/tesseractOcrEngine.ts`) para que el formato empaquetado coincida
 *   con el que Tesseract.js solicita.
 *
 * Uso:  node scripts/fetch-traineddata.mjs
 */
import { createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import https from "node:https";

/** Idiomas: DEBE coincidir con OCR_LANGUAGES en src/pdf/ocrPdf.ts. */
const LANGUAGES = [
  "spa",
  "eng",
  "fra",
  "deu",
  "por",
  "ita",
  "nld",
  "cat",
  "glg",
  "pol",
  "swe",
  "tur",
  "rus",
];

const BASE_URL =
  "https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LANG_DIR = join(__dirname, "..", "public", "tesseract", "lang");

/** Descarga una URL a un fichero, siguiendo redirecciones. */
function download(url, destPath) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (res) => {
      if (
        res.statusCode &&
        res.statusCode >= 300 &&
        res.statusCode < 400 &&
        res.headers.location
      ) {
        res.resume();
        download(res.headers.location, destPath).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} para ${url}`));
        return;
      }
      const file = createWriteStream(destPath);
      res.pipe(file);
      file.on("finish", () => file.close(() => resolve()));
      file.on("error", reject);
    });
    request.on("error", reject);
    request.setTimeout(60000, () => {
      request.destroy(new Error(`Timeout descargando ${url}`));
    });
  });
}

async function main() {
  await mkdir(LANG_DIR, { recursive: true });
  for (const lang of LANGUAGES) {
    const url = `${BASE_URL}/${lang}.traineddata`;
    const dest = join(LANG_DIR, `${lang}.traineddata`);
    process.stdout.write(`Descargando ${lang}.traineddata … `);
    await download(url, dest);
    const { size } = await stat(dest);
    process.stdout.write(`OK (${(size / 1024 / 1024).toFixed(1)} MB)\n`);
  }
  console.log(`\nListo: ${LANGUAGES.length} ficheros en ${LANG_DIR}`);
}

main().catch((error) => {
  console.error("Fallo al descargar los datos de idioma:", error.message);
  process.exit(1);
});
