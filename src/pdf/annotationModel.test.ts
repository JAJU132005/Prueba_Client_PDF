import { describe, expect, it } from "vitest";

import type { Annotation, AnnotationColor } from "@/pdf/annotate";
import {
  addAnnotation,
  annotationsForPage,
  createAnnotationState,
  removeAnnotation,
  selectAnnotation,
  updateAnnotation,
} from "@/pdf/annotationModel";

const BLACK: AnnotationColor = { r: 0, g: 0, b: 0 };

/** Una anotación de cada uno de los 6 tipos, asociada a la página `pageIndex`. */
function sampleAnnotations(pageIndex: number): Annotation[] {
  return [
    {
      id: "text",
      pageIndex,
      kind: "text",
      at: { x: 1, y: 2 },
      text: "hola",
      fontSize: 12,
      color: BLACK,
    },
    {
      id: "highlight",
      pageIndex,
      kind: "highlight",
      at: { x: 3, y: 4 },
      width: 10,
      height: 5,
      color: BLACK,
      opacity: 0.4,
    },
    {
      id: "freehand",
      pageIndex,
      kind: "freehand",
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      color: BLACK,
      thickness: 1,
    },
    {
      id: "line",
      pageIndex,
      kind: "line",
      start: { x: 0, y: 0 },
      end: { x: 2, y: 2 },
      color: BLACK,
      thickness: 1,
    },
    {
      id: "rect",
      pageIndex,
      kind: "rect",
      at: { x: 5, y: 6 },
      width: 20,
      height: 30,
      color: BLACK,
      thickness: 1,
    },
    {
      id: "image",
      pageIndex,
      kind: "image",
      at: { x: 7, y: 8 },
      width: 40,
      height: 40,
      data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    },
  ];
}

describe("annotationModel — reductores (R4, R6, R7, R8, R9, R10, R11, R12)", () => {
  it("añade cada uno de los 6 tipos asociado a su página, sin mutar la entrada", () => {
    let state = createAnnotationState();
    const input = state;
    for (const annotation of sampleAnnotations(2)) {
      state = addAnnotation(state, annotation);
    }
    // No mutó el estado inicial.
    expect(input.annotations).toHaveLength(0);
    expect(state.annotations).toHaveLength(6);
    const kinds = state.annotations.map((a) => a.kind);
    expect(kinds).toEqual([
      "text",
      "highlight",
      "freehand",
      "line",
      "rect",
      "image",
    ]);
    // Cada anotación conserva su página. (R6)
    for (const a of state.annotations) {
      expect(a.pageIndex).toBe(2);
    }
  });

  it("annotationsForPage filtra por índice de página (R6)", () => {
    let state = createAnnotationState();
    state = addAnnotation(state, sampleAnnotations(0)[0]);
    state = addAnnotation(state, sampleAnnotations(1)[4]);
    expect(annotationsForPage(state, 0).map((a) => a.kind)).toEqual(["text"]);
    expect(annotationsForPage(state, 1).map((a) => a.kind)).toEqual(["rect"]);
  });

  it("quita una anotación por id devolviendo un estado nuevo", () => {
    let state = createAnnotationState();
    for (const a of sampleAnnotations(0)) {
      state = addAnnotation(state, a);
    }
    const before = state;
    const after = removeAnnotation(state, "line");
    expect(before.annotations).toHaveLength(6);
    expect(after.annotations).toHaveLength(5);
    expect(after.annotations.some((a) => a.id === "line")).toBe(false);
  });

  it("selectAnnotation fija la selección sin tocar la lista", () => {
    let state = createAnnotationState();
    state = addAnnotation(state, sampleAnnotations(0)[0]);
    const selected = selectAnnotation(state, null);
    expect(selected.selectedId).toBeNull();
    expect(selected.annotations).toBe(state.annotations);
  });

  it("updateAnnotation reemplaza por id, sin mutar y conservando la selección (R19, R35)", () => {
    let state = createAnnotationState();
    for (const a of sampleAnnotations(0)) {
      state = addAnnotation(state, a);
    }
    state = selectAnnotation(state, "rect");
    const before = state;

    const movedRect: Annotation = {
      id: "rect",
      pageIndex: 0,
      kind: "rect",
      at: { x: 99, y: 99 },
      width: 20,
      height: 30,
      color: BLACK,
      thickness: 1,
    };
    const after = updateAnnotation(state, movedRect);

    // Reemplaza en su posición, conserva orden y longitud.
    expect(after.annotations).toHaveLength(6);
    expect(after.annotations.map((a) => a.id)).toEqual(
      before.annotations.map((a) => a.id),
    );
    const replaced = after.annotations.find((a) => a.id === "rect");
    expect(replaced && replaced.kind === "rect" && replaced.at).toEqual({
      x: 99,
      y: 99,
    });
    // Conserva la selección.
    expect(after.selectedId).toBe("rect");
    // No muta la entrada.
    const originalRect = before.annotations.find((a) => a.id === "rect");
    expect(originalRect && originalRect.kind === "rect" && originalRect.at).toEqual(
      { x: 5, y: 6 },
    );
  });

  it("updateAnnotation deja el estado igual si no existe el id (R35)", () => {
    let state = createAnnotationState();
    state = addAnnotation(state, sampleAnnotations(0)[0]);
    const ghost: Annotation = {
      id: "no-existe",
      pageIndex: 0,
      kind: "text",
      at: { x: 0, y: 0 },
      text: "x",
      fontSize: 12,
      color: BLACK,
    };
    const after = updateAnnotation(state, ghost);
    expect(after.annotations.map((a) => a.id)).toEqual(["text"]);
  });

  it("cada anotación creada es un objeto plano serializable (R4)", () => {
    for (const annotation of sampleAnnotations(1)) {
      // Sobrevive a JSON y a structuredClone: sin funciones ni refs a React/DOM.
      const viaJson = JSON.parse(JSON.stringify(annotation)) as Record<
        string,
        unknown
      >;
      expect(viaJson.kind).toBe(annotation.kind);
      expect(viaJson.pageIndex).toBe(annotation.pageIndex);
      const cloned = structuredClone(annotation);
      expect(cloned.kind).toBe(annotation.kind);
      expect(cloned.id).toBe(annotation.id);
    }
  });
});
