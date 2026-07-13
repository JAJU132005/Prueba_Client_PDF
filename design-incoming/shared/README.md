# shared/ — componentes que TODAS las plantillas embeben

Dos web components de **presentación pura** (sin lógica de dominio) + el mapeo
de cada componente compartido existente a su piel nueva.

## panda-art.js — `<panda-art kind="…" style="width:…">`

Ilustraciones SVG de trazo marcador. Colores desde los tokens (`var(--ink)`,
`var(--card)`, …), así que funcionan en cuaderno y pizarra sin cambios.
`label="…"` opcional para el `aria-label`.

kinds disponibles:
- Escenas (una por herramienta, mismo slug): `unir`, `dividir`, `rotar`,
  `organizar`, `pdf-a-imagenes`, `imagenes-a-pdf`, `numeros`, `marca-de-agua`,
  `comprimir`, `proteger`, `firmar`, `rellenar`, `redactar`, `editar`, `ocr`
- Poses de nivel (badges): `pose-ligera`, `pose-media`, `pose-pesada`
- Privacidad/portada: `portada`, `nube`, `comic1`, `comic2`, `comic3`, `trituradora`

## panda-widget.js — `<panda-widget>`

Panda de guardia fijo en la esquina inferior derecha: ojos que siguen el cursor,
parpadeo, se duerme a los ~30 s (Zzz), reacciona a `dragover` de archivos con
"¡suéltalo aquí, prometo no chismosear!", easter eggs rotativos al clic
(accesible por teclado). Respeta `prefers-reduced-motion`. Se monta una vez por
página; no bloquea interacción (pointer-events solo sobre el propio panda).

## Piel de los componentes compartidos existentes

| Componente existente | Piel nueva (clase en tokens.css / patrón) |
|---|---|
| `Header` | logo panda + "cliente-pdf" + estado En línea + toggle tema + sello "✓ 100% local" |
| `Footer` | contador "Bytes enviados a internet: **0**" (`.zero`) + lema del diario |
| `OfflineBanner` | nota pegada con cinta (`.card` + `.tape`): "Funciona sin internet · instálala y úsala en un búnker si quieres 🐼" |
| `Dropzone` | `.dropzone` con cinta; copy "Arrastra … aquí — ¡prometo no chismosear!" |
| `FileList` / `PageCountBadge` | `.filerow`: nombre manuscrito · tamaño+**N páginas** en mono · flechas reordenar · Vista previa · ✕ |
| `PreviewModal` | tarjeta de cuaderno con hoja blanca (render pdf.js existente) + paginación ← → |
| `RangeSelector` | `.pagecell` casillas de cuaderno con ✓ de marcador + atajos Todas/Pares/Impares/Invertir |
| `LivePreview` | `.sheet` hoja rayada; la marca/sello/firma se superpone en vivo |
| `CostBadge` | `.badge.lv-*` + `<panda-art kind="pose-*">` (color + texto + pose, nunca solo color) |
| `ProgressBar` | `.progress` + `.progress-fill` (bambú); width = progreso real del worker |
| `ResultPanel` | confeti + `<panda-art kind="trituradora">` + "borrado hasta de mi memoria" + hoja con `.stamp-topsecret` + Descargar / Procesar otro |
| `HelpModal` | tarjeta `.card` con el cómic (`comic1..3`) |

Los mensajes de error reales se muestran en un bocadillo de cómic junto al panda
rascándose la cabeza; **el texto técnico no se altera**.
