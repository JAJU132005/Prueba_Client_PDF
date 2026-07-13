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
cero-red/offline se **empaquetan localmente** en `lang/` y se **comprometen al
repo** (fuente de verdad), igual que el core WASM de Tesseract. Vite copia
`public/` verbatim al build, así que se sirven desde el propio origen en
`/tesseract/lang/<lang>.traineddata` (sin red en runtime → invariante cero-red).

### Formato: PLANO + `gzip: false` (#34 R4)

Los ficheros se guardan en formato **plano** `<lang>.traineddata` (sin
comprimir), tal cual se distribuyen en `tessdata_fast`. En consecuencia,
`src/lib/tesseractOcrEngine.ts` pasa **`gzip: false`** a `createWorker`, para que
Tesseract.js solicite `<lang>.traineddata` (sin sufijo `.gz`) y **no** intente
descomprimir. Así el formato empaquetado coincide con el solicitado.

> Si se cambiara a formato comprimido (`<lang>.traineddata.gz`), habría que
> quitar `gzip: false` (Tesseract.js pide `.gz` por defecto). Mantener ambos
> lados coherentes es obligatorio o la carga del idioma falla en runtime.

### Regeneración (script, fuera del build/test)

Para (re)descargar o actualizar los 13 ficheros desde el repositorio oficial de
`tessdata_fast` (variante rápida, ~1–6 MB por idioma):

```
node scripts/fetch-traineddata.mjs
```

Ese script (`app/scripts/fetch-traineddata.mjs`, Node, `node:https`/`node:fs`)
**no** forma parte del pipeline de build ni de test. Los ficheros comprometidos
son la única fuente de verdad; el script solo sirve para regenerarlos.

Ficheros requeridos (uno por idioma de `OCR_LANGUAGES`, catálogo #32):

```
lang/spa.traineddata   lang/eng.traineddata   lang/fra.traineddata
lang/deu.traineddata   lang/por.traineddata   lang/ita.traineddata
lang/nld.traineddata   lang/cat.traineddata   lang/glg.traineddata
lang/pol.traineddata   lang/swe.traineddata   lang/tur.traineddata
lang/rus.traineddata
```

El motor (`src/lib/tesseractOcrEngine.ts`) usa `langPath = "/tesseract/lang"`
(propio origen) y crea un worker por idioma bajo demanda con esa ruta, de modo
que cada idioma carga su `.traineddata` localmente sin red (invariante cero-red,
#32 R4, #34 R3a/R3b).

> Nota: el WASM/OCR real no se cubre en el suite de tests (igual que el WASM de
> pdf.js). Lo que sí se testea: la **presencia** de un `.traineddata` por idioma
> (`src/pdf/ocrAssets.test.ts`) y la ausencia de red / rutas locales
> (`src/pdf/ocrNoBackend.test.ts`). El invariante duro (los **datos del
> usuario** nunca salen del navegador) se cumple porque el PDF se rasteriza y
> reconoce localmente; estos assets son código/modelo estáticos de la propia
> app.
