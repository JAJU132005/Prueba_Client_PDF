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
  `OCR_LANGUAGES`). Catálogo ampliado #32 (13 idiomas):
  `spa`, `eng`, `fra`, `deu`, `por`, `ita`, `nld`, `cat`, `glg`, `pol`, `swe`,
  `tur`, `rus`.

## Datos de idioma

Los `.traineddata` NO se distribuyen dentro de `node_modules` (Tesseract.js los
descarga por defecto de un CDN en tiempo de ejecución). Para preservar
cero-red/offline se empaquetan localmente en `lang/`. Se recomienda la variante
**`tessdata_fast`** (~1–2 MB por idioma) descargándolos una sola vez en el
proceso de build/preparación desde el repositorio oficial de tessdata_fast y
colocándolos como `lang/spa.traineddata`, `lang/eng.traineddata`, etc.

Ficheros requeridos (uno por idioma del catálogo #32):

```
lang/spa.traineddata   lang/eng.traineddata   lang/fra.traineddata
lang/deu.traineddata   lang/por.traineddata   lang/ita.traineddata
lang/nld.traineddata   lang/cat.traineddata   lang/glg.traineddata
lang/pol.traineddata   lang/swe.traineddata   lang/tur.traineddata
lang/rus.traineddata
```

El motor (`src/lib/tesseractOcrEngine.ts`) NO requiere cambios: ya usa
`langPath = "/tesseract/lang"` (propio origen) y crea un worker por idioma bajo
demanda con esa ruta, de modo que cualquier idioma nuevo carga su
`.traineddata` localmente sin red (invariante cero-red, #32 R4).

> Nota: la descarga de estos assets grandes no se cubre en el suite de tests,
> igual que el WASM de pdf.js. El invariante duro (los **datos del usuario**
> nunca salen del navegador) se cumple porque el PDF se rasteriza y reconoce
> localmente; estos assets son código/modelo estáticos de la propia app.
