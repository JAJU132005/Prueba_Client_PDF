/**
 * Dominio PURO de la búsqueda de texto para redacción (#33). Sin React, sin DOM,
 * sin pdf.js: convierte la geometría de los ítems de texto (extraída aparte por
 * el adaptador impuro `@/lib/pdfjsTextExtractor`) en cajas `NormalizedBox` de #27
 * que atraviesan el MISMO pipeline seguro de exportación.
 *
 * SEGURIDAD: la búsqueda SOLO genera `NormalizedBox`; la irreversibilidad la
 * sigue dando el rasterizado de página completa de #27 (`redactPdf`). Una caja
 * mal posicionada sería un fallo visual, nunca una fuga de texto extraíble.
 */

import type { NormalizedBox } from "@/pdf/redact";

/**
 * Geometría de un ítem de texto de pdf.js, desacoplada de los tipos de
 * `pdfjs-dist`. `(xPts, yPts)` es la baseline del ítem en puntos PDF (origen
 * inferior-izquierdo); `widthPts`/`heightPts` son su ancho/alto en pts.
 */
export interface TextItemGeometry {
  str: string;
  xPts: number;
  yPts: number;
  widthPts: number;
  heightPts: number;
}

/** Geometría de texto de una página completa. */
export interface PageTextGeometry {
  pageIndex: number;
  pageWidthPts: number;
  pageHeightPts: number;
  items: readonly TextItemGeometry[];
}

/**
 * Una coincidencia del término de búsqueda: su caja normalizada `[0,1]` (con el
 * `pageIndex` ya fijado desde la página) y un fragmento de contexto para la UI.
 */
export interface TextMatch {
  box: NormalizedBox;
  snippet: string;
}

/** Acota `value` al intervalo `[min, max]`. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Deriva la `NormalizedBox` (`[0,1]`, origen superior-izquierdo) que cubre el
 * tramo `[startFrac, endFrac)` de caracteres de un ítem de texto de pdf.js
 * (baseline en pts PDF, origen inferior-izquierdo). Función PURA. (R2, R3)
 *
 * `item.yPts + item.heightPts` es el borde SUPERIOR del glifo en pts PDF; se
 * convierte a origen superior-izquierdo restándolo de la altura de página. Se
 * acota a `[0,1]`.
 */
export function matchBoxFromItem(
  item: TextItemGeometry,
  pageWidthPts: number,
  pageHeightPts: number,
  startFrac: number,
  endFrac: number,
  pageIndex: number,
): NormalizedBox {
  const leftPts = item.xPts + startFrac * item.widthPts;
  const matchWidthPts = (endFrac - startFrac) * item.widthPts;
  const topPts = pageHeightPts - (item.yPts + item.heightPts);

  const left = clamp(leftPts / pageWidthPts, 0, 1);
  const top = clamp(topPts / pageHeightPts, 0, 1);
  const width = clamp(matchWidthPts / pageWidthPts, 0, 1 - left);
  const height = clamp(item.heightPts / pageHeightPts, 0, 1 - top);

  return { pageIndex, left, top, width, height };
}

/**
 * Busca todas las apariciones (insensibles a mayúsculas/minúsculas, R4) de
 * `query` en cada ítem de cada página y produce una `TextMatch` por aparición,
 * con su caja derivada de la geometría real. Query vacío o solo espacios → `[]`
 * (R5). Función PURA. (R1)
 *
 * Limitación conocida: las coincidencias que cruzan varios ítems (saltos de
 * línea/kerning que fragmentan el `str`) se cubren por ítem; es seguro (a lo
 * sumo no se marca una porción, que el usuario marca a mano).
 */
export function findMatches(
  pages: readonly PageTextGeometry[],
  query: string,
): TextMatch[] {
  if (query.trim() === "") {
    return []; // (R5)
  }
  const needle = query.toLowerCase(); // (R4)
  const matches: TextMatch[] = [];

  for (const page of pages) {
    for (const item of page.items) {
      const len = item.str.length;
      if (len === 0) {
        continue;
      }
      const haystack = item.str.toLowerCase();
      let from = 0;
      for (;;) {
        const index = haystack.indexOf(needle, from);
        if (index < 0) {
          break;
        }
        const startFrac = index / len;
        const endFrac = (index + needle.length) / len;
        matches.push({
          box: matchBoxFromItem(
            item,
            page.pageWidthPts,
            page.pageHeightPts,
            startFrac,
            endFrac,
            page.pageIndex,
          ),
          snippet: item.str.slice(index, index + query.length),
        });
        // Avanza al menos un carácter para no colgarse con needle vacío
        // (ya descartado) y para hallar apariciones solapadas siguientes.
        from = index + Math.max(needle.length, 1);
      }
    }
  }

  return matches;
}
