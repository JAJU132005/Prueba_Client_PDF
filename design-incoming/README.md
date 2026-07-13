# design-incoming/ — Rediseño "El Diario del Panda" (entrega)

Rediseño **solo UI** para Cliente-PDF, en HTML/CSS plano + 2 web components de
presentación. El implementer lo porta a React/TS/Tailwind 1:1 sin tocar
`app/src/pdf/` ni los workers.

Todas las páginas abren directamente en el navegador (doble clic).

## Contenido

```
design-incoming/
├── README.md                     ← este archivo
├── tokens/
│   └── tokens.css                ← variables claro/oscuro + clases de componentes
├── home/
│   └── index.html                ← hero + rejilla de 15 ToolCards (orden de la captura) + cómic
├── templates/
│   ├── 01-multi-file/index.html  ← representativa: Unir PDF (+ variante Imágenes a PDF)
│   ├── 02-options/index.html     ← representativa: Rotar (+ Comprimir, Proteger, OCR)
│   ├── 03-page-select/index.html ← representativa: Dividir (+ Organizar, PDF a imágenes)
│   └── 04-editor-preview/index.html ← representativa: Marca de agua (+ Números, Firmar, Rellenar, Redactar, Editar)
└── shared/
    ├── README.md                 ← mapeo a los componentes compartidos existentes
    ├── panda-art.js              ← <panda-art kind="…"> ilustraciones SVG (15 escenas, 3 poses, portada, cómic, trituradora, nube)
    └── panda-widget.js           ← <panda-widget> panda interactivo global (ojos, idle/sueño, drag, easter eggs)
```

## Reglas respetadas

- **Solo UI**: cada botón de acción de las plantillas se cablea a la función de
  dominio existente; el progreso visual (bambú) consume el 0..1 que ya emite el
  worker; los mensajes de error reales se muestran en bocadillo de cómic sin
  reescribir su contenido.
- **Nivel accesible**: color + texto ("Ligera · Pan comido" / "Media · Ahí va la
  cosa" / "Pesada · Modo bestia") + pose del panda. El post-it "⚠️ En móvil esto
  suda de verdad" solo se pinta cuando `resource_cost_indicator` lo decide.
- **Claro/oscuro**: el toggle existente añade `class="dark"` (o
  `data-theme="dark"`) a `<html>`; todo está tokenizado en `tokens/tokens.css`.
- **`prefers-reduced-motion`**: cubierto globalmente en tokens.css y dentro de
  los dos web components.
- **Foco de teclado**: `:focus-visible` global con círculo garabateado.

## Mapeo herramienta → plantilla (igual que el README de integración)

- 01-multi-file: Unir (`/merge`), Imágenes a PDF (`/images-to-pdf`)
- 02-options: Rotar (`/rotate`), Comprimir (`/compress` 🔴), Proteger/Desbloquear (`/protect`), OCR (`/ocr` 🔴)
- 03-page-select: Dividir (`/split`), Organizar (`/organize`), PDF a imágenes (`/pdf-to-images`)
- 04-editor-preview: Números (`/page-numbers`), Marca de agua (`/watermark`),
  Editar/Anotar (`/edit` 🔴), Firmar (`/sign`), Rellenar (`/fill-forms`), Redactar (`/redact`)

Cada `index.html` de plantilla muestra **todos los estados apilados** (dropzone
vacía → lista de archivos → opciones → procesando → resultado) con una etiqueta
de estado, para que el implementer vea la anatomía completa sin interactuar.
