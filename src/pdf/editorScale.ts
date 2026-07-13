/**
 * Geometría de VISTA PURA del editor de anotaciones (#35). Deriva la escala real
 * de visualización (px mostrados por punto PDF) a partir del tamaño natural de la
 * imagen rasterizada, del tamaño MOSTRADO (medido por ResizeObserver /
 * getBoundingClientRect) y de la escala de render. Es aritmética pura: sin React,
 * sin DOM, sin pdf-lib. Se añade de forma ADITIVA sin tocar el dominio de
 * aplanado `annotate.ts` (R17). (R1, R3)
 */

/** Geometría de render del editor derivada de la imagen rasterizada. */
export interface EditorGeometry {
  /** Ancho real de la página en puntos PDF. */
  pageWidthPts: number;
  /** Alto real de la página en puntos PDF (usado como `pageHeightPts`). */
  pageHeightPts: number;
  /** Escala de VISUALIZACIÓN: px mostrados por punto PDF. */
  scale: number;
}

/**
 * Deriva la geometría real del editor a partir del tamaño natural de la imagen
 * rasterizada (`natural*`), del tamaño MOSTRADO (`displayed*`, medido por
 * ResizeObserver/getBoundingClientRect) y de la escala de render (`renderScale`).
 *
 * - Con tamaño natural conocido (> 0): `pageWidthPts = naturalWidth/renderScale`,
 *   `pageHeightPts = naturalHeight/renderScale`,
 *   `scale = displayedWidth/pageWidthPts`. La escala refleja el encogido por CSS
 *   (no se asume 1). (R1, R3)
 * - Sin tamaño natural (0, imagen aún no cargada o entorno sin `naturalWidth`):
 *   FALLBACK legacy `pageWidthPts = displayedWidth/renderScale`,
 *   `pageHeightPts = displayedHeight/renderScale`, `scale = renderScale`.
 *   Mantiene el comportamiento previo hasta que la imagen reporta su tamaño.
 * - Devuelve `null` si `displayedWidth`, `displayedHeight` o `renderScale` <= 0
 *   (aún sin medir): el componente no dibuja la capa hasta tener geometría.
 */
export function deriveEditorGeometry(input: {
  naturalWidth: number;
  naturalHeight: number;
  displayedWidth: number;
  displayedHeight: number;
  renderScale: number;
}): EditorGeometry | null {
  const {
    naturalWidth,
    naturalHeight,
    displayedWidth,
    displayedHeight,
    renderScale,
  } = input;

  if (displayedWidth <= 0 || displayedHeight <= 0 || renderScale <= 0) {
    return null;
  }

  if (naturalWidth > 0 && naturalHeight > 0) {
    const pageWidthPts = naturalWidth / renderScale;
    const pageHeightPts = naturalHeight / renderScale;
    return {
      pageWidthPts,
      pageHeightPts,
      scale: displayedWidth / pageWidthPts,
    };
  }

  // Fallback legacy: sin tamaño natural, se asume 1 pt = 1 px de render.
  return {
    pageWidthPts: displayedWidth / renderScale,
    pageHeightPts: displayedHeight / renderScale,
    scale: renderScale,
  };
}
