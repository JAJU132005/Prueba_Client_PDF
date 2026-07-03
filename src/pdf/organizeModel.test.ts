import { describe, expect, it } from "vitest";

import {
  applySelection,
  createOrganizeModel,
  movePage,
  remainingCount,
  resolvePageOrder,
  toggleRemoved,
  type OrganizeModel,
} from "@/pdf/organizeModel";

describe("createOrganizeModel", () => {
  it("crea items 0..pageCount-1 en orden ascendente, ninguno eliminado (R1)", () => {
    const model = createOrganizeModel(3);
    expect(model).toEqual([
      { originalIndex: 0, removed: false },
      { originalIndex: 1, removed: false },
      { originalIndex: 2, removed: false },
    ]);
  });

  it("con pageCount 0 devuelve un modelo vacío (R2)", () => {
    expect(createOrganizeModel(0)).toEqual([]);
  });
});

describe("movePage", () => {
  it("reubica el item de `from` en `to` preservando el orden relativo (R3)", () => {
    const model = createOrganizeModel(4);
    const moved = movePage(model, 0, 2);
    expect(moved.map((it) => it.originalIndex)).toEqual([1, 2, 0, 3]);
  });

  it("con `from` o `to` fuera de rango devuelve modelo equivalente sin reordenar (R4)", () => {
    const model = createOrganizeModel(3);
    expect(movePage(model, -1, 1).map((it) => it.originalIndex)).toEqual([
      0, 1, 2,
    ]);
    expect(movePage(model, 1, 5).map((it) => it.originalIndex)).toEqual([
      0, 1, 2,
    ]);
  });

  it("no muta el modelo ni los items de entrada (R9)", () => {
    const model: OrganizeModel = createOrganizeModel(3);
    const snapshot = model.map((it) => ({ ...it }));
    const moved = movePage(model, 0, 2);
    expect(moved).not.toBe(model);
    expect(model.map((it) => ({ ...it }))).toEqual(snapshot);
  });
});

describe("toggleRemoved", () => {
  it("invierte `removed` del item indicado devolviendo nueva estructura (R5)", () => {
    const model = createOrganizeModel(3);
    const toggled = toggleRemoved(model, 1);
    expect(toggled[1].removed).toBe(true);
    expect(toggled[0].removed).toBe(false);
    expect(toggled[2].removed).toBe(false);
  });

  it("con `position` fuera de rango devuelve modelo equivalente sin cambios (R6)", () => {
    const model = createOrganizeModel(2);
    expect(toggleRemoved(model, 5)).toEqual(model);
    expect(toggleRemoved(model, -1)).toEqual(model);
  });

  it("no muta el modelo ni los items de entrada (R9)", () => {
    const model = createOrganizeModel(2);
    const snapshot = model.map((it) => ({ ...it }));
    const toggled = toggleRemoved(model, 0);
    expect(toggled).not.toBe(model);
    expect(model.map((it) => ({ ...it }))).toEqual(snapshot);
    expect(model[0].removed).toBe(false);
  });
});

describe("resolvePageOrder", () => {
  it("devuelve los originalIndex no eliminados en el orden actual tras mover+marcar (R7)", () => {
    let model = createOrganizeModel(4); // [0,1,2,3]
    model = movePage(model, 0, 2); // [1,2,0,3]
    model = toggleRemoved(model, 1); // marca el item en posición 1 (originalIndex 2)
    expect(resolvePageOrder(model)).toEqual([1, 0, 3]);
  });
});

describe("remainingCount", () => {
  it("cuenta los items no eliminados (R8)", () => {
    let model = createOrganizeModel(3);
    expect(remainingCount(model)).toBe(3);
    model = toggleRemoved(model, 0);
    model = toggleRemoved(model, 2);
    expect(remainingCount(model)).toBe(1);
  });
});

describe("applySelection", () => {
  it("conserva (removed=false) los originalIndex seleccionados y elimina el resto (R30)", () => {
    const model = createOrganizeModel(4); // [0,1,2,3]
    const next = applySelection(model, new Set([0, 2]));
    expect(next.map((it) => ({ i: it.originalIndex, r: it.removed }))).toEqual([
      { i: 0, r: false },
      { i: 1, r: true },
      { i: 2, r: false },
      { i: 3, r: true },
    ]);
    // resolvePageOrder refleja solo las conservadas.
    expect(resolvePageOrder(next)).toEqual([0, 2]);
  });

  it("preserva el orden actual del modelo, incluido tras un movePage (R30)", () => {
    let model = createOrganizeModel(4); // [0,1,2,3]
    model = movePage(model, 0, 3); // [1,2,3,0]
    const next = applySelection(model, new Set([0, 3]));
    // El orden visual se mantiene; solo cambia `removed` por originalIndex.
    expect(next.map((it) => it.originalIndex)).toEqual([1, 2, 3, 0]);
    expect(next.map((it) => it.removed)).toEqual([true, true, false, false]);
    // Conservadas en el orden actual: originalIndex 3 (pos 2) y 0 (pos 3).
    expect(resolvePageOrder(next)).toEqual([3, 0]);
  });

  it("no muta el modelo ni los items de entrada (R30)", () => {
    const model = createOrganizeModel(3);
    const snapshot = model.map((it) => ({ ...it }));
    const next = applySelection(model, new Set([1]));
    expect(next).not.toBe(model);
    expect(model.map((it) => ({ ...it }))).toEqual(snapshot);
  });
});
