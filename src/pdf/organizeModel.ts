/**
 * Modelo PURO de reordenado/eliminado de páginas. Estructura de datos inmutable
 * que representa la secuencia de páginas resultante. Sin pdf-lib, sin pdf.js,
 * sin DOM, sin React: es el núcleo testeable de la herramienta. (R1–R10)
 */

/** Una página dentro del modelo de organización. (R1) */
export interface OrganizePageItem {
  /** Índice 0-indexado de la página en el PDF original. */
  originalIndex: number;
  /** Marcada para eliminar. */
  removed: boolean;
}

/** Secuencia inmutable de páginas en su orden actual. (R1) */
export type OrganizeModel = readonly OrganizePageItem[];

/**
 * Construye el modelo inicial: items `0..pageCount-1` en orden ascendente,
 * ninguno eliminado. Con `pageCount === 0` (o negativo) → `[]`. (R1, R2)
 */
export function createOrganizeModel(pageCount: number): OrganizeModel {
  return Array.from({ length: Math.max(0, pageCount) }, (_, i) => ({
    originalIndex: i,
    removed: false,
  }));
}

/**
 * Reubica el item de la posición `from` en la posición `to`, preservando el
 * orden relativo de los demás. Si `from` o `to` está fuera de
 * `[0, model.length)`, devuelve una copia equivalente sin reordenar. No muta el
 * `model` ni sus items de entrada. (R3, R4, R9)
 */
export function movePage(
  model: OrganizeModel,
  from: number,
  to: number,
): OrganizeModel {
  const next = [...model];
  if (
    from < 0 ||
    from >= model.length ||
    to < 0 ||
    to >= model.length
  ) {
    // Índices fuera de rango → modelo equivalente sin reordenar. (R4)
    return next;
  }
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * Invierte el campo `removed` del item de la posición `position`, devolviendo
 * una nueva estructura (nuevo arreglo y nuevo item). Si `position` está fuera de
 * `[0, model.length)`, devuelve una copia equivalente sin cambios. No muta la
 * entrada. (R5, R6, R9)
 */
export function toggleRemoved(
  model: OrganizeModel,
  position: number,
): OrganizeModel {
  if (position < 0 || position >= model.length) {
    // Posición fuera de rango → modelo equivalente sin cambios. (R6)
    return [...model];
  }
  return model.map((item, i) =>
    i === position ? { ...item, removed: !item.removed } : item,
  );
}

/**
 * Devuelve los `originalIndex` de los items NO eliminados, en el orden actual
 * del modelo. (R7)
 */
export function resolvePageOrder(model: OrganizeModel): number[] {
  return model.filter((item) => !item.removed).map((item) => item.originalIndex);
}

/** Número de items con `removed === false`. (R8) */
export function remainingCount(model: OrganizeModel): number {
  return model.filter((item) => !item.removed).length;
}

/**
 * Fija `removed` por `originalIndex`: un item queda con `removed === false` si su
 * `originalIndex` está en `selectedOriginalIndices`, y `removed === true` en caso
 * contrario. Preserva el orden actual del modelo y devuelve una estructura NUEVA
 * (nuevo arreglo y nuevos items), sin mutar la entrada. Es el único punto de
 * escritura selección→modelo del selector visual. (R30)
 *
 * Función pura: sin pdf-lib, sin pdf.js, sin DOM, sin React.
 */
export function applySelection(
  model: OrganizeModel,
  selectedOriginalIndices: ReadonlySet<number>,
): OrganizeModel {
  return model.map((item) => ({
    ...item,
    removed: !selectedOriginalIndices.has(item.originalIndex),
  }));
}
