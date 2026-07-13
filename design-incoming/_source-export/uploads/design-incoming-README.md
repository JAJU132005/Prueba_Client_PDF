# design-incoming/ — Frontend para integrar (feature 28)

Aquí va el código del **nuevo diseño** del frontend. La feature 28
(`design_integration_reskin`) lo lee de esta carpeta y **solo** reemplaza la capa
de UI, cableándola a la lógica que ya funciona. Suelta tu código en las
subcarpetas según el mapeo de abajo.

## Reglas de oro (las verifica el spec_critic y el reviewer)

1. **Solo UI.** No se toca `app/src/pdf/` (dominio) ni el contrato del worker
   (`app/src/workers/`). El diseño llama a las funciones que YA existen.
2. **Invariantes intactos.** Cero red con datos del usuario; lo pesado va al
   worker; accesibilidad (foco visible, teclado, contraste AA, `aria-*`).
3. **Reutiliza, no reimplementes.** Los componentes transversales (nº de páginas,
   selector de rangos, vista previa, previsualización en vivo, badge de consumo,
   banner offline) ya están hechos: el diseño los consume.
4. **Tests verdes.** Tras integrar cada pestaña, `cd app && npm run test` y
   `npm run typecheck` siguen pasando. Si algún test se rompe, es que se tocó
   lógica que no se debía.
5. **Una pestaña = una sub-tarea.** El implementer integra plantilla por
   plantilla; no mezcla varias en un solo cambio.

## Estructura de esta carpeta

```
design-incoming/
├── README.md                 ← este archivo (mapa y reglas)
├── tokens/                   ← colores, tipografía, espaciado, claro/oscuro
├── home/                     ← hero + rejilla + ToolCard
├── templates/
│   ├── 01-multi-file/        ← varios archivos → una salida
│   ├── 02-options/           ← 1 archivo + formulario simple
│   ├── 03-page-select/       ← 1 archivo + rejilla de miniaturas
│   └── 04-editor-preview/    ← 1 archivo + lienzo de previsualización
└── shared/                   ← componentes que TODAS las plantillas embeben
```

> Formato del código: idealmente React + TypeScript + Tailwind (igual que la
> app). Si lo entregas en HTML/CSS plano, déjalo igualmente aquí: el implementer
> lo porta a componentes manteniendo tu diseño 1:1.

## Las 4 plantillas (anatomía)

- **01-multi-file** — Dropzone múltiple + lista reordenable de archivos +
  botón de acción + barra de progreso + panel de resultado/descarga.
- **02-options** — Dropzone simple + panel de opciones (campos/selectores) +
  acción + progreso + resultado. Puede embeber el selector de rangos.
- **03-page-select** — Dropzone simple + **rejilla de miniaturas** como
  protagonista (selección/orden) + acción + resultado.
- **04-editor-preview** — Dropzone simple + **lienzo de previsualización en vivo**
  + controles de colocación (posición/opacidad/herramientas) + acción + resultado.

## Componentes compartidos (carpeta `shared/`)

Diséñalos una vez; se usan en todas las plantillas: `Header`, `Footer`,
`OfflineBanner`, `HelpModal`, `Dropzone`, `FileList` (muestra nombre, tamaño y
**nº de páginas**), `PageCountBadge`, `PreviewModal` (botón "Vista previa" del
PDF subido), `RangeSelector` (selección visual de páginas), `LivePreview`
(previsualización del resultado), `CostBadge` (Ligera/Media/Pesada),
`ProgressBar`, `ResultPanel` (Descargar / Procesar otro).

## Mapeo herramienta → plantilla → lógica

15 herramientas. La columna "Función de dominio" es orientativa: el implementer
debe cablear a la **función real existente** en `app/src/pdf/` (mismo nombre o el
que haya), sin cambiar su API. Todas las operaciones pesadas pasan por el worker.

| Herramienta | Ruta | Plantilla | Función de dominio (app/src/pdf) | Coste | Compartidos que embebe |
|---|---|---|---|---|---|
| Unir PDF | `/merge` | 01-multi-file | `merge` | 🟢 | Dropzone(multi), FileList, PreviewModal, ResultPanel |
| Imágenes a PDF | `/images-to-pdf` | 01-multi-file | `imagesToPdf` | 🟢 | Dropzone(multi img), reorder, ResultPanel |
| Dividir PDF | `/split` | 03-page-select | `split` | 🟢 | RangeSelector, PreviewModal, PageCountBadge |
| Organizar páginas | `/organize` | 03-page-select | `organize` | 🟡 | Rejilla miniaturas, drag-reorder, PreviewModal |
| PDF a imágenes | `/pdf-to-images` | 03-page-select | `pdfToImages` | 🟡 | RangeSelector, opciones formato/DPI, ResultPanel(zip) |
| Rotar PDF | `/rotate` | 02-options | `rotate` | 🟢 | RangeSelector, control de ángulo |
| Comprimir PDF | `/compress` | 02-options | `compress` | 🔴 | Control de calidad, CostBadge(pesada) |
| Proteger / Desbloquear | `/protect` | 02-options | `protect` / `unlock` | 🟡 | Campo contraseña (sin autocompletar), ProgressBar |
| OCR | `/ocr` | 02-options | `ocr` | 🔴 | Selector idioma, ProgressBar, CostBadge(pesada) |
| Números de página | `/page-numbers` | 04-editor-preview | `pageNumbers` | 🟢 | LivePreview, controles posición/formato |
| Marca de agua | `/watermark` | 04-editor-preview | `watermark` | 🟢 | LivePreview, texto/imagen, opacidad/rotación |
| Editar / Anotar | `/edit` | 04-editor-preview | `annotate` | 🔴 | Editor lienzo, LivePreview, barra de herramientas |
| Firmar | `/sign` | 04-editor-preview | `sign` | 🟡 | Pad/subida de firma, LivePreview colocación |
| Rellenar formularios | `/fill-forms` | 04-editor-preview | `fillForms` | 🟡 | Panel de campos, LivePreview, opción aplanar |
| Redactar | `/redact` | 04-editor-preview | `redact` | 🟡 | Dibujo de cajas sobre preview, aviso de rasterizado |

> Las 15 herramientas son las 10 originales + Anotar, Firmar, Rellenar
> formularios, OCR y **Redactar** (feature 27). "Extraer texto" quedó en reserva;
> si algún día entra, usa ruta `/extract-text`, plantilla `02-options` y función
> `extractText`.

## Por cada pestaña que entregues, incluye

1. El/los componentes de la plantilla (o el HTML/CSS de esa pantalla).
2. Qué tokens usa (referencia a `tokens/`).
3. Qué componentes de `shared/` espera y dónde van.
4. Cualquier estado/opción propio de esa herramienta (p. ej. ángulo de rotación,
   nivel de compresión) — solo la UI; la lógica ya existe.

El implementer se encarga de: enrutar la pestaña, conectar el botón de acción a
la función de dominio/worker correcta, mostrar progreso real y resultado, y
escribir el test de integración que verifica que la acción sigue produciendo la
salida esperada.
