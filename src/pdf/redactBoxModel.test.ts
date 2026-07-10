import { describe, expect, it } from "vitest";

import {
  addBox,
  boxesForPage,
  createBoxState,
  hitTestBox,
  MIN_BOX_SIZE_NORM,
  moveBox,
  removeBox,
  resizeBox,
  selectBox,
  updateBox,
  type RedactBox,
} from "@/pdf/redactBoxModel";

function box(id: string, over: Partial<RedactBox> = {}): RedactBox {
  return {
    id,
    source: "manual",
    pageIndex: 0,
    left: 0.2,
    top: 0.2,
    width: 0.3,
    height: 0.3,
    ...over,
  };
}

describe("reductores de RedactBoxState (R9, R17, R18)", () => {
  it("addBox añade al final, selecciona y NO muta la entrada", () => {
    const s0 = createBoxState();
    const s1 = addBox(s0, box("a"));
    expect(s1.boxes).toHaveLength(1);
    expect(s1.selectedId).toBe("a");
    // Inmutabilidad: el estado previo no cambió.
    expect(s0.boxes).toHaveLength(0);
    expect(s0.selectedId).toBeNull();
  });

  it("removeBox quita por id y limpia la selección si era la eliminada (R17)", () => {
    let s = addBox(createBoxState(), box("a"));
    s = addBox(s, box("b"));
    const removed = removeBox(s, "b");
    expect(removed.boxes.map((b) => b.id)).toEqual(["a"]);
    expect(removed.selectedId).toBeNull();
    // El estado previo sigue con las 2 cajas (inmutable).
    expect(s.boxes).toHaveLength(2);
  });

  it("updateBox reemplaza la caja del mismo id conservando orden y selección", () => {
    let s = addBox(createBoxState(), box("a"));
    s = addBox(s, box("b"));
    s = selectBox(s, "a");
    const moved = updateBox(s, box("a", { left: 0.6 }));
    expect(moved.boxes[0].left).toBe(0.6);
    expect(moved.boxes.map((b) => b.id)).toEqual(["a", "b"]);
    expect(moved.selectedId).toBe("a");
  });

  it("boxesForPage filtra por página en orden de creación", () => {
    let s = addBox(createBoxState(), box("a", { pageIndex: 0 }));
    s = addBox(s, box("b", { pageIndex: 1 }));
    s = addBox(s, box("c", { pageIndex: 0 }));
    expect(boxesForPage(s, 0).map((b) => b.id)).toEqual(["a", "c"]);
    expect(boxesForPage(s, 1).map((b) => b.id)).toEqual(["b"]);
  });
});

describe("hitTestBox (R12, R18)", () => {
  it("devuelve null cuando el punto no cae en ninguna caja", () => {
    const boxes = [box("a")];
    expect(hitTestBox(boxes, { x: 0.9, y: 0.9 })).toBeNull();
  });

  it("selecciona la caja bajo el punto", () => {
    const boxes = [box("a")];
    expect(hitTestBox(boxes, { x: 0.3, y: 0.3 })?.id).toBe("a");
  });

  it("ante solape, devuelve la MÁS reciente (última añadida) (R12)", () => {
    const boxes = [
      box("old", { left: 0.1, top: 0.1, width: 0.5, height: 0.5 }),
      box("new", { left: 0.2, top: 0.2, width: 0.5, height: 0.5 }),
    ];
    expect(hitTestBox(boxes, { x: 0.35, y: 0.35 })?.id).toBe("new");
  });
});

describe("moveBox (R13, R16, R18)", () => {
  it("traslada por (dx,dy) devolviendo una caja NUEVA sin mutar la entrada", () => {
    const b = box("a", { left: 0.2, top: 0.2, width: 0.3, height: 0.3 });
    const moved = moveBox(b, 0.1, -0.05);
    expect(moved).not.toBe(b);
    expect(moved.left).toBeCloseTo(0.3, 10);
    expect(moved.top).toBeCloseTo(0.15, 10);
    expect(b.left).toBe(0.2); // entrada intacta
  });

  it("reacota a [0,1] conservando el tamaño al salirse del borde (R16)", () => {
    const b = box("a", { left: 0.8, top: 0.8, width: 0.3, height: 0.3 });
    const moved = moveBox(b, 0.5, 0.5);
    expect(moved.left).toBeCloseTo(0.7, 10);
    expect(moved.top).toBeCloseTo(0.7, 10);
    expect(moved.left + moved.width).toBeLessThanOrEqual(1 + 1e-9);
    expect(moved.top + moved.height).toBeLessThanOrEqual(1 + 1e-9);
  });
});

describe("resizeBox (R14, R15, R16, R18)", () => {
  it("mantiene la esquina opuesta fija al arrastrar 'se'", () => {
    const b = box("a", { left: 0.2, top: 0.2, width: 0.3, height: 0.3 });
    // Esquina fija = nw = (0.2,0.2). Arrastramos se a (0.7,0.6).
    const r = resizeBox(b, "se", { x: 0.7, y: 0.6 });
    expect(r.left).toBeCloseTo(0.2, 10);
    expect(r.top).toBeCloseTo(0.2, 10);
    expect(r.width).toBeCloseTo(0.5, 10);
    expect(r.height).toBeCloseTo(0.4, 10);
  });

  it("mantiene la esquina opuesta fija al arrastrar 'nw' (mueve origen)", () => {
    const b = box("a", { left: 0.2, top: 0.2, width: 0.3, height: 0.3 });
    // Esquina fija = se = (0.5,0.5). Arrastramos nw a (0.3,0.35).
    const r = resizeBox(b, "nw", { x: 0.3, y: 0.35 });
    expect(r.left).toBeCloseTo(0.3, 10);
    expect(r.top).toBeCloseTo(0.35, 10);
    expect(r.width).toBeCloseTo(0.2, 10);
    expect(r.height).toBeCloseTo(0.15, 10);
  });

  it("aplica el tamaño mínimo (nunca ancho/alto cero) (R15)", () => {
    const b = box("a", { left: 0.2, top: 0.2, width: 0.3, height: 0.3 });
    // Arrastrar se casi sobre la esquina fija nw.
    const r = resizeBox(b, "se", { x: 0.2, y: 0.2 });
    expect(r.width).toBeGreaterThanOrEqual(MIN_BOX_SIZE_NORM - 1e-12);
    expect(r.height).toBeGreaterThanOrEqual(MIN_BOX_SIZE_NORM - 1e-12);
  });

  it("acota a [0,1] cuando el arrastre se sale de la página (R16) y no muta la entrada", () => {
    const b = box("a", { left: 0.2, top: 0.2, width: 0.3, height: 0.3 });
    const r = resizeBox(b, "se", { x: 1.5, y: 1.5 });
    expect(r).not.toBe(b);
    expect(r.left).toBeGreaterThanOrEqual(0);
    expect(r.top).toBeGreaterThanOrEqual(0);
    expect(r.left + r.width).toBeLessThanOrEqual(1 + 1e-9);
    expect(r.top + r.height).toBeLessThanOrEqual(1 + 1e-9);
    expect(b.width).toBe(0.3); // entrada intacta
  });
});
