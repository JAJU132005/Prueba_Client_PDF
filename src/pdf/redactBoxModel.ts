/**
 * Dominio PURO del editor de cajas de redacción (#33): estado inmutable,
 * reductores, hit-test, traslado y redimensionado sobre `NormalizedBox` (`[0,1]`,
 * origen superior-izquierdo). Sin React, sin DOM, sin pdf-lib.
 *
 * Replica el PATRÓN de `annotationInteraction.ts`/`annotationModel.ts` (#29)
 * — reductores inmutables, hit-test más-reciente, resize con esquina opuesta fija
 * y clamp de mínimo — pero NO su código: aquel opera sobre `Annotation` en puntos
 * PDF (origen inferior-izq.) y su exportación por overlay es la vía insegura que
 * #27 descartó. Aquí se trabaja en el mismo modelo `NormalizedBox` que consume el
 * pipeline seguro de #27, sin ramas nuevas al exportar.
 */

import type { NormalizedBox } from "@/pdf/redact";

/** Caja identificada del editor: superset de `NormalizedBox` de #27. */
export interface RedactBox extends NormalizedBox {
  id: string;
  source: "manual" | "search";
}

/** Estado inmutable del editor: cajas colocadas + la seleccionada. */
export interface RedactBoxState {
  readonly boxes: readonly RedactBox[];
  readonly selectedId: string | null;
}

/** Tiradores de esquina para redimensionar. */
export type BoxHandle = "nw" | "ne" | "sw" | "se";

/** Tamaño mínimo normalizado de una caja tras redimensionar (evita ancho/alto 0). */
export const MIN_BOX_SIZE_NORM = 0.005;

/** Estado inicial vacío. */
export function createBoxState(): RedactBoxState {
  return { boxes: [], selectedId: null };
}

/** Acota `value` al intervalo `[min, max]`. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Añade `box` al final y la marca como seleccionada, devolviendo un estado NUEVO
 * (no muta la entrada). (R9)
 */
export function addBox(
  state: RedactBoxState,
  box: RedactBox,
): RedactBoxState {
  return { boxes: [...state.boxes, box], selectedId: box.id };
}

/**
 * Quita la caja con `id` (si existe), devolviendo un estado NUEVO. Si era la
 * seleccionada, la selección queda vacía. (R17)
 */
export function removeBox(state: RedactBoxState, id: string): RedactBoxState {
  return {
    boxes: state.boxes.filter((b) => b.id !== id),
    selectedId: state.selectedId === id ? null : state.selectedId,
  };
}

/** Reemplaza la caja con el mismo `id` por `box` (mover/redimensionar), inmutable. */
export function updateBox(state: RedactBoxState, box: RedactBox): RedactBoxState {
  return {
    boxes: state.boxes.map((b) => (b.id === box.id ? box : b)),
    selectedId: state.selectedId,
  };
}

/** Marca `id` como seleccionada (o `null` para deseleccionar). Inmutable. */
export function selectBox(
  state: RedactBoxState,
  id: string | null,
): RedactBoxState {
  return { boxes: state.boxes, selectedId: id };
}

/** Cajas asociadas a `pageIndex`, en orden de creación. */
export function boxesForPage(
  state: RedactBoxState,
  pageIndex: number,
): RedactBox[] {
  return state.boxes.filter((b) => b.pageIndex === pageIndex);
}

/**
 * Última caja (más reciente primero) cuya geometría contiene `point`, o `null`.
 * Resuelve solapes a favor de la más recientemente añadida. (R12)
 */
export function hitTestBox(
  boxes: readonly RedactBox[],
  point: { x: number; y: number },
  tolerance = 0,
): RedactBox | null {
  for (let i = boxes.length - 1; i >= 0; i--) {
    const b = boxes[i];
    if (
      point.x >= b.left - tolerance &&
      point.x <= b.left + b.width + tolerance &&
      point.y >= b.top - tolerance &&
      point.y <= b.top + b.height + tolerance
    ) {
      return boxes[i];
    }
  }
  return null;
}

/**
 * Traslada la caja por `(dx, dy)` en coordenadas normalizadas y la reacota a
 * `[0,1]` conservando su tamaño (nunca se sale del borde). Inmutable. (R13, R16)
 */
export function moveBox(box: RedactBox, dx: number, dy: number): RedactBox {
  const left = clamp(box.left + dx, 0, 1 - box.width);
  const top = clamp(box.top + dy, 0, 1 - box.height);
  return { ...box, left, top };
}

/**
 * Redimensiona `box` arrastrando `handle` hasta `to` con la esquina OPUESTA
 * fija, con clamp al mínimo `minSize` y reacotado a `[0,1]`. Inmutable.
 * (R14, R15, R16)
 */
export function resizeBox(
  box: RedactBox,
  handle: BoxHandle,
  to: { x: number; y: number },
  minSize = MIN_BOX_SIZE_NORM,
): RedactBox {
  // Esquina fija = la opuesta al tirador arrastrado (en coords sup-izq.).
  const fixedX = handle === "nw" || handle === "sw" ? box.left + box.width : box.left;
  const fixedY = handle === "nw" || handle === "ne" ? box.top + box.height : box.top;

  const clampedX = clamp(to.x, 0, 1);
  const clampedY = clamp(to.y, 0, 1);

  const left = Math.min(fixedX, clampedX);
  const top = Math.min(fixedY, clampedY);
  let width = Math.abs(clampedX - fixedX);
  let height = Math.abs(clampedY - fixedY);

  // Clamp al mínimo respetando el rango [0,1]: si crecer desbordaría el borde,
  // se desplaza el origen para conservar el tamaño mínimo dentro de la página.
  width = Math.max(width, minSize);
  height = Math.max(height, minSize);
  const finalLeft = clamp(left, 0, 1 - width);
  const finalTop = clamp(top, 0, 1 - height);

  return { ...box, left: finalLeft, top: finalTop, width, height };
}
