# Assets locales de Tesseract.js (cero-red / offline)

Estos ficheros se sirven desde el **propio origen** (`/tesseract/…`) para que el
OCR funcione **sin CDN** y **offline**. Los paths están configurados en
`src/lib/tesseractOcrEngine.ts` (`workerPath` / `corePath` / `langPath`).

## Contenido

- `worker.min.js` — worker de Tesseract.js (copiado de
  `node_modules/tesseract.js/dist/worker.min.js`).
- `tesseract-core-simd.wasm` + `tesseract-core-simd.wasm.js` — core WASM SIMD
  (copiado de `node_modules/tesseract.js-core/`).
- `tesseract-core.wasm` + `tesseract-core.wasm.js` — core WASM de respaldo (para
  navegadores sin SIMD).
- `lang/<lang>.traineddata` — datos de idioma (uno por cada idioma de
  `OCR_LANGUAGES`: `spa`, `eng`, `fra`, `deu`, `por`, `ita`).

## Datos de idioma

Los `.traineddata` NO se distribuyen dentro de `node_modules` (Tesseract.js los
descarga por defecto de un CDN en tiempo de ejecución). Para preservar
cero-red/offline se empaquetan localmente en `lang/`. Se recomienda la variante
**`tessdata_fast`** (~1–2 MB por idioma) descargándolos una sola vez en el
proceso de build/preparación desde el repositorio oficial de tessdata_fast y
colocándolos como `lang/spa.traineddata`, `lang/eng.traineddata`, etc.

> Nota: la descarga de estos assets grandes no se cubre en el suite de tests,
> igual que el WASM de pdf.js. El invariante duro (los **datos del usuario**
> nunca salen del navegador) se cumple porque el PDF se rasteriza y reconoce
> localmente; estos assets son código/modelo estáticos de la propia app.
