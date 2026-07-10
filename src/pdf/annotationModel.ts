/**
 * Estado PURO del editor de anotaciones (#23): lista inmutable de anotaciones +
 * la seleccionada. Reductores sin mutación (análogo a `pageSelection.ts` /
 * `organizeModel`). Sin React, sin DOM, sin pdf-lib: es el núcleo testeable del
 * lienzo `AnnotationEditor`. (R4, R6, R7, R8, R9, R10, R11, R12)
 */

import type { Annotation } from "@/pdf/annotate";

/** Herramientas de anotación disponibles (una por `kind`). (R7–R12) */
export type AnnotationTool =
  | "text"
  | "highlight"
  | "freehand"
  | "line"
  | "rect"
  | "image";

/** Lista canónica de herramientas, en orden. */
export const ANNOTATION_TOOLS: readonly AnnotationTool[] = [
  "text",
  "highlight",
  "freehand",
  "line",
  "rect",
  "image",
];

/** Estado inmutable del editor: anotaciones colocadas + la seleccionada. */
export interface AnnotationEditorState {
  readonly annotations: readonly Annotation[];
  readonly selectedId: string | null;
}

/** Estado inicial vacío. */
export function createAnnotationState(): AnnotationEditorState {
  return { annotations: [], selectedId: null };
}

/**
 * Añade `annotation` al final y la marca como seleccionada, devolviendo un
 * estado NUEVO (no muta la entrada). Cada anotación conserva su `pageIndex` y su
 * discriminante `kind`. (R6, R7–R12)
 */
export function addAnnotation(
  state: AnnotationEditorState,
  annotation: Annotation,
): AnnotationEditorState {
  return {
    annotations: [...state.annotations, annotation],
    selectedId: annotation.id,
  };
}

/**
 * Quita la anotación con `id` (si existe), devolviendo un estado NUEVO. Si era
 * la seleccionada, la selección queda vacía.
 */
export function removeAnnotation(
  state: AnnotationEditorState,
  id: string,
): AnnotationEditorState {
  return {
    annotations: state.annotations.filter((a) => a.id !== id),
    selectedId: state.selectedId === id ? null : state.selectedId,
  };
}

/**
 * Reemplaza la anotación con el mismo `id` por `annotation` (mover/redimensionar/
 * editar texto), devolviendo un estado NUEVO sin mutar la entrada. Conserva el
 * orden y la selección. Si no existe ninguna con ese `id`, el estado no cambia.
 * (R19, R35)
 */
export function updateAnnotation(
  state: AnnotationEditorState,
  annotation: Annotation,
): AnnotationEditorState {
  return {
    annotations: state.annotations.map((a) =>
      a.id === annotation.id ? annotation : a,
    ),
    selectedId: state.selectedId,
  };
}

/** Marca `id` como seleccionada (o `null` para deseleccionar). */
export function selectAnnotation(
  state: AnnotationEditorState,
  id: string | null,
): AnnotationEditorState {
  return { annotations: state.annotations, selectedId: id };
}

/** Anotaciones asociadas a `pageIndex`, en orden de creación. (R6) */
export function annotationsForPage(
  state: AnnotationEditorState,
  pageIndex: number,
): Annotation[] {
  return state.annotations.filter((a) => a.pageIndex === pageIndex);
}
